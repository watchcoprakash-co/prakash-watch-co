/**
 * Sample trading history, for seeing the analytics work before the shop has
 * traded through it.
 *
 * Two deliberate constraints:
 *
 *  - Every bill is written with `demo: true`, so it is labelled everywhere it
 *    appears and `npm run demo:purge` removes exactly this and nothing else.
 *  - Stock is never touched. Two hundred invented sales would take the real 37
 *    references to zero and empty the shop window, so these bills record revenue
 *    without moving the counts that came off the client's own sheet.
 *
 * The shape is modelled on how an Indian watch boutique actually trades: a
 * Dhanteras and Diwali peak, the wedding months either side of it, a flat
 * monsoon, weekends heavier than weekdays, and a long tail of quartz under
 * ₹10,000 paying for the occasional automatic.
 */
import { promises as fs } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, "..", "data");
const BILLS = join(DATA, "bills");

const FIRST = ["Rahul", "Priya", "Aman", "Sneha", "Vikram", "Ananya", "Rohit", "Meera", "Arjun", "Kavya",
  "Sanjay", "Divya", "Karan", "Neha", "Aditya", "Pooja", "Nikhil", "Ritu", "Manish", "Shreya",
  "Gaurav", "Tanvi", "Harsh", "Isha", "Deepak", "Simran", "Varun", "Nisha", "Akash", "Payal"];
const LAST = ["Sharma", "Verma", "Gupta", "Mehra", "Kapoor", "Singh", "Malhotra", "Chopra", "Bansal",
  "Agarwal", "Khanna", "Bhatia", "Sethi", "Arora", "Jain", "Nair", "Reddy", "Iyer"];
const AREAS = ["Karol Bagh", "Connaught Place", "Rajouri Garden", "Lajpat Nagar", "Dwarka", "Rohini",
  "Gurgaon", "Noida", "Pitampura", "Janakpuri", "Saket", "Vasant Kunj"];

/** Seasonal weight by month (0 = January). Peaks at Dhanteras/Diwali and weddings. */
const SEASON = [0.85, 1.05, 1.15, 0.9, 0.8, 0.7, 0.6, 0.65, 0.95, 1.9, 1.7, 1.35];
const PAYMENTS = [["upi", 0.44], ["card", 0.28], ["cash", 0.18], ["bank", 0.07], ["other", 0.03]];

let seed = 20260826;
/** Deterministic PRNG, so re-seeding produces the same shop rather than a new one. */
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (list) => list[Math.floor(rnd() * list.length)];
const between = (a, b) => a + rnd() * (b - a);
const round2 = (n) => Math.round(n * 100) / 100;

function weighted(pairs) {
  const total = pairs.reduce((sum, [, w]) => sum + w, 0);
  let roll = rnd() * total;
  for (const [value, weight] of pairs) if ((roll -= weight) <= 0) return value;
  return pairs[0][0];
}

function financialYear(date) {
  const year = date.getFullYear();
  const start = date.getMonth() >= 3 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

async function loadCatalogue() {
  const dir = join(DATA, "catalog");
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json") && f !== "index.json");
  const items = [];
  for (const file of files) {
    const p = JSON.parse(await fs.readFile(join(dir, file), "utf8"));
    items.push({ sku: p.sku, title: p.title, modelNumber: p.modelNumber, price: p.price.selling, brand: p.brand });
  }
  // Cheaper watches sell far more often than the top of the range.
  return items.map((item) => ({ ...item, weight: item.price < 10000 ? 6 : item.price < 20000 ? 3.2 : item.price < 40000 ? 1.4 : 0.6 }));
}

async function purge() {
  let files = [];
  try { files = await fs.readdir(BILLS); } catch { return 0; }
  let removed = 0;
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const path = join(BILLS, file);
    try {
      const bill = JSON.parse(await fs.readFile(path, "utf8"));
      if (bill.demo === true) { await fs.unlink(path); removed += 1; }
    } catch { /* leave anything unreadable alone */ }
  }
  return removed;
}

async function seed_(months = 12) {
  const catalogue = await loadCatalogue();
  if (!catalogue.length) throw new Error("No catalogue to sell from — run the agent first.");

  await fs.mkdir(BILLS, { recursive: true });
  const existing = (await fs.readdir(BILLS)).filter((f) => f.endsWith(".json")).length;

  const today = new Date();
  const start = new Date(today);
  start.setMonth(start.getMonth() - months);

  const bills = [];
  const counters = new Map();

  for (let day = new Date(start); day <= today; day.setDate(day.getDate() + 1)) {
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const rate = SEASON[day.getMonth()] * (weekend ? 1.6 : 1) * 0.85;
    // Poisson-ish: most days see none or one, a festival Saturday sees several.
    const count = Math.max(0, Math.round(rate + between(-0.75, 0.75)));

    for (let n = 0; n < count; n += 1) {
      const lineCount = rnd() < 0.16 ? 2 : 1;
      const lines = [];
      const used = new Set();

      for (let l = 0; l < lineCount; l += 1) {
        const item = weighted(catalogue.map((c) => [c, c.weight]));
        if (used.has(item.sku)) continue;
        used.add(item.sku);
        // A boutique negotiates: most sales at list, some with a little off.
        const cut = rnd() < 0.38 ? between(0.03, 0.14) : 0;
        lines.push({
          sku: item.sku, title: item.title, modelNumber: item.modelNumber,
          quantity: 1,
          unitPrice: round2(item.price * (1 - cut)),
          listPrice: item.price,
        });
      }
      if (!lines.length) continue;

      const at = new Date(day);
      at.setHours(11 + Math.floor(rnd() * 9), Math.floor(rnd() * 60), 0, 0);

      const listTotal = lines.reduce((s, l) => s + l.listPrice * l.quantity, 0);
      const taxable = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
      const gstRate = 18;
      const gstAmount = round2((taxable * gstRate) / 100);

      const fy = financialYear(at);
      const next = (counters.get(fy) ?? 0) + 1;
      counters.set(fy, next);

      bills.push({
        id: `demo_${at.getTime().toString(36)}_${n}`,
        number: `PWC/${fy}/D${String(next).padStart(4, "0")}`,
        issuedAt: at.toISOString(),
        customer: {
          name: `${pick(FIRST)} ${pick(LAST)}`,
          phone: `+91 9${Math.floor(between(100000000, 999999999))}`,
          email: "",
          address: `${pick(AREAS)}, Delhi NCR`,
        },
        lines,
        gstRate,
        subtotal: round2(listTotal),
        discount: round2(Math.max(0, listTotal - taxable)),
        taxable: round2(taxable),
        gstAmount,
        total: round2(taxable + gstAmount),
        payment: weighted(PAYMENTS),
        note: "",
        status: "paid",
        demo: true,
      });
    }
  }

  for (const bill of bills) {
    await fs.writeFile(join(BILLS, `${bill.id}.json`), `${JSON.stringify(bill, null, 2)}\n`);
  }

  const revenue = bills.reduce((s, b) => s + b.total, 0);
  const units = bills.reduce((s, b) => s + b.lines.reduce((n, l) => n + l.quantity, 0), 0);
  return { count: bills.length, revenue, units, existing, months };
}

const command = process.argv[2] ?? "seed";
if (command === "purge") {
  const removed = await purge();
  console.log(`Removed ${removed} demo bill${removed === 1 ? "" : "s"}. Real bills untouched.`);
} else {
  await purge();
  const result = await seed_(Number(process.argv[3]) || 12);
  console.log(
    `Wrote ${result.count} demo bills across ${result.months} months — ` +
    `${result.units} watches, ₹${new Intl.NumberFormat("en-IN").format(Math.round(result.revenue))} of trade.\n` +
    `${result.existing} real bill(s) left alone. Stock counts untouched.\n` +
    `Remove it all with:  npm run demo:purge`,
  );
}
