"""OpenRouter client.

Everything the agent asks a model to do goes through here, so model resolution,
JSON-schema enforcement, retries, caching and cost accounting happen once.
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any

import httpx

from .cache import Cache
from .config import MODEL_FALLBACKS, SEARCH_FALLBACKS, VISION_FALLBACKS, AgentConfig
from .util import retry, truncate

API_BASE = "https://openrouter.ai/api/v1"
MODELS_TTL_S = 6 * 60 * 60

_FENCE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


class OpenRouterError(RuntimeError):
    def __init__(self, message: str, status: int = 0, retryable: bool = False) -> None:
        super().__init__(message)
        self.status = status
        self.retryable = retryable


def extract_json(text: str) -> str:
    """Strips fences and prose that some providers wrap around JSON."""
    trimmed = text.strip()
    fenced = _FENCE.search(trimmed)
    body = (fenced.group(1) if fenced else trimmed).strip()
    if body.startswith("{") or body.startswith("["):
        return body

    starts = [i for i in (body.find("{"), body.find("[")) if i != -1]
    if not starts:
        return body
    start = min(starts)
    end = max(body.rfind("}"), body.rfind("]"))
    return body[start : end + 1] if end > start else body[start:]


class OpenRouterClient:
    def __init__(self, config: AgentConfig, cache: Cache) -> None:
        self.config = config
        self.cache = cache
        self.spent_usd = 0.0
        self._models: list[dict[str, Any]] | None = None
        self.model = config.model
        self.vision_model = config.vision_model
        self.search_model = config.search_model
        self._client = httpx.AsyncClient(timeout=max(config.timeout_s, 90.0))

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _list_models(self) -> list[dict[str, Any]]:
        if self._models is not None:
            return self._models

        cached = self.cache.get_json("models", "catalog", MODELS_TTL_S)
        if cached is not None:
            self._models = cached
            return cached

        response = await self._client.get(
            f"{API_BASE}/models", headers={"authorization": f"Bearer {self.config.api_key}"}
        )
        if response.status_code != 200:
            raise OpenRouterError(f"Could not load the model list (HTTP {response.status_code}).", response.status_code)
        self._models = response.json().get("data", [])
        self.cache.set_json("models", "catalog", self._models)
        return self._models

    async def prepare(self) -> list[str]:
        """Confirms the configured models exist, falling back rather than failing a run."""
        if not self.config.api_key:
            raise OpenRouterError("OPENROUTER_API_KEY is not set. Add it to .env before a live run.", 401)

        available = {m["id"] for m in await self._list_models()}
        notes: list[str] = []

        def pick(preferred: str, fallbacks: tuple[str, ...], label: str) -> str:
            if preferred in available:
                return preferred
            for candidate in fallbacks:
                if candidate in available:
                    notes.append(f'{label} model "{preferred}" is unavailable — using "{candidate}" instead.')
                    return candidate
            raise OpenRouterError(f"No {label} model available from: {(preferred, *fallbacks)}", 404)

        self.model = pick(self.config.model, MODEL_FALLBACKS, "extraction")
        self.vision_model = pick(self.config.vision_model, VISION_FALLBACKS, "vision")
        self.search_model = pick(self.config.search_model, SEARCH_FALLBACKS, "search")
        return notes

    def _estimate_cost(self, model: str, prompt_tokens: int, completion_tokens: int) -> float:
        info = next((m for m in (self._models or []) if m["id"] == model), None)
        pricing = (info or {}).get("pricing", {})
        try:
            return prompt_tokens * float(pricing.get("prompt", 0)) + completion_tokens * float(
                pricing.get("completion", 0)
            )
        except (TypeError, ValueError):
            return 0.0

    async def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        try:
            response = await self._client.post(
                f"{API_BASE}/chat/completions",
                headers={
                    "authorization": f"Bearer {self.config.api_key}",
                    "content-type": "application/json",
                    "http-referer": self.config.app_url,
                    "x-title": self.config.app_title,
                },
                json=body,
            )
        except httpx.HTTPError as error:
            raise OpenRouterError(f"Network error talking to OpenRouter: {error}", 0, True) from error

        try:
            payload = response.json()
        except ValueError as error:
            raise OpenRouterError(
                f"OpenRouter returned a non-JSON response (HTTP {response.status_code}): "
                f"{truncate(response.text, 200)}",
                response.status_code,
                response.status_code >= 500,
            ) from error

        if response.status_code >= 400 or payload.get("error"):
            error_obj = payload.get("error") or {}
            message = error_obj.get("message") or f"HTTP {response.status_code}"
            status = error_obj.get("code") or response.status_code
            if status in (401, 403):
                raise OpenRouterError(f"OpenRouter rejected the API key: {message}", status)
            if status == 402:
                raise OpenRouterError(f"OpenRouter account is out of credit: {message}", status)
            raise OpenRouterError(f"OpenRouter error: {message}", status, status == 429 or status >= 500)

        return payload

    async def chat(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        max_tokens: int = 4000,
        schema: dict[str, Any] | None = None,
        web: dict[str, Any] | None = None,
        fresh: bool = False,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"model": model, "messages": messages, "max_tokens": max_tokens}

        if schema is not None:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": schema["name"], "strict": True, "schema": schema["schema"]},
            }
        if web is not None:
            body["plugins"] = [{"id": "web", **web}]

        cache_key = json.dumps(body, sort_keys=True)
        if not fresh:
            cached = self.cache.get_json("llm", cache_key)
            if cached is not None:
                return {**cached, "cached": True, "costUsd": 0.0}

        payload = await retry(
            lambda: self._post(body),
            attempts=3,
            base_delay=2.0,
            should_retry=lambda e: isinstance(e, OpenRouterError) and e.retryable,
        )

        choices = payload.get("choices") or []
        if not choices:
            raise OpenRouterError("OpenRouter returned no choices.", 502, True)

        message = choices[0].get("message") or {}
        if message.get("refusal"):
            raise OpenRouterError(f"Model refused the request: {message['refusal']}")

        raw = message.get("content")
        if isinstance(raw, list):
            text = "".join(part if isinstance(part, str) else (part or {}).get("text", "") for part in raw)
        else:
            text = raw or ""

        finish_reason = choices[0].get("finish_reason") or "stop"
        if finish_reason == "length" and not text.strip():
            raise OpenRouterError("Model hit the token limit before producing output. Raise max_tokens.")

        usage = payload.get("usage") or {}
        cost = usage.get("cost")
        cost_usd = (
            float(cost)
            if isinstance(cost, (int, float))
            else self._estimate_cost(model, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0))
        )
        self.spent_usd += cost_usd

        citations = [
            {
                "url": str(a["url_citation"]["url"]),
                "title": str(a["url_citation"].get("title", "")),
                "content": str(a["url_citation"].get("content", "")),
            }
            for a in (message.get("annotations") or [])
            if a.get("type") == "url_citation" and (a.get("url_citation") or {}).get("url")
        ]

        result = {"text": text, "citations": citations, "costUsd": cost_usd, "finishReason": finish_reason}
        self.cache.set_json("llm", cache_key, result)
        return {**result, "cached": False}

    async def chat_json(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        schema: dict[str, Any],
        max_tokens: int = 4000,
    ) -> tuple[dict[str, Any], float]:
        """Schema-constrained completion, parsed defensively and repaired once."""
        first = await self.chat(model=model, messages=messages, max_tokens=max_tokens, schema=schema)
        try:
            return json.loads(extract_json(first["text"])), first["costUsd"]
        except (json.JSONDecodeError, ValueError):
            pass

        if not first["text"].strip():
            raise OpenRouterError(
                f"Model returned an empty response for \"{schema['name']}\" "
                f"(finish_reason: {first['finishReason']})."
            )

        repair = await self.chat(
            model=model,
            max_tokens=max_tokens,
            schema=schema,
            fresh=True,
            messages=[
                *messages,
                {"role": "assistant", "content": first["text"]},
                {
                    "role": "user",
                    "content": (
                        "That reply was not valid JSON for the required schema. Reply again with the JSON "
                        "object only — no prose, no markdown fences, no trailing commas."
                    ),
                },
            ],
        )
        try:
            return json.loads(extract_json(repair["text"])), first["costUsd"] + repair["costUsd"]
        except (json.JSONDecodeError, ValueError) as error:
            raise OpenRouterError(
                f"Model did not return valid JSON for \"{schema['name']}\" after a repair attempt: {error}"
            ) from error

    async def search(self, query: str, max_results: int = 6, engine: str | None = None) -> dict[str, Any]:
        """Web search via OpenRouter's plugin. Returns citations plus cost."""
        chosen = engine or self.config.search_engine
        web: dict[str, Any] = {"max_results": max_results, "engine": chosen}
        if chosen == "parallel":
            web["mode"] = self.config.search_mode

        result = await self.chat(
            model=self.search_model,
            max_tokens=700,
            web=web,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a product research assistant. Using the web results provided, list the URLs of "
                        "pages that describe the exact product asked about — official brand pages and authorised "
                        "retailer product pages first. Output one URL per line and nothing else."
                    ),
                },
                {"role": "user", "content": query},
            ],
        )

        # Annotations are the reliable channel, but some engines return none, so the
        # assistant's plain-text URL list is merged in as a backup.
        citations = list(result["citations"])
        known = {c["url"] for c in citations}
        for url in re.findall(r"https?://[^\s<>\"')]+", result["text"]):
            if url not in known:
                known.add(url)
                citations.append({"url": url, "title": "", "content": ""})

        return {"citations": citations, "costUsd": result["costUsd"], "cached": result.get("cached", False)}


async def gather_bounded(tasks: list, limit: int) -> list:
    """Runs awaitables with bounded concurrency, preserving order."""
    semaphore = asyncio.Semaphore(max(1, limit))

    async def run(task):
        async with semaphore:
            return await task

    return await asyncio.gather(*(run(t) for t in tasks), return_exceptions=True)
