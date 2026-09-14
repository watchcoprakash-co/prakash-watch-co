const brands = [
  "Tissot", "Seiko", "Citizen", "Casio", "Swatch", "Titan", "Scuderia Ferrari", "Emporio Armani",
  "Michael Kors", "Fossil", "Diesel", "Skagen", "Calvin Klein", "Guess", "Timex", "Fastrack",
];

function Strip() {
  return (
    <div className="serif" style={{
      display: "flex", alignItems: "center", gap: 54, paddingRight: 54,
      fontSize: 34, color: "#6b625c", whiteSpace: "nowrap",
    }}>
      {brands.map((b) => (
        <span key={b} style={{ display: "flex", alignItems: "center", gap: 54 }}>
          {b}<span style={{ color: "var(--accent)", fontSize: 16 }}>◆</span>
        </span>
      ))}
    </div>
  );
}

export default function Marquee() {
  return (
    <section style={{
      position: "relative", padding: "34px 0", borderTop: "1px solid var(--line2)",
      borderBottom: "1px solid var(--line2)", background: "var(--panel)", overflow: "hidden",
    }} aria-label="Authorized brands">
      <div style={{ display: "flex", width: "max-content", animation: "marquee 42s linear infinite" }}>
        <Strip /><Strip />
      </div>
    </section>
  );
}
