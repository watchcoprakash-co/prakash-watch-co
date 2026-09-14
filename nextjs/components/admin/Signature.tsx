export default function Signature({ signatory, firm }: { signatory: string; firm: string }) {
  return (
    <div className="doc-sign">
      <span>For {firm} — {signatory}</span>
    </div>
  );
}
