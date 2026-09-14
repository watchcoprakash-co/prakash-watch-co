"""Spreadsheet ingestion.

The client types their stock list the way they always have, so the parser adapts
to the sheet rather than demanding a template. What the real file taught us:

* One tab per brand, and the tabs disagree with each other. A CASIO tab heads its
  columns BRAND / MODEL NO / Amount / MRP; the SEIKO tab beside it uses
  Group / MODEL NO / MRP and quotes no selling price at all.
* "Group" means brand and "Amount" means the discounted selling price.
* When only MRP is quoted, MRP is the shelf price.
* The header row often carries the brand's website, which is the single most
  useful hint for finding the right product page later.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Any

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

from .models import SheetParseResult, SheetRow, SheetRowError
from .util import parse_count, parse_money, squish

Canonical = str

ALIASES: dict[Canonical, tuple[str, ...]] = {
    # "group" is what distributor stock lists call the brand column.
    "brand": ("brand", "brandname", "make", "manufacturer", "company", "watchbrand", "group"),
    "modelNumber": (
        "modelno", "modelnumber", "model", "modelcode", "ref", "refno", "reference",
        "referenceno", "referencenumber", "stylecode", "styleno", "itemcode",
        "productcode", "articleno", "articlecode", "sku", "skucode",
    ),
    "modelName": ("modelname", "productname", "name", "watchname", "title", "series"),
    "price": (
        "price", "sellingprice", "saleprice", "ourprice", "offerprice", "priceinr",
        "pricers", "rate", "netprice", "finalprice",
        # Indian stock lists head the discounted selling price "Amount". Read as a
        # unit price; a line total would misprice a multi-unit row.
        "amount", "netamount", "unitprice",
    ),
    "costPrice": (
        "cost", "costprice", "purchaseprice", "purchaserate", "buyingprice", "landedcost",
        "dealerprice", "wholesaleprice", "netcost", "basicprice",
    ),
    "mrp": ("mrp", "listprice", "retailprice", "marketprice", "maximumretailprice", "strikeprice"),
    "gender": ("gender", "for", "genderfor", "targetgender", "menwomen"),
    "collectionHint": ("collection", "category", "type", "family", "watchtype", "segment"),
    "quantity": ("qty", "quantity", "stock", "stockqty", "units", "available", "instock"),
    "productUrl": ("url", "producturl", "link", "productlink", "sourceurl", "website", "productpage"),
    "imageUrls": ("image", "images", "imageurl", "imageurls", "photo", "photos", "imagelink", "imagelinks", "picture"),
    "notes": ("notes", "note", "remarks", "remark", "comment", "comments", "description"),
}

ALIAS_TO_FIELD: dict[str, Canonical] = {
    alias: field for field, aliases in ALIASES.items() for alias in aliases
}

REQUIRED_ANY_PRICE = ("price", "mrp")
_URL = re.compile(r"^https?://\S+$", re.IGNORECASE)


def _normalise_header(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def _cell_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, (int, float)):
        return str(value)
    return str(value).strip()


def _extract_urls(text: str) -> list[str]:
    if not text:
        return []
    parts = re.split(r"[\s,;|]+", text)
    return [p.strip().rstrip("),.") for p in parts if _URL.match(p.strip().rstrip("),."))]


class Grid:
    """A worksheet flattened to 1-indexed rows of text, with hyperlinks resolved."""

    def __init__(self, name: str, rows: list[list[str]]) -> None:
        self.name = name
        self.rows = rows

    @property
    def row_count(self) -> int:
        return len(self.rows)

    def row(self, index: int) -> list[str]:
        """1-indexed, returns [] past the end."""
        return self.rows[index - 1] if 1 <= index <= len(self.rows) else []

    def cell(self, row_index: int, column_index: int) -> str:
        row = self.row(row_index)
        return row[column_index] if 0 <= column_index < len(row) else ""


def _load_grids(path: Path) -> list[Grid]:
    suffix = path.suffix.lower()

    if suffix == ".csv":
        with path.open(newline="", encoding="utf-8-sig") as handle:
            rows = [[""] + [squish(cell) for cell in row] for row in csv.reader(handle)]
        return [Grid(path.stem, rows)]

    if suffix == ".xls":
        raise ValueError(
            "Legacy .xls files are not supported. Open the file in Excel or Google Sheets, "
            "save it as .xlsx, and run again."
        )

    workbook = load_workbook(path, data_only=True, read_only=False)
    grids: list[Grid] = []
    for worksheet in workbook.worksheets:
        rows: list[list[str]] = []
        for row in worksheet.iter_rows():
            # Column 0 is unused so indices line up with spreadsheet columns.
            values = [""]
            for cell in row:
                text = _cell_text(cell.value)
                if not text and getattr(cell, "hyperlink", None) is not None:
                    text = str(cell.hyperlink.target or "")
                values.append(text)
            rows.append(values)
        grids.append(Grid(worksheet.title, rows))
    workbook.close()
    return grids


def _header_score(cells: list[str]) -> int:
    return sum(1 for cell in cells if _normalise_header(cell or "") in ALIAS_TO_FIELD)


def _find_header_row(grid: Grid) -> int:
    """Returns the 1-indexed header row, or 0 when there isn't one."""
    best_row, best_score = 0, 1  # Require at least two recognised headers.
    for index in range(1, min(grid.row_count, 15) + 1):
        score = _header_score(grid.row(index))
        if score > best_score:
            best_row, best_score = index, score
    return best_row


def parse_sheet(path: str | Path) -> SheetParseResult:
    """Reads every worksheet that has a recognisable header row."""
    path = Path(path)
    grids = _load_grids(path)

    rows: list[SheetRow] = []
    errors: list[SheetRowError] = []
    header_map: dict[str, str] = {}
    unmapped: list[str] = []
    used_sheets: list[str] = []
    skipped: list[dict[str, str]] = []
    seen: dict[str, str] = {}

    for grid in grids:
        header_row = _find_header_row(grid)
        if not header_row:
            skipped.append({"sheet": grid.name, "reason": "no recognisable header row"})
            continue

        # Stock lists note the brand's website in or above the header row. It is not
        # a data column, but it tells the agent exactly where to look.
        brand_site: str | None = None
        for probe in range(1, header_row + 1):
            for cell in grid.row(probe):
                found = _extract_urls(cell)
                if found:
                    brand_site = found[0]
                    break
            if brand_site:
                break

        columns: dict[Canonical, int] = {}
        for column_index, label in enumerate(grid.row(header_row)):
            if not label:
                continue
            field = ALIAS_TO_FIELD.get(_normalise_header(label))
            # Leftmost column wins when two headers claim the same field.
            if field and field not in columns:
                columns[field] = column_index
                header_map[f"{grid.name} · {label}"] = field
            else:
                unmapped.append(f"{grid.name} · {label}")

        if "modelNumber" not in columns:
            skipped.append({"sheet": grid.name, "reason": "no model number column"})
            continue

        # A tab that only quotes MRP is still usable: MRP becomes the shelf price.
        # A tab with no price at all is usable too — a brand master is a list of
        # what exists, not of what it costs. Those rows are researched and held
        # unpriced; nothing without a price can be published.
        price_field = next((f for f in REQUIRED_ANY_PRICE if f in columns), None)
        mrp_is_price = price_field == "mrp"

        def read(row_index: int, field: Canonical) -> str:
            index = columns.get(field)
            return grid.cell(row_index, index) if index is not None else ""

        used_here = 0
        for row_index in range(header_row + 1, grid.row_count + 1):
            # Tabs are usually named for the brand, covering sheets with no brand column.
            brand = squish(read(row_index, "brand")) or squish(grid.name)
            model_number = squish(read(row_index, "modelNumber"))
            price_text = read(row_index, price_field) if price_field else ""

            # A completely empty line is spacing, not an error.
            if not model_number and not price_text:
                continue

            raw = {field: read(row_index, field) for field in columns}
            problems: list[str] = []
            if not brand:
                problems.append("missing brand")
            if not model_number:
                problems.append("missing model number")

            # Only complain about a price when the sheet claimed to have one: a
            # column of blanks is a mistake, a missing column is a decision.
            price = parse_money(price_text)
            if price is None and price_field is not None:
                problems.append(f'unreadable price "{price_text}"' if price_text else "missing price")

            key = f"{brand.lower()}|{model_number.lower()}"
            if not problems:
                if key in seen:
                    problems.append(f"duplicate of {seen[key]}")
                else:
                    seen[key] = f"{grid.name} row {row_index}"

            if problems:
                errors.append(SheetRowError(row_number=row_index, sheet=grid.name, raw=raw, problems=problems))
                continue

            quantity = parse_count(read(row_index, "quantity"))
            product_urls = _extract_urls(read(row_index, "productUrl"))

            rows.append(
                SheetRow(
                    row_number=row_index,
                    sheet=grid.name,
                    brand=brand,
                    model_number=model_number,
                    price=None if price is None else float(price),
                    # When MRP doubles as the price there is no discount to advertise.
                    mrp=None if mrp_is_price else parse_money(read(row_index, "mrp")),
                    cost_price=parse_money(read(row_index, "costPrice")),
                    model_name=squish(read(row_index, "modelName")) or None,
                    gender=squish(read(row_index, "gender")) or None,
                    collection_hint=squish(read(row_index, "collectionHint")) or None,
                    quantity=quantity,
                    product_url=product_urls[0] if product_urls else None,
                    image_urls=_extract_urls(read(row_index, "imageUrls")),
                    notes=squish(read(row_index, "notes")) or None,
                    brand_site=brand_site,
                )
            )
            used_here += 1

        if used_here:
            used_sheets.append(grid.name)
        elif not any(error.sheet == grid.name for error in errors):
            skipped.append({"sheet": grid.name, "reason": "no data rows"})

    if not rows and not errors:
        detail = ", ".join(f"{s['sheet']} ({s['reason']})" for s in skipped) or "none"
        raise ValueError(
            "No usable rows found. Each sheet needs a model number column and a price or MRP column; "
            f"the brand can come from a Brand/Group column or the tab name. Sheets checked: {detail}."
        )

    return SheetParseResult(
        rows=rows,
        errors=errors,
        header_map=header_map,
        unmapped_headers=unmapped,
        sheets=used_sheets,
        skipped_sheets=skipped,
        file_name=path.name,
    )


def write_template(path: str | Path) -> None:
    """Writes a correctly shaped starter workbook the client can fill in."""
    path = Path(path)
    workbook = Workbook()

    sheet = workbook.active
    sheet.title = "Stock"
    headers = [
        ("Brand", 18), ("Model No", 22), ("Model Name", 26), ("Price", 14), ("MRP", 14),
        ("Gender", 12), ("Collection", 18), ("Qty", 8), ("Product URL", 40),
        ("Image URLs", 40), ("Notes", 30),
    ]
    sheet.append([h for h, _ in headers])
    for index, (_, width) in enumerate(headers, start=1):
        sheet.column_dimensions[sheet.cell(row=1, column=index).column_letter].width = width

    header_row = sheet[1]
    for cell in header_row:
        cell.font = Font(bold=True, color="FFF6F2EE")
        cell.fill = PatternFill("solid", fgColor="FF141211")
        cell.alignment = Alignment(vertical="center")
    sheet.freeze_panes = "A2"

    sheet.append(["Tissot", "T127.407.11.041.00", "Gentleman Powermatic 80 Silicium", 71500, 79500,
                  "Men", "Automatic", 2, "", "", ""])
    sheet.append(["Seiko", "SKX007K2", "", 32000, "", "Men", "Dive", 1, "", "", "Boutique display piece"])
    sheet.append(["Casio", "EFR-552D-1AVUDF", "Edifice", 8995, 9995, "Men", "Chronograph", 5, "", "", ""])

    for row in range(2, 5):
        sheet.cell(row=row, column=4).number_format = '"₹"#,##0'
        sheet.cell(row=row, column=5).number_format = '"₹"#,##0'

    notes = workbook.create_sheet("How to fill this")
    notes.append(["Column", "Required", "What to put in it"])
    for cell in notes[1]:
        cell.font = Font(bold=True)
    for column, width in (("A", 18), ("B", 12), ("C", 90)):
        notes.column_dimensions[column].width = width

    for row in (
        ("Brand", "Yes", "Tissot, Seiko, Citizen, Casio, Titan… exactly as the brand writes it. A tab named for the brand also works."),
        ("Model No", "Yes", "The full reference printed on the box or caseback. The more exact this is, the better the research."),
        ("Model Name", "No", "Helps a lot when the reference alone is ambiguous. Leave blank if unsure."),
        ("Price", "Yes", "Your selling price in ₹. Plain numbers or ₹12,999 both work. 'Amount' works as a heading too."),
        ("MRP", "No", "List price in ₹, used for the discount badge. If it is the only price, it becomes the shelf price."),
        ("Gender", "No", "Men / Women / Unisex."),
        ("Collection", "No", "Automatic, Dress, Dive, Chronograph, Solar, Connected. A hint only — the agent confirms it."),
        ("Qty", "No", "Units in stock. 0 lists the watch as out of stock."),
        ("Product URL", "No", "Official product page if you have it. Skips the search step and improves accuracy."),
        ("Image URLs", "No", "Your own photographs, comma separated. These always win over anything found online."),
        ("Notes", "No", "Anything for the shop team. Never published on the website."),
    ):
        notes.append(list(row))

    path.parent.mkdir(parents=True, exist_ok=True)
    workbook.save(path)
