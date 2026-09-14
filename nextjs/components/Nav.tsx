"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * The house navigation.
 *
 * Five destinations do not fit beside a wordmark on a phone, so below 900px the
 * links move into a panel. The panel is a real dialog rather than a dropdown:
 * it traps nothing, but it closes on Escape, on navigation and on the backdrop,
 * and it returns focus to the button that opened it — which is the difference
 * between a menu a keyboard can use and one it gets stranded inside.
 */
const LINKS: { href: string; label: string }[] = [
  { href: "/collections", label: "Collection" },
  { href: "/brands", label: "Brands" },
  { href: "/offers", label: "Offers" },
  { href: "/service", label: "Service" },
  { href: "/#boutiques", label: "Boutiques" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // A route change means the menu has done its job.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };

    // The page behind a full-height panel must not scroll under it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    addEventListener("keydown", onKey);
    panel.current?.focus();

    return () => {
      document.body.style.overflow = previous;
      removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <nav
        style={{
          // Above the menu panel (z-70): the bar itself creates a stacking context,
          // so the close button cannot be lifted over the panel from inside it.
          // Keeping the whole bar on top leaves the wordmark and the X in reach.
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 80, display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "26px 44px", backdropFilter: "blur(14px)",
          background: "linear-gradient(180deg, rgba(8,8,7,0.85), rgba(8,8,7,0))",
        }}
        className="site-nav"
      >
        <Link href="/" style={{ display: "flex", flexDirection: "column", lineHeight: 0.95 }}>
          <span className="serif" style={{ fontSize: 25 }}>Prakash</span>
          <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.42em", color: "var(--muted)", textTransform: "uppercase" }}>
            Watch Co.
          </span>
        </Link>

        <div
          className="nav-links"
          style={{
            display: "flex", gap: 38, alignItems: "center", fontSize: 13.5, letterSpacing: "0.13em",
            textTransform: "uppercase", color: "#cdc5be",
          }}
        >
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </div>

        <div className="nav-est" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--accent)", animation: "breathe 2.6s ease-in-out infinite" }} />
          <span className="mono" style={{ fontSize: 10.5, letterSpacing: "0.24em", color: "var(--muted)" }}>EST. 1976</span>
        </div>

        <button
          ref={button}
          type="button"
          className="nav-toggle"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="nav-panel"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          <span className="nav-bar" data-open={open} />
          <span className="nav-bar" data-open={open} />
        </button>
      </nav>

      <div
        id="nav-panel"
        ref={panel}
        tabIndex={-1}
        className="nav-panel"
        data-open={open}
        // Hidden from assistive tech and from the tab order while closed, so the
        // links cannot be reached behind the page.
        aria-hidden={!open}
        inert={!open}
      >
        <div className="nav-panel-inner">
          {LINKS.map((link, i) => (
            <Link
              key={link.href}
              href={link.href}
              className="nav-panel-link"
              style={{ transitionDelay: open ? `${90 + i * 55}ms` : "0ms" }}
            >
              <span className="mono nav-panel-no">{String(i + 1).padStart(2, "0")}</span>
              <span className="serif">{link.label}</span>
            </Link>
          ))}

          <div className="nav-panel-foot">
            <span className="mono" style={{ fontSize: 10, letterSpacing: "0.24em", color: "var(--faint)" }}>EST. 1976</span>
            <a href="tel:+919899645897" className="mono" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--accent-soft)" }}>
              +91 98996 45897
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
