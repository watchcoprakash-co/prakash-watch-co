"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(body.error ?? "Could not sign in.");
        setBusy(false);
        return;
      }

      router.replace(next);
      router.refresh();
    } catch {
      setError("The server did not respond.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 380 }}>
      <label className="kicker" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        type="password"
        value={password}
        autoFocus
        autoComplete="current-password"
        onChange={(event) => setPassword(event.target.value)}
        style={{
          padding: "15px 16px",
          background: "var(--card)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          fontSize: 15,
          fontFamily: "inherit",
          outline: "none",
        }}
      />

      {error && (
        <p className="mono" style={{ margin: 0, fontSize: 11, letterSpacing: "0.08em", color: "var(--accent-soft)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !password}
        data-hover
        className="btn btn-solid"
        style={{ justifyContent: "center", border: "none", cursor: busy ? "wait" : "pointer", opacity: password ? 1 : 0.5 }}
      >
        {busy ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
