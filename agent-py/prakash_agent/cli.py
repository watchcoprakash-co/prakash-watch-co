"""Command line entry point.

    python -m prakash_agent "../STOCK DETAILS FOR WEBSITE.xlsx"
    python -m prakash_agent sheet.xlsx --limit 3
    python -m prakash_agent sheet.xlsx --dry-run
    python -m prakash_agent --template ../watch-stock-template.xlsx
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

from .config import REPO_ROOT, load_config
from .events import console_reporter
from .graph import run_ingestion
from .sheet import write_template

SHEET_SUFFIXES = (".xlsx", ".csv", ".xls")


def find_sheet() -> Path | None:
    """Newest spreadsheet in the repo root, when no path was given."""
    found: list[tuple[float, Path]] = []
    for directory in (Path.cwd(), REPO_ROOT):
        if not directory.is_dir():
            continue
        for entry in directory.iterdir():
            if entry.name.startswith("~$") or entry.suffix.lower() not in SHEET_SUFFIXES:
                continue
            try:
                found.append((entry.stat().st_mtime, entry))
            except OSError:
                continue
    found.sort(reverse=True)
    return found[0][1] if found else None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="prakash_agent",
        description="Turns a stock spreadsheet into listable watch artifacts.",
    )
    parser.add_argument("file", nargs="?", help="Path to the .xlsx or .csv stock list")
    parser.add_argument("--template", metavar="PATH", help="Write a starter spreadsheet and exit")
    parser.add_argument("--dry-run", action="store_true", help="Parse and assemble with no network call or spend")
    parser.add_argument("--limit", type=int, help="Only process the first N rows")
    parser.add_argument("--only", help="Comma-separated brands or references to include")
    parser.add_argument("--force", action="store_true", help="Re-process rows that already have an artifact")
    parser.add_argument("--no-cache", action="store_true", help="Ignore the on-disk cache")
    parser.add_argument("--reference-images", action="store_true", help="Record image URLs instead of downloading")
    parser.add_argument("--concurrency", type=int, help="Rows processed at once")
    parser.add_argument("--images", type=int, help="Max images kept per watch")
    parser.add_argument("--sources", type=int, help="Max pages read per watch")
    parser.add_argument("--engine", help="Search backend: parallel (cheapest), exa, native")
    parser.add_argument("--model", help="Override the extraction model")
    parser.add_argument("--budget", type=float, help="Stop the run once this much has been spent (USD)")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.template:
        target = Path(args.template).resolve()
        write_template(target)
        print(f"Template written to {target}")
        print("Fill in Brand, Model No and Price for each watch, then run:  python -m prakash_agent <file>")
        return 0

    path = Path(args.file).resolve() if args.file else find_sheet()
    if path is None:
        print(
            "No spreadsheet given and none found in the project.\n"
            "Pass one:  python -m prakash_agent ../stock.xlsx\n"
            "Or create a starter file:  python -m prakash_agent --template ../stock.xlsx",
            file=sys.stderr,
        )
        return 1
    if not args.file:
        print(f"Using the most recent spreadsheet found: {path}")

    if not args.dry_run and not os.getenv("OPENROUTER_API_KEY"):
        print("OPENROUTER_API_KEY is not set. Add it to .env, or run with --dry-run.", file=sys.stderr)
        return 1

    overrides: dict[str, object] = {"dry_run": args.dry_run, "force": args.force}
    if args.no_cache:
        overrides["cache"] = False
    if args.reference_images:
        overrides["image_mode"] = "reference"
    if args.concurrency:
        overrides["concurrency"] = args.concurrency
    if args.images:
        overrides["max_images"] = args.images
    if args.sources:
        overrides["max_sources"] = args.sources
    if args.engine:
        overrides["search_engine"] = args.engine
    if args.model:
        overrides["model"] = args.model
    if args.budget is not None:
        overrides["budget_usd"] = args.budget

    config = load_config(**overrides)
    only = [part.strip() for part in args.only.split(",") if part.strip()] if args.only else None

    try:
        report = asyncio.run(
            run_ingestion(path, config=config, on_event=console_reporter, limit=args.limit, only=only)
        )
    except (ValueError, RuntimeError) as error:
        print(f"\nIngestion could not run: {error}\n", file=sys.stderr)
        return 1

    print(f"Report:    nextjs/data/runs/{report.run_id}.md")
    print("Artifacts: nextjs/data/catalog/*.json")
    print("Images:    nextjs/public/catalog/<sku>/\n")
    return 2 if report.counts.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
