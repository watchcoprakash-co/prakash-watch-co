/**
 * The other half of the ledger, for the demo.
 *
 * Sales alone do not make books. Without what the stock cost, what the owner put
 * in, and what the shop spends to keep the lights on, a balance sheet has one
 * side and a profit-and-loss has no margin. This writes those in so the reports
 * can be seen working end to end.
 *
 * Everything it writes is marked `demo: true` and removed by `demo:purge`,
 * including the cost prices — which are *invented*. A real shop's cost comes off
 * its purchase invoices, and the stock sheet did not carry one.
 */
import { promises as fs } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, "..", "data");
const CATALOG = join(DATA, "catalog");
const JOURNAL = join(DATA, "journal.json");

let seed = 8261;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const round2 = (n) => Math.round(n * 100) / 100;

const CODES = { cash: "1000", bank: "1010", stock: "1100", inputGst: "1300",
  creditors: "2000", capital: "3000", rent: "5100", salaries: "5200",
  utilities: "5300", software: "5400" };

async function products() {
  const files = (await fs.readdir(CATALOG)).filter((f) => f.endsWith(".json") && f !== "index.json");
  return Promise.all(files.map(async (f) => ({ file: f, data: JSON.parse(await fs.readFile(join(CATALOG, f), "utf8")) })));
}

async function readJournal() {
  try { return JSON.parse(await fs.readFile(JOURNAL, "utf8")); } catch { return []; }
}

async function writeJournal(entries) {
  await fs.writeFile(JOURNAL, `${JSON.stringify(entries.sort((a, b) => a.date.localeCompare(b.date)), null, 2)}\n`);
}

function entry(date, type, voucherNo, narration, lines, extra = {}) {
  return { id: `je_demo_${voucherNo.replace(/\W/g, "")}`, date, type, voucherNo, narration,
    lines: lines.map((l) => ({ account: l.a, debit: round2(l.d ?? 0), credit: round2(l.c ?? 0), note: l.n ?? "" })),
    reference: extra.reference ?? "", party: extra.party ?? "",
    createdAt: new Date().toISOString(), demo: true };
}

async function purge() {
  const journal = await readJournal();
  const kept = journal.filter((e) => !e.demo);
  await writeJournal(kept);

  let cleared = 0;
  for (const { file, data } of await products()) {
    if (data.costPrice != null) {
      delete data.costPrice;
      await fs.writeFile(join(CATALOG, file), `${JSON.stringify(data, null, 2)}\n`);
      cleared += 1;
    }
  }
  return { entries: journal.length - kept.length, cleared };
}

async function seed_() {
  await purge();
  const items = await products();
  if (!items.length) throw new Error("No catalogue to value.");

  // Invented cost: watch retail runs roughly 30–45% over trade price, a little
  // thinner on the volume quartz and fatter on the automatics.
  let stockAtCost = 0;
  for (const { file, data } of items) {
    const markup = data.price.selling > 30000 ? 1.42 : data.price.selling > 12000 ? 1.36 : 1.3;
    const cost = round2(data.price.selling / (markup + rnd() * 0.06));
    data.costPrice = cost;
    stockAtCost += cost * (data.quantity ?? 0);
    await fs.writeFile(join(CATALOG, file), `${JSON.stringify(data, null, 2)}\n`);
  }
  stockAtCost = round2(stockAtCost);

  const today = new Date();
  const start = new Date(today); start.setMonth(start.getMonth() - 12); start.setDate(1);
  const iso = (d) => d.toISOString().slice(0, 10);
  const entries = [];

  // The proprietor's opening position: cash in the bank and stock on the shelf.
  const capital = 1_500_000;
  entries.push(entry(iso(start), "opening", "OP/DEMO/0001", "Capital introduced by proprietor",
    [{ a: CODES.bank, d: capital }, { a: CODES.capital, c: capital }]));
  entries.push(entry(iso(start), "opening", "OP/DEMO/0002", "Opening stock brought in at cost",
    [{ a: CODES.stock, d: stockAtCost }, { a: CODES.capital, c: stockAtCost }]));

  // Restocking through the year: bought on credit, paid the following month,
  // with input GST claimed — which is what makes the GST report net out.
  let n = 0;
  for (let m = 1; m <= 12; m += 1) {
    const when = new Date(start); when.setMonth(start.getMonth() + m); when.setDate(6);
    if (when > today) break;
    const value = round2(180_000 + rnd() * 220_000);
    const gst = round2(value * 0.18);
    n += 1;
    entries.push(entry(iso(when), "purchase", `P/DEMO/${String(n).padStart(4, "0")}`,
      "Stock purchased from distributor",
      [{ a: CODES.stock, d: value }, { a: CODES.inputGst, d: gst, n: "GST 18%" }, { a: CODES.creditors, c: value + gst }],
      { party: "Authorised distributor" }));

    const paid = new Date(when); paid.setMonth(paid.getMonth() + 1);
    if (paid <= today) {
      entries.push(entry(iso(paid), "payment", `PY/DEMO/${String(n).padStart(4, "0")}`,
        "Paid distributor", [{ a: CODES.creditors, d: value + gst }, { a: CODES.bank, c: value + gst }],
        { party: "Authorised distributor" }));
    }

    // Running the shop.
    const eom = new Date(when.getFullYear(), when.getMonth() + 1, 0);
    if (eom <= today) {
      const tag = String(n).padStart(4, "0");
      entries.push(entry(iso(eom), "expense", `E/DEMO/${tag}A`, "Shop rent",
        [{ a: CODES.rent, d: 65000 }, { a: CODES.bank, c: 65000 }]));
      entries.push(entry(iso(eom), "expense", `E/DEMO/${tag}B`, "Staff salaries",
        [{ a: CODES.salaries, d: round2(96000 + rnd() * 12000) }, { a: CODES.bank, c: round2(96000 + rnd() * 12000) }]
          .map((l, i, arr) => (i === 1 ? { ...l, c: arr[0].d } : l))));
      entries.push(entry(iso(eom), "expense", `E/DEMO/${tag}C`, "Electricity and water",
        [{ a: CODES.utilities, d: round2(7000 + rnd() * 4000) }, { a: CODES.bank, c: 0 }]
          .map((l, i, arr) => (i === 1 ? { ...l, c: arr[0].d } : l))));
    }
  }

  const journal = await readJournal();
  await writeJournal([...journal, ...entries]);
  return { entries: entries.length, stockAtCost, costed: items.length, capital };
}

const command = process.argv[2] ?? "seed";
if (command === "purge") {
  const { entries, cleared } = await purge();
  console.log(`Removed ${entries} demo journal entries and cleared ${cleared} invented cost prices.`);
} else {
  const r = await seed_();
  console.log(
    `Costed ${r.costed} references (invented) — stock at cost ₹${new Intl.NumberFormat("en-IN").format(Math.round(r.stockAtCost))}.\n` +
    `Posted ${r.entries} entries: capital, opening stock, purchases, supplier payments, rent, salaries, utilities.\n` +
    `Sales post themselves when the Books page opens. Remove it all with:  npm run demo:purge`,
  );
}
