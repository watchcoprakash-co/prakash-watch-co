import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Rail from "@/components/admin/Rail";
import SignOutButton from "@/components/admin/SignOutButton";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stock room — Prakash Watch Co.",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) redirect("/login?next=/admin");

  return (
    <div className="ops">
      <aside className="ops-rail">
        <Link href="/admin" style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="serif" style={{ fontSize: 19 }}>Prakash</span>
          <span className="mono" style={{ fontSize: 8, letterSpacing: ".28em", color: "var(--accent)", textTransform: "uppercase" }}>
            Stock room
          </span>
        </Link>

        <Rail />

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href="/collections" target="_blank" className="mono ops-noprint"
            style={{ fontSize: 9, letterSpacing: ".16em", color: "var(--dim)", textTransform: "uppercase" }}>
            View shop ↗
          </Link>
          <SignOutButton />
        </div>
      </aside>

      <main className="ops-main">{children}</main>
    </div>
  );
}
