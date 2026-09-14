"use client";
import { Icons } from "./ui";

export default function PrintButton() {
  return (
    <button type="button" className="ops-btn" data-variant="solid" onClick={() => window.print()}>
      {Icons.print} Print
    </button>
  );
}
