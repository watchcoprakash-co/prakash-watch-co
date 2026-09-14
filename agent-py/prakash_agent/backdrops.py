"""A library of backdrops, and the logic that matches one to a watch.

Designed from the catalogue rather than from taste. Measured across the shop's
own stock: 15 watches are neutral (steel, black, white), 12 are blue, and 19 of 29
are darker than mid-grey. Two things follow.

* **Luminance decides legibility.** Most of these watches are dark, and the site
  is dark, so a dark watch on a dark card disappears. The matcher's first job is
  to put a dark watch on a lighter backdrop and a bright steel one on a deeper
  backdrop — contrast before prettiness.
* **Hue must not collide.** With blue the second most common colour, a blue watch
  on a blue backdrop is a real risk, so a backdrop sharing the watch's hue is
  penalised and a warm neutral is preferred.

Backdrops are generated once as image files and referenced by every listing that
suits them, so the shop can restyle the whole catalogue by regenerating six files
rather than reprocessing two hundred photographs.
"""

from __future__ import annotations

import colorsys
import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

from .util import write_json


@dataclass(frozen=True)
class Backdrop:
    id: str
    name: str
    #: Outer and inner colours of a soft radial wash.
    outer: str
    inner: str
    #: Roughly where this sits from black (0) to white (1); the matcher's main axis.
    luminance: float
    #: Dominant hue in degrees, or None when the backdrop is neutral.
    hue: float | None
    note: str


#: Six backdrops, all within the house's dark editorial register. Between them
#: they cover bright steel through to matte black cases without ever going pale.
LIBRARY: tuple[Backdrop, ...] = (
    Backdrop("ink", "Ink", "#050505", "#141210", 0.07, None,
             "Deepest of the set. For bright steel and white dials."),
    Backdrop("graphite", "Graphite", "#0d0e10", "#24262b", 0.13, 220.0,
             "Cool near-black. For gold, bronze and warm dials."),
    Backdrop("bronze", "Bronze", "#120c07", "#3a2412", 0.16, 28.0,
             "Warm amber glow. Complements blue dials without competing."),
    Backdrop("slate", "Slate", "#12151a", "#333a44", 0.21, 215.0,
             "Cool mid grey. For warm metals and black resin."),
    Backdrop("stone", "Stone", "#17151220", "#4a443c", 0.27, 35.0,
             "Warm mid stone. Lifts black and dark grey watches off the page."),
    Backdrop("clay", "Clay", "#1a1310", "#5b463a", 0.31, 20.0,
             "Lightest of the set, warm and earthy. For matte black cases."),
)

BY_ID = {backdrop.id: backdrop for backdrop in LIBRARY}


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")[:6]
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def render(backdrop: Backdrop, size: int = 1200) -> Image.Image:
    """Paints one backdrop: a soft off-centre radial wash, lightly grained.

    The light sits slightly above centre so a watch placed in the middle appears
    lit from above, the way a shop's counter lights it.
    """
    outer = _hex_to_rgb(backdrop.outer)
    inner = _hex_to_rgb(backdrop.inner)

    # Painted small and scaled up: the gradient is smooth, so this costs nothing
    # visually and avoids a per-pixel loop over a million points.
    small = 96
    canvas = Image.new("RGB", (small, small), outer)
    pixels = canvas.load()
    assert pixels is not None

    centre_x, centre_y = small / 2, small * 0.42
    longest = (small**2 + small**2) ** 0.5 / 2

    for y in range(small):
        for x in range(small):
            distance = ((x - centre_x) ** 2 + (y - centre_y) ** 2) ** 0.5 / longest
            # Eased falloff, so the centre stays open and the corners sink away.
            blend = max(0.0, min(1.0, 1 - distance)) ** 1.6
            pixels[x, y] = tuple(  # type: ignore[index]
                int(round(outer[c] + (inner[c] - outer[c]) * blend)) for c in range(3)
            )

    canvas = canvas.resize((size, size), Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(size / 200))

    # A whisper of grain, matching the film grain the site already lays over itself.
    grain = Image.effect_noise((size, size), 8).convert("L").point(lambda v: 128 + (v - 128) // 12)
    canvas = Image.composite(canvas, canvas.point(lambda v: min(255, v + 4)), grain)

    # A soft floor shadow, so the watch reads as standing on a surface.
    shade = Image.new("L", (size, size), 0)
    ImageDraw.Draw(shade).ellipse(
        (size * 0.18, size * 0.74, size * 0.82, size * 0.92), fill=70
    )
    shade = shade.filter(ImageFilter.GaussianBlur(size / 28))
    canvas = Image.composite(Image.new("RGB", (size, size), (0, 0, 0)), canvas, shade)
    return canvas


def css_gradient(backdrop: Backdrop) -> str:
    """An equivalent CSS wash, so a card renders instantly before the image loads."""
    return f"radial-gradient(120% 100% at 50% 42%, {backdrop.inner} 0%, {backdrop.outer} 70%)"


def generate_library(image_dir: Path, data_path: Path, size: int = 1200) -> list[dict]:
    """Writes every backdrop once and records the index the site reads."""
    image_dir.mkdir(parents=True, exist_ok=True)
    entries: list[dict] = []

    for backdrop in LIBRARY:
        render(backdrop, size).save(image_dir / f"{backdrop.id}.webp", format="WEBP", quality=88)
        entries.append(
            {
                "id": backdrop.id,
                "name": backdrop.name,
                "url": f"/media/_backdrops/{backdrop.id}.webp",
                "css": css_gradient(backdrop),
                "luminance": backdrop.luminance,
                "hue": backdrop.hue,
                "note": backdrop.note,
            }
        )

    write_json(data_path, entries)
    return entries


def watch_profile(image: Image.Image) -> dict[str, float | None]:
    """Reads the watch's own colour, ignoring whatever it was photographed on."""
    small = image.convert("RGBA").resize((72, 72), Image.Resampling.LANCZOS)
    pixels = small.load()
    assert pixels is not None

    opaque = [
        (r, g, b)
        for y in range(72)
        for x in range(72)
        for (r, g, b, a) in (pixels[x, y],)  # type: ignore[misc]
        if a > 200
    ]
    if not opaque:
        return {"luminance": 0.5, "saturation": 0.0, "hue": None}

    lightness = sum(colorsys.rgb_to_hls(r / 255, g / 255, b / 255)[1] for r, g, b in opaque) / len(opaque)
    saturation = sum(colorsys.rgb_to_hls(r / 255, g / 255, b / 255)[2] for r, g, b in opaque) / len(opaque)

    # Hue is only meaningful for pixels with real colour in them; a steel bracelet
    # would otherwise drag the average somewhere arbitrary.
    coloured = [
        colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        for r, g, b in opaque
        if colorsys.rgb_to_hls(r / 255, g / 255, b / 255)[2] > 0.25
    ]
    hue = None
    if len(coloured) > len(opaque) * 0.12:
        # Circular mean, so reds either side of 0° do not average to cyan.
        import math

        xs = sum(math.cos(h * 2 * math.pi) for h, _, _ in coloured)
        ys = sum(math.sin(h * 2 * math.pi) for h, _, _ in coloured)
        hue = (math.degrees(math.atan2(ys, xs)) + 360) % 360

    return {"luminance": lightness, "saturation": saturation, "hue": hue}


def _hue_distance(a: float, b: float) -> float:
    """Shortest way round the colour wheel, in degrees."""
    return min(abs(a - b), 360 - abs(a - b))


def choose(profile: dict[str, float | None], library: tuple[Backdrop, ...] = LIBRARY) -> tuple[str, str]:
    """Picks the backdrop that shows this watch best. Returns (id, reason)."""
    luminance = float(profile.get("luminance") or 0.5)
    hue = profile.get("hue")

    # A dark watch wants a lighter ground and a bright one a deeper ground. This
    # aims at a fixed separation rather than a fixed target, so the choice tracks
    # the watch rather than the average of the catalogue.
    wanted = 0.34 if luminance < 0.35 else 0.27 if luminance < 0.5 else 0.16 if luminance < 0.68 else 0.07

    best: tuple[float, Backdrop] | None = None
    for backdrop in library:
        score = -abs(backdrop.luminance - wanted) * 10

        if hue is not None and backdrop.hue is not None:
            distance = _hue_distance(float(hue), backdrop.hue)
            # Same hue as the watch reads as camouflage; near-opposite flatters it.
            if distance < 40:
                score -= 3.0
            elif distance > 120:
                score += 1.2

        # Neutral watches — most of this catalogue — look best on a little warmth.
        if hue is None and backdrop.hue is not None and 0 <= backdrop.hue <= 60:
            score += 0.8

        if best is None or score > best[0]:
            best = (score, backdrop)

    assert best is not None
    chosen = best[1]
    tone = "dark" if luminance < 0.4 else "bright" if luminance > 0.6 else "mid-tone"
    hue_note = f", hue {int(hue)}°" if hue is not None else ", neutral"
    return chosen.id, f"{tone} watch{hue_note} → {chosen.name}"
