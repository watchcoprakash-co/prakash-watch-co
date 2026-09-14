"use client";
import Image from "next/image";
import { useState } from "react";
import type { Backdrop, ProductImage } from "@/agent/types";

export default function Gallery({
  images,
  title,
  backdrop,
}: {
  images: ProductImage[];
  title: string;
  backdrop?: Backdrop;
}) {
  const [active, setActive] = useState(0);
  const current = images[active];

  if (!current) {
    return (
      <div
        style={{
          aspectRatio: "1 / 1",
          border: "1px solid var(--border)",
          backgroundColor: "#100e0d",
          backgroundImage: "repeating-linear-gradient(135deg, #191614 0 2px, #100e0d 2px 9px)",
          display: "flex",
          alignItems: "flex-end",
          padding: 18,
        }}
      >
        <span className="mono" style={{ fontSize: 10, letterSpacing: "0.2em", color: "var(--muted)", textTransform: "uppercase" }}>
          photography pending
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          position: "relative",
          aspectRatio: "1 / 1",
          border: "1px solid var(--line)",
          background: "#100e0d",
          // Cut-out watches sit on the backdrop matched to their colour.
          backgroundImage: backdrop && current.hasAlpha ? backdrop.css : undefined,
          overflow: "hidden",
        }}
      >
        {backdrop && current.hasAlpha && (
          <Image src={backdrop.url} alt="" aria-hidden fill sizes="46vw" style={{ objectFit: "cover" }} />
        )}
        <Image
          key={current.url}
          src={current.url}
          alt={current.alt || title}
          fill
          priority
          sizes="(max-width: 900px) 100vw, 46vw"
          placeholder={current.blurDataURL ? "blur" : "empty"}
          blurDataURL={current.blurDataURL ?? undefined}
          style={{ objectFit: "contain", padding: 30 }}
        />
      </div>

      {images.length > 1 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setActive(index)}
              data-hover
              aria-label={`View image ${index + 1}`}
              aria-current={index === active}
              style={{
                position: "relative",
                width: 78,
                height: 78,
                padding: 0,
                cursor: "pointer",
                background: "#100e0d",
                border: `1px solid ${index === active ? "var(--accent)" : "var(--line)"}`,
                transition: "border-color .35s",
              }}
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="78px"
                style={{ objectFit: "contain", padding: 6, opacity: index === active ? 1 : 0.6 }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
