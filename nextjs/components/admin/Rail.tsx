"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icons } from "./ui";

const SECTIONS = [
  { href: "/admin", label: "Overview", icon: Icons.overview, exact: true },
  { href: "/admin/analytics", label: "Analytics", icon: Icons.chart },
  { href: "/admin/billing", label: "Billing", icon: Icons.billing },
  { href: "/admin/books", label: "Books", icon: Icons.books },
  { href: "/admin/inventory", label: "Inventory", icon: Icons.inventory },
  { href: "/admin/repairs", label: "Repairs", icon: Icons.repairs },
  { href: "/admin/pricing", label: "Price watch", icon: Icons.pricing },
  { href: "/admin/offers", label: "Offers", icon: Icons.offers },
  { href: "/admin/catalogue", label: "Catalogue", icon: Icons.catalogue },
  { href: "/admin/sources", label: "Source book", icon: Icons.sources },
  { href: "/admin/runs", label: "Agent runs", icon: Icons.runs },
];

/**
 * The rail.
 *
 * The whole shop, in the order a day runs through it: what happened, what was
 * sold, what the books say, what is left, what is on the bench, what is being
 * offered, what is listed, and what the agent did. `aria-current` marks the open
 * one for a screen reader as well as for the eye.
 */
export default function Rail() {
  const pathname = usePathname();

  return (
    <nav aria-label="Stock room" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {SECTIONS.map((section) => {
        const active = section.exact ? pathname === section.href : pathname.startsWith(section.href);
        return (
          <Link key={section.href} href={section.href} className="ops-link" aria-current={active ? "page" : undefined}>
            {section.icon}
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
