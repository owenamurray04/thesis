// The product wordmark "thesis." -- the period carries the single P&L-green accent
// (design doc 12). `dim` lowers opacity for secondary placements.
export function Wordmark({ dim }: { dim?: boolean }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 18,
        fontWeight: 500,
        letterSpacing: "-0.01em",
        color: "var(--text-1)",
        opacity: dim ? 0.5 : 1,
      }}
    >
      thesis<span style={{ color: "var(--g-2)" }}>.</span>
    </span>
  );
}

export default Wordmark;
