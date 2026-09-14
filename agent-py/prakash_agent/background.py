"""Separating the watch from whatever it was photographed on.

Product shots arrive on a dozen different backgrounds — one retailer's pure white,
another's light grey gradient, a marketplace's watermarked cream. Listing them
side by side looks like a jumble sale. So rather than publish what we were given,
the watch is cut out of its background and stored on transparency, and the
backdrop becomes a decision the shop makes once, for the whole catalogue, instead
of one the photographer made for us.

Cutting out is only attempted when the background really is plain, which is the
common case for product photography. A busy or lifestyle shot is left untouched —
a bad cutout that eats half a bracelet is far worse than an honest photograph.
"""

from __future__ import annotations

from dataclasses import dataclass

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

#: Colours used to mark flood-filled background. Tried in order; one that already
#: appears in the image would corrupt the mask, so each is checked before use.
SENTINELS = ((255, 0, 255), (0, 255, 0), (255, 255, 0), (0, 255, 255))

#: Above this variation within one corner the background is not flat.
PLAIN_STDDEV_LIMIT = 14.0

#: How far the four corners may differ before the background is read as a gradient.
CORNER_AGREEMENT_LIMIT = 20.0

#: A flood that leaves more than this much of the frame standing has not really
#: taken hold — usually a gradient that stopped the fill partway.
MAX_KEPT_FRACTION = 0.82

#: How close a pixel must be to the border colour to count as background.
FLOOD_TOLERANCE = 32


@dataclass(frozen=True)
class BackgroundReport:
    is_plain: bool
    colour: tuple[int, int, int]
    stddev: float
    is_light: bool


def analyse_background(image: Image.Image) -> BackgroundReport:
    """Judges what the watch was shot against, by reading the four corners.

    Corners rather than full edge strips: a watch photographed tightly touches the
    middle of an edge, and including it makes a perfectly plain background look
    noisy. Corners are nearly always background.

    Two things have to hold for a flood fill to work. Each corner must be
    internally flat, and the corners must agree with one another — if the top is a
    different colour from the bottom, the background is a gradient, and a
    fixed-tolerance flood will stop halfway up it and leave a halo around the watch.
    """
    rgb = image.convert("RGB")
    width, height = rgb.size
    patch = max(4, min(width, height) // 12)

    corners = [
        rgb.crop((0, 0, patch, patch)),
        rgb.crop((width - patch, 0, width, patch)),
        rgb.crop((0, height - patch, patch, height)),
        rgb.crop((width - patch, height - patch, width, height)),
    ]

    means = [ImageStat.Stat(c).mean[:3] for c in corners]
    flatness = max(max(ImageStat.Stat(c).stddev[:3]) for c in corners)
    # How far apart the corners are, per channel — high means a gradient or a scene.
    spread = max(max(m[c] for m in means) - min(m[c] for m in means) for c in range(3))

    colour = tuple(int(round(sum(m[c] for m in means) / len(means))) for c in range(3))
    return BackgroundReport(
        is_plain=flatness <= PLAIN_STDDEV_LIMIT and spread <= CORNER_AGREEMENT_LIMIT,
        colour=colour,  # type: ignore[arg-type]
        stddev=max(flatness, spread),
        is_light=sum(colour) / 3 >= 128,
    )


def _pick_sentinel(rgb: Image.Image) -> tuple[int, int, int] | None:
    """Finds a marker colour that does not already occur in the image."""
    for sentinel in SENTINELS:
        solid = Image.new("RGB", rgb.size, sentinel)
        low, _ = ImageChops.difference(rgb, solid).convert("L").getextrema()
        if low > 0:
            return sentinel
    return None


def cut_out(image: Image.Image, tolerance: int = FLOOD_TOLERANCE) -> Image.Image | None:
    """Returns the watch on transparency, or None if it could not be separated.

    Works by flooding inward from the edges rather than by keying on colour, so a
    white dial or a steel bracelet link is kept even when the background is also
    white — only background actually connected to the border is removed.
    """
    rgb = image.convert("RGB")
    sentinel = _pick_sentinel(rgb)
    if sentinel is None:
        return None

    canvas = rgb.copy()
    width, height = canvas.size

    # Seed from the corners and the middle of each edge: enough to catch a
    # background split by the subject without reaching into the watch itself.
    seeds = [
        (0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1),
        (width // 2, 0), (width // 2, height - 1), (0, height // 2), (width - 1, height // 2),
    ]
    for seed in seeds:
        try:
            ImageDraw.floodfill(canvas, seed, sentinel, thresh=tolerance)
        except ValueError:
            continue

    solid = Image.new("RGB", canvas.size, sentinel)
    # 0 where the pixel was flooded (background), non-zero everywhere else.
    difference = ImageChops.difference(canvas, solid).convert("L")
    alpha = difference.point(lambda value: 0 if value == 0 else 255)

    # Refuse implausible masks: a cutout that keeps almost nothing, or almost
    # everything, means the flood either ate the watch or never took hold. The
    # upper bound is the one that matters — it catches the gradient case, where
    # the fill stops partway and leaves a ring of old background around the watch.
    kept = ImageStat.Stat(alpha).mean[0] / 255
    if not 0.04 <= kept <= MAX_KEPT_FRACTION:
        return None

    # Pull the edge in by a pixel to kill the pale halo the original background
    # leaves behind, then soften it so the cutout does not look stamped out.
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))

    result = image.convert("RGBA")
    result.putalpha(alpha)
    return result


def trim_and_centre(image: Image.Image, size: int, margin: float = 0.08) -> Image.Image:
    """Crops to the subject and centres it on a square transparent canvas.

    This is what makes a grid of watches look like one catalogue: every reference
    ends up the same size in the same frame, however it was cropped at source.
    """
    rgba = image.convert("RGBA")
    box = rgba.getchannel("A").getbbox()
    if box:
        rgba = rgba.crop(box)

    # Scale to fit rather than thumbnail: thumbnail only ever shrinks, so a
    # low-resolution source would sit small in the frame while a large one filled
    # it, and the grid would look ragged. Every watch gets the same presence.
    inner = max(1, int(size * (1 - margin * 2)))
    scale = min(inner / max(1, rgba.width), inner / max(1, rgba.height))
    target = (max(1, round(rgba.width * scale)), max(1, round(rgba.height * scale)))
    rgba = rgba.resize(target, Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(rgba, ((size - rgba.width) // 2, (size - rgba.height) // 2), rgba)
    return canvas


#: Named backdrops. Values are solid colours or (top, bottom) vertical gradients.
PRESETS: dict[str, tuple | str] = {
    # Tuned to the site's own tokens so listings sit on the page, not on top of it.
    "studio-dark": ("#15120f", "#0b0a09"),
    "panel": "#100e0d",
    "ink": "#080807",
    # Light options, for when the shop wants a classic white catalogue look.
    "studio-light": ("#ffffff", "#eeeae5"),
    "white": "#ffffff",
    "bone": "#f6f2ee",
}


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _gradient(size: tuple[int, int], top: str, bottom: str) -> Image.Image:
    """Cheap vertical gradient: a 1px column stretched across the canvas."""
    width, height = size
    top_rgb, bottom_rgb = _hex_to_rgb(top), _hex_to_rgb(bottom)
    column = Image.new("RGB", (1, height))
    pixels = column.load()
    assert pixels is not None
    for y in range(height):
        blend = y / max(1, height - 1)
        pixels[0, y] = tuple(  # type: ignore[index]
            int(round(top_rgb[c] + (bottom_rgb[c] - top_rgb[c]) * blend)) for c in range(3)
        )
    return column.resize((width, height), Image.Resampling.BILINEAR)


def compose(cutout: Image.Image, background: str, shadow: bool = True) -> Image.Image:
    """Places a transparent cutout on a chosen backdrop.

    `background` is a preset name, a hex colour, or "transparent" to keep alpha.
    """
    if background == "transparent":
        return cutout.convert("RGBA")

    spec = PRESETS.get(background, background)
    if isinstance(spec, tuple):
        canvas = _gradient(cutout.size, spec[0], spec[1]).convert("RGBA")
    else:
        canvas = Image.new("RGBA", cutout.size, (*_hex_to_rgb(spec), 255))

    if shadow:
        # A soft contact shadow, offset downward, so the watch sits on the surface
        # rather than floating in front of it.
        alpha = cutout.getchannel("A")
        blur = max(6, cutout.size[0] // 60)
        soft = alpha.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(v * 0.45))
        shade = Image.new("RGBA", cutout.size, (0, 0, 0, 0))
        shade.putalpha(soft)
        canvas.alpha_composite(shade, (0, max(2, cutout.size[1] // 90)))

    canvas.alpha_composite(cutout.convert("RGBA"))
    return canvas


def existing_alpha(image: Image.Image) -> Image.Image | None:
    """Returns the image if it already carries a usable cutout.

    A surprising share of brand and press photography is published as transparent
    PNG — in this catalogue, a third of everything found. That alpha channel was
    cut by the brand's own retoucher, so it beats anything reconstructed here.
    """
    if image.mode not in ("RGBA", "LA") and "transparency" not in image.info:
        return None

    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    low, _ = alpha.getextrema()
    if low > 250:
        return None  # An alpha channel that is fully opaque tells us nothing.

    transparent = 1 - ImageStat.Stat(alpha).mean[0] / 255
    # Guard against a nearly-empty asset, or a token 1% rounded corner.
    if not 0.03 <= transparent <= 0.96:
        return None
    return rgba


def prepare(
    image: Image.Image,
    *,
    size: int,
    background: str,
    attempt_cutout: bool,
    vision_background: str | None = None,
) -> tuple[Image.Image, bool, str]:
    """Full treatment for one photograph.

    Preference order, safest first:

    1. The image already has an alpha channel — use it untouched.
    2. The background is genuinely plain — flood it away.
    3. Anything else — publish the photograph as it was taken. A cutout that eats
       half a bracelet is far worse than an honest picture of a watch on a desk.
    """
    cutout = existing_alpha(image)
    source = "supplied" if cutout is not None else None

    if cutout is None and attempt_cutout:
        # The vision grader has already looked at this picture and said whether the
        # backdrop is plain, a gradient or a scene. That judgement is far more
        # reliable than pixel statistics, which cannot tell a black backdrop from a
        # black vignette, so a flood is only attempted on a confirmed plain shot.
        plain = analyse_background(image).is_plain
        if vision_background is not None:
            plain = vision_background == "plain"
        if plain:
            cutout = cut_out(image)
            source = "cutout" if cutout is not None else None

    if cutout is None:
        # Publish the photograph as taken, but still letterbox it onto the same
        # square canvas as everything else — a grid of mismatched crops reads as
        # careless even when each individual picture is fine.
        fitted = image.convert("RGBA")
        fitted.thumbnail((size, size), Image.Resampling.LANCZOS)
        if background == "transparent":
            canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        else:
            canvas = compose(Image.new("RGBA", (size, size), (0, 0, 0, 0)), background, shadow=False)
        canvas.paste(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2), fitted)
        return canvas, background == "transparent", "original"

    centred = trim_and_centre(cutout, size)
    composed = compose(centred, background)
    return composed, background == "transparent", background
