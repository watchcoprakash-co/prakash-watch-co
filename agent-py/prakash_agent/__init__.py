"""Prakash Watch Co. catalog ingestion agent.

Public surface: import from here and nowhere deeper.
"""

from .config import COLLECTION_META, COLLECTIONS, AgentConfig, load_config
from .events import EventBus, console_reporter
from .graph import build_run_graph, build_watch_graph, run_ingestion
from .models import CatalogEntry, RunReport, SheetParseResult, WatchProduct
from .sheet import parse_sheet, write_template

__all__ = [
    "AgentConfig",
    "CatalogEntry",
    "COLLECTIONS",
    "COLLECTION_META",
    "EventBus",
    "RunReport",
    "SheetParseResult",
    "WatchProduct",
    "build_run_graph",
    "build_watch_graph",
    "console_reporter",
    "load_config",
    "parse_sheet",
    "run_ingestion",
    "write_template",
]
