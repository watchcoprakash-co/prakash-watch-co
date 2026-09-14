"""Outbound HTTP for the research stage.

Third-party sites are someone else's infrastructure, so every request is throttled
per host, identified by a real User-Agent, bounded by a timeout, and checked
against robots.txt before a page is read.
"""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from urllib.parse import urlparse

from typing import Any

import httpx

from .cache import Cache
from .config import AgentConfig
from .util import retry

ROBOTS_TTL_S = 24 * 60 * 60
PAGE_TTL_S = 7 * 24 * 60 * 60


class RobotsRules:
    def __init__(self, allow: list[str], disallow: list[str]) -> None:
        self.allow = allow
        self.disallow = disallow

    def allows(self, path: str) -> bool:
        def longest(patterns: list[str]) -> int:
            best = -1
            for pattern in patterns:
                prefix = pattern.rstrip("*")
                if path.startswith(prefix) and len(prefix) > best:
                    best = len(prefix)
            return best

        deny = longest(self.disallow)
        if deny < 0:
            return True
        return longest(self.allow) >= deny


def parse_robots(text: str, bot_token: str) -> RobotsRules:
    """Reads the `*` group plus any group naming our bot, longest-match wins."""
    star = RobotsRules([], [])
    specific = RobotsRules([], [])
    active_star = False
    active_specific = False

    for raw_line in text.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip().lower()
        value = value.strip()

        if key == "user-agent":
            agent = value.lower()
            active_star = agent == "*"
            active_specific = agent != "*" and agent in bot_token.lower()
            continue
        if not value:
            continue

        target = specific if active_specific else star if active_star else None
        if target is None:
            continue
        if key == "disallow":
            target.disallow.append(value)
        elif key == "allow":
            target.allow.append(value)

    return specific if (specific.allow or specific.disallow) else star


class HostThrottle:
    """Keeps a minimum gap between requests to the same host."""

    def __init__(self, delay_s: float) -> None:
        self.delay_s = delay_s
        self._locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        self._last: dict[str, float] = {}

    async def wait(self, host: str) -> None:
        async with self._locks[host]:
            gap = self.delay_s - (time.monotonic() - self._last.get(host, 0.0))
            if gap > 0:
                await asyncio.sleep(gap)
            self._last[host] = time.monotonic()


class HttpClient:
    def __init__(self, config: AgentConfig, cache: Cache) -> None:
        self.config = config
        self.cache = cache
        self.throttle = HostThrottle(config.host_delay_s)
        self._robots: dict[str, RobotsRules | None] = {}
        self._client = httpx.AsyncClient(
            follow_redirects=True,
            timeout=config.timeout_s,
            headers={"user-agent": config.user_agent, "accept-language": "en-IN,en;q=0.9"},
            limits=httpx.Limits(max_connections=20),
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _robots_for(self, origin: str) -> RobotsRules | None:
        if origin in self._robots:
            return self._robots[origin]

        cached = self.cache.get_json("robots", origin, ROBOTS_TTL_S)
        if cached is not None:
            rules = None if cached.get("text") is None else parse_robots(cached["text"], self.config.user_agent)
            self._robots[origin] = rules
            return rules

        text: str | None = None
        try:
            await self.throttle.wait(urlparse(origin).netloc)
            response = await self._client.get(f"{origin}/robots.txt")
            text = response.text if response.status_code == 200 else None
        except httpx.HTTPError:
            text = None

        self.cache.set_json("robots", origin, {"text": text})
        rules = None if text is None else parse_robots(text, self.config.user_agent)
        self._robots[origin] = rules
        return rules

    async def is_allowed(self, url: str) -> bool:
        if not self.config.respect_robots:
            return True
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            return False
        rules = await self._robots_for(f"{parsed.scheme}://{parsed.netloc}")
        # No published robots.txt means no published restrictions.
        return True if rules is None else rules.allows(parsed.path or "/")

    async def _request(self, url: str, headers: dict[str, str] | None = None) -> httpx.Response:
        host = urlparse(url).netloc

        async def once() -> httpx.Response:
            await self.throttle.wait(host)
            response = await self._client.get(url, headers=headers)
            if response.status_code == 429 or response.status_code >= 500:
                raise httpx.HTTPStatusError(
                    f"HTTP {response.status_code}", request=response.request, response=response
                )
            return response

        return await retry(once, attempts=3, base_delay=1.5)

    async def get_html(self, url: str) -> dict[str, str] | None:
        """Fetches a page as text, honouring robots.txt and the disk cache."""
        cached = self.cache.get_json("page", url, PAGE_TTL_S)
        if cached is not None:
            return None if cached.get("failed") else cached

        if not await self.is_allowed(url):
            self.cache.set_json("page", url, {"failed": True})
            return None

        try:
            response = await self._request(url, {"accept": "text/html,application/xhtml+xml"})
            if response.status_code >= 400:
                raise httpx.HTTPError(f"HTTP {response.status_code}")
            content_type = response.headers.get("content-type", "")
            if "html" not in content_type.lower():
                raise httpx.HTTPError(f"unexpected content-type {content_type}")
            result = {"html": response.text, "finalUrl": str(response.url)}
        except (httpx.HTTPError, UnicodeDecodeError):
            self.cache.set_json("page", url, {"failed": True})
            return None

        self.cache.set_json("page", url, result)
        return result

    async def get_json(self, url: str) -> Any | None:
        """Fetches a JSON document, with the same robots and caching rules as a page.

        Separate from get_html because that one insists on an HTML content-type —
        correct for scraping, wrong for a storefront's product feed, which is the
        one source that reliably identifies a reference.
        """
        cached = self.cache.get_json("doc", url, PAGE_TTL_S)
        if cached is not None:
            return None if isinstance(cached, dict) and cached.get("__failed") else cached

        if not await self.is_allowed(url):
            self.cache.set_json("doc", url, {"__failed": True})
            return None

        try:
            response = await self._request(url, {"accept": "application/json"})
            if response.status_code >= 400:
                raise httpx.HTTPError(f"HTTP {response.status_code}")
            payload = response.json()
        except (httpx.HTTPError, UnicodeDecodeError, ValueError):
            self.cache.set_json("doc", url, {"__failed": True})
            return None

        self.cache.set_json("doc", url, payload)
        return payload

    async def get_binary(self, url: str, max_bytes: int) -> tuple[bytes, str] | None:
        """Downloads with a hard size ceiling, abandoning oversized responses."""
        meta = self.cache.get_json("asset-meta", url)
        if meta is not None:
            if meta.get("failed"):
                return None
            data = self.cache.get_bytes("asset", url)
            if data is not None:
                return data, meta.get("contentType", "")

        try:
            host = urlparse(url).netloc
            await self.throttle.wait(host)
            async with self._client.stream("GET", url, headers={"accept": "image/*"}) as response:
                if response.status_code >= 400:
                    raise httpx.HTTPError(f"HTTP {response.status_code}")
                content_type = response.headers.get("content-type", "").split(";")[0].strip()
                declared = int(response.headers.get("content-length") or 0)
                if declared > max_bytes:
                    raise httpx.HTTPError("asset too large")

                chunks: list[bytes] = []
                total = 0
                async for chunk in response.aiter_bytes():
                    total += len(chunk)
                    if total > max_bytes:
                        raise httpx.HTTPError("asset exceeded size limit")
                    chunks.append(chunk)
            data = b"".join(chunks)
        except (httpx.HTTPError, ValueError):
            self.cache.set_json("asset-meta", url, {"failed": True})
            return None

        self.cache.set_bytes("asset", url, data)
        self.cache.set_json("asset-meta", url, {"contentType": content_type})
        return data, content_type
