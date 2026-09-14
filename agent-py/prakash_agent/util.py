"""Small shared helpers. No agent-specific logic here."""

from __future__ import annotations

import asyncio
import hashlib
import json
import random
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Iterable, TypeVar

T = TypeVar("T")

_MONEY_NOISE = re.compile(r"\b(?:rs|inr|rupees)\b\.?", re.IGNORECASE)
_NUMBER = re.compile(r"-?\d+(?:\.\d+)?")
_MM = re.compile(r"(\d+(?:\.\d+)?)\s*(mm|cm)?", re.IGNORECASE)
_YEAR = re.compile(r"\b(?:19|20)\d{2}\b")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sha256(value: str | bytes) -> str:
    data = value.encode("utf-8") if isinstance(value, str) else value
    return hashlib.sha256(data).hexdigest()


def slugify(value: str) -> str:
    normalised = unicodedata.normalize("NFKD", value)
    stripped = "".join(ch for ch in normalised if not unicodedata.combining(ch))
    slug = re.sub(r"[^a-z0-9]+", "-", stripped.lower()).strip("-")
    return slug[:80]


def make_sku(brand: str, model_number: str) -> str:
    """Brand + reference is the natural key: one reference is never two watches."""
    base = f"{slugify(brand)}-{slugify(model_number)}".strip("-")
    return base or f"watch-{sha256(brand + model_number)[:10]}"


def parse_count(value: Any) -> int | None:
    """Reads a quantity, where zero is a number and not an absence.

    Distinct from parse_money on purpose: a price of nought is meaningless and is
    rejected, but a quantity of nought is the shop saying "sold out", and reading
    it as "no value" left delisted stock showing as available.
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return max(0, int(round(value)))
    if not isinstance(value, str):
        return None
    match = _NUMBER.search(value.replace(",", "").strip())
    return max(0, int(round(float(match.group())))) if match else None


def parse_money(value: Any) -> float | None:
    """Reads money the way Indian retail sheets write it: ₹12,999 · Rs. 12999/- · 12,999.00."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if value > 0 else None
    if not isinstance(value, str):
        return None

    cleaned = value.replace("₹", "").replace("$", "")
    cleaned = _MONEY_NOISE.sub("", cleaned)
    cleaned = cleaned.replace(",", "").replace("/-", "").strip()

    match = _NUMBER.search(cleaned)
    if not match:
        return None
    number = float(match.group())
    return number if number > 0 else None


def parse_mm(value: Any) -> float | None:
    """Reads '42', '42mm', '42 mm', '4.2cm' as millimetres."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if not isinstance(value, str):
        return None
    match = _MM.search(value)
    if not match:
        return None
    number = float(match.group(1))
    return number * 10 if (match.group(2) or "").lower() == "cm" else number


def parse_year(value: str | None) -> int | None:
    if not value:
        return None
    match = _YEAR.search(value)
    return int(match.group()) if match else None


def squish(value: str | None) -> str:
    return re.sub(r"\s+", " ", value).strip() if value else ""


def truncate(value: str, limit: int) -> str:
    return value if len(value) <= limit else value[: limit - 1].rstrip() + "…"


def uniq_by(items: Iterable[T], key: Callable[[T], str]) -> list[T]:
    seen: set[str] = set()
    out: list[T] = []
    for item in items:
        k = key(item)
        if k in seen:
            continue
        seen.add(k)
        out.append(item)
    return out


def clamp01(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, number))


def format_usd(amount: float) -> str:
    if amount == 0:
        return "$0"
    return f"${amount:.4f}" if amount < 0.01 else f"${amount:.2f}"


def format_inr(amount: float | None) -> str:
    """Indian digit grouping: 1,23,456.

    Accepts None because a watch ingested from a brand master has no price until
    the shop sets one, and every caller would otherwise need the same guard.
    """
    if amount is None:
        return "—"
    whole = int(round(amount))
    text = str(abs(whole))
    if len(text) > 3:
        head, tail = text[:-3], text[-3:]
        head = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)
        text = f"{head},{tail}"
    return f"₹{'-' if whole < 0 else ''}{text}"


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def read_json(path: Path) -> Any | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


async def retry(
    fn: Callable[[], Awaitable[T]],
    *,
    attempts: int = 3,
    base_delay: float = 0.7,
    max_delay: float = 12.0,
    should_retry: Callable[[BaseException], bool] | None = None,
) -> T:
    """Exponential backoff with jitter."""
    last: BaseException | None = None
    for attempt in range(1, attempts + 1):
        try:
            return await fn()
        except BaseException as error:  # noqa: BLE001 - re-raised below
            last = error
            if attempt == attempts or (should_retry and not should_retry(error)):
                break
            delay = min(max_delay, base_delay * 2 ** (attempt - 1)) * (0.7 + random.random() * 0.6)
            await asyncio.sleep(delay)
    assert last is not None
    raise last
