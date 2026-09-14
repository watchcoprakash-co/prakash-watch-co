"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      data-hover
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/admin/login", { method: "DELETE" });
        router.replace("/login");
        router.refresh();
      }}
      className="mono"
      style={{
        background: "transparent",
        border: "1px solid var(--border)",
        color: "var(--muted)",
        padding: "9px 14px",
        fontSize: 9.5,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      {busy ? "…" : "Sign out"}
    </button>
  );
}
