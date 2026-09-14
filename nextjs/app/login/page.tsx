import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import LoginForm from "@/components/admin/LoginForm";
import { isAuthenticated, isConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — Prakash Watch Co.",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only ever redirect within this site.
  const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/admin";

  if (await isAuthenticated()) redirect(destination);

  return (
    <main
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 44,
      }}
    >
      <div className="grain" />

      <div style={{ width: "100%", maxWidth: 380 }}>
        <Link href="/" style={{ display: "flex", flexDirection: "column", lineHeight: 0.95, marginBottom: 44 }}>
          <span className="serif" style={{ fontSize: 30 }}>Prakash</span>
          <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.42em", color: "var(--muted)", textTransform: "uppercase" }}>
            Watch Co.
          </span>
        </Link>

        <span className="kicker">Stock room</span>
        <h1 className="h2" style={{ fontSize: 40, marginBottom: 34 }}>
          Sign <span className="italic-accent">in</span>
        </h1>

        {isConfigured() ? (
          <LoginForm next={destination} />
        ) : (
          <p style={{ fontSize: 14.5, lineHeight: 1.7, fontWeight: 300, color: "var(--muted)" }}>
            No admin password is set. Add <code className="mono">ADMIN_PASSWORD</code> to <code className="mono">.env</code> and
            restart the server.
          </p>
        )}
      </div>
    </main>
  );
}
