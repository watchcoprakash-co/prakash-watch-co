"""Progress reporting.

The graph never writes to the console — it emits events. The CLI renders them as
log lines; the FastAPI server forwards the same events to the browser as SSE.
"""

from __future__ import annotations

from typing import Any, Callable

from .util import format_usd

EventHandler = Callable[[dict[str, Any]], None]


class EventBus:
    def __init__(self) -> None:
        self._handlers: list[EventHandler] = []

    def on(self, handler: EventHandler) -> Callable[[], None]:
        self._handlers.append(handler)
        return lambda: self._handlers.remove(handler)

    def emit(self, event: dict[str, Any]) -> None:
        for handler in list(self._handlers):
            try:
                handler(event)
            except Exception:  # noqa: BLE001 - a broken listener must not stop a run
                pass


DIM = "\x1b[2m{}\x1b[0m"
BOLD = "\x1b[1m{}\x1b[0m"
GREEN = "\x1b[32m{}\x1b[0m"
YELLOW = "\x1b[33m{}\x1b[0m"
RED = "\x1b[31m{}\x1b[0m"
CYAN = "\x1b[36m{}\x1b[0m"


def console_reporter(event: dict[str, Any]) -> None:
    """Human-readable renderer used by the CLI."""
    kind = event.get("type")

    if kind == "run:start":
        dry = YELLOW.format("  (dry run — no network, no spend)") if event["dryRun"] else ""
        print(
            f"\n{BOLD.format('Catalog ingestion')} {DIM.format('run ' + event['runId'])}\n"
            f"  file    {event['file']}\n"
            f"  rows    {event['rows']}{dry}"
        )
    elif kind == "run:models":
        print(
            f"  models  {event['model']} {DIM.format('· vision')} {event['visionModel']} "
            f"{DIM.format('· search')} {event['searchModel']}\n"
        )
    elif kind == "sheet:parsed":
        source = DIM.format("  from: " + ", ".join(event["sheets"])) if event["sheets"] else ""
        print(f"{DIM.format('sheet')}  {event['rows']} usable row(s), {event['rejected']} rejected{source}")
        for skipped in event.get("skippedSheets", []):
            print(DIM.format(f"        skipped tab \"{skipped['sheet']}\" — {skipped['reason']}"))
        if event.get("unmapped"):
            print(DIM.format("        ignored columns: " + ", ".join(event["unmapped"])))
    elif kind == "row:start":
        print(f"\n{CYAN.format('▶')} {BOLD.format(event['label'])} {DIM.format(event['sku'])}")
    elif kind == "row:stage":
        print(f"  {DIM.format(event['stage'].ljust(9))} {event['detail']}")
    elif kind == "row:warn":
        print(f"  {YELLOW.format('!')}         {event['message']}")
    elif kind == "row:done":
        status = event["status"]
        mark = GREEN.format("✓") if status == "ready" else DIM.format("·") if status == "skipped" else YELLOW.format("~")
        seconds = event["elapsedMs"] / 1000
        trailer = DIM.format(f"{format_usd(event['costUsd'])} · {seconds:.1f}s")
        print(f"  {mark} {status.ljust(12)} {event['images']} image(s) {trailer}")
    elif kind == "row:fail":
        print(f"  {RED.format('✗')} {RED.format(event['message'])}")
    elif kind == "budget:exceeded":
        print(
            f"\n{RED.format('Budget reached')} — spent {format_usd(event['spentUsd'])} of "
            f"{format_usd(event['limitUsd'])}. Remaining rows skipped."
        )
    elif kind == "run:done":
        print(
            f"\n{BOLD.format('Done.')} {GREEN.format(str(event['ready']) + ' ready')} · "
            f"{YELLOW.format(str(event['needsReview']) + ' need review')} · "
            # Only shown when a sheet actually revised something already listed,
            # so an ordinary run reads no differently.
            + (f"{event['updated']} updated · " if event.get("updated") else "")
            + f"{event['failed']} failed · {event['skipped']} skipped · {format_usd(event['costUsd'])}\n"
        )
