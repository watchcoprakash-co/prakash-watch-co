"""Disk cache for anything expensive: page fetches, model replies, image bytes.

Re-running a sheet after fixing three rows should not re-pay for the other two
hundred, so every network boundary goes through here.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from .util import sha256


class Cache:
    def __init__(self, root: Path, enabled: bool = True) -> None:
        self.root = root
        self.enabled = enabled
        self.hits = 0
        self.misses = 0

    def _path(self, namespace: str, key: str, ext: str) -> Path:
        return self.root / namespace / f"{sha256(key)}.{ext}"

    def get_json(self, namespace: str, key: str, max_age_s: float | None = None) -> Any | None:
        if not self.enabled:
            return None
        path = self._path(namespace, key, "json")
        try:
            if max_age_s is not None and time.time() - path.stat().st_mtime > max_age_s:
                self.misses += 1
                return None
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            self.misses += 1
            return None
        self.hits += 1
        return value

    def set_json(self, namespace: str, key: str, value: Any) -> None:
        if not self.enabled:
            return
        path = self._path(namespace, key, "json")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value), encoding="utf-8")

    def get_bytes(self, namespace: str, key: str) -> bytes | None:
        if not self.enabled:
            return None
        try:
            data = self._path(namespace, key, "bin").read_bytes()
        except OSError:
            self.misses += 1
            return None
        self.hits += 1
        return data

    def set_bytes(self, namespace: str, key: str, value: bytes) -> None:
        if not self.enabled:
            return
        path = self._path(namespace, key, "bin")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(value)
