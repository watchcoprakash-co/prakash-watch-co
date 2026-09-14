"""Run reports.

The JSON file is for the admin panel; the Markdown file is for whoever decides
which listings are safe to publish. It leads with what needs attention.
"""

from __future__ import annotations

from pathlib import Path

from .config import AgentConfig
from .models import REVIEW_FLAG_EXPLANATIONS, RunReport
from .util import format_inr, format_usd, write_json


def render_markdown(report: RunReport) -> str:
    counts = report.counts
    lines: list[str] = [
        f"# Catalog ingestion — {report.run_id}",
        "",
        f"- **Source sheet:** {report.source_file}",
        f"- **Started:** {report.started_at}",
        f"- **Model:** {report.model}{' (dry run)' if report.dry_run else ''}",
        f"- **Spend:** {format_usd(report.cost_usd)}",
        "",
        f"**{counts.ready} ready** · {counts.needs_review} need review · "
        + (f"{counts.updated} updated · " if counts.updated else "")
        + f"{counts.failed} failed · "
        f"{counts.skipped} skipped · {counts.images_saved} images saved",
        "",
    ]

    if report.sheet_errors:
        lines += [f"## Rows that could not be read ({len(report.sheet_errors)})", "", "| Sheet | Row | Problem | Values |", "| --- | --- | --- | --- |"]
        for error in report.sheet_errors:
            values = ", ".join(f"{k}={v}" for k, v in error.raw.items() if v) or "—"
            lines.append(f"| {error.sheet} | {error.row_number} | {'; '.join(error.problems)} | {values} |")
        lines.append("")

    failed = [r for r in report.results if r.status == "failed"]
    if failed:
        lines += [f"## Failed ({len(failed)})", ""]
        lines += [f"- **{r.sku}** (row {r.row_number}) — {r.error}" for r in failed]
        lines.append("")

    review = [r for r in report.results if r.status == "needs_review" and r.product]
    if review:
        lines += [f"## Need a look before publishing ({len(review)})", ""]
        for result in review:
            product = result.product
            assert product is not None
            lines += [
                f"### {product.title} — `{product.model_number}`",
                "",
                f"{format_inr(product.price.selling)} · {len(product.images)} image(s) · "
                f"confidence {product.confidence.overall * 100:.0f}%",
                "",
            ]
            for flag in product.review.flags:
                lines.append(f"- `{flag}` — {REVIEW_FLAG_EXPLANATIONS.get(flag, 'See artifact.')}")
            lines += [f"- {note}" for note in product.review.notes[:3]]
            lines.append("")

    ready = [r for r in report.results if r.status == "ready" and r.product]
    if ready:
        lines += [
            f"## Ready to publish ({len(ready)})",
            "",
            "| Watch | Reference | Price | Images | Confidence |",
            "| --- | --- | --- | --- | --- |",
        ]
        for result in ready:
            product = result.product
            assert product is not None
            lines.append(
                f"| {product.title} | `{product.model_number}` | {format_inr(product.price.selling)} | "
                f"{len(product.images)} | {product.confidence.overall * 100:.0f}% |"
            )
        lines.append("")

    return "\n".join(lines) + "\n"


def write_report(report: RunReport, config: AgentConfig) -> dict[str, Path]:
    report_dir = Path(config.report_dir)
    report_dir.mkdir(parents=True, exist_ok=True)

    json_path = report_dir / f"{report.run_id}.json"
    markdown_path = report_dir / f"{report.run_id}.md"

    write_json(json_path, report.dump())
    markdown_path.write_text(render_markdown(report), encoding="utf-8")
    return {"json": json_path, "markdown": markdown_path}
