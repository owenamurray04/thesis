// Tiny inline payoff sparkline (design doc 8.4 / 12.5). The ONE place row color
// is allowed -- it shows P&L, so the stroke is green above its zero crossing and
// red below. Everything else in the rail stays greyscale neutral.

import { useMemo } from "react";

const W = 64;
const H = 20;
const PAD = 1.5;
const MAX_POINTS = 40; // downsample the dense grid to a handful of vertices

interface Pt {
  x: number;
  y: number;
  v: number; // raw pnl at this point (sign drives color)
}

/** Downsample `pnl` to <=MAX_POINTS evenly-spaced samples mapped into the SVG box.
 *  Y is scaled symmetrically so the zero line sits at a stable vertical position. */
function buildPoints(pnl: Float64Array): { pts: Pt[]; zeroY: number } | null {
  const n = pnl.length;
  if (n < 2) return null;

  const step = Math.max(1, Math.floor(n / MAX_POINTS));
  const idx: number[] = [];
  for (let i = 0; i < n; i += step) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);

  let lo = Infinity;
  let hi = -Infinity;
  for (const i of idx) {
    if (pnl[i] < lo) lo = pnl[i];
    if (pnl[i] > hi) hi = pnl[i];
  }
  if (!isFinite(lo) || !isFinite(hi) || hi === lo) return null;

  const innerH = H - PAD * 2;
  const innerW = W - PAD * 2;
  const yOf = (v: number) => PAD + innerH * (1 - (v - lo) / (hi - lo));

  const pts: Pt[] = idx.map((i, k) => ({
    x: PAD + (innerW * k) / (idx.length - 1),
    y: yOf(pnl[i]),
    v: pnl[i],
  }));

  return { pts, zeroY: yOf(0) };
}

/** Split the polyline into colored segments, splitting exactly at zero crossings
 *  so the green/red boundary lands on the break-even, not on a sample vertex. */
function segments(pts: Pt[], zeroY: number): { d: string; positive: boolean }[] {
  const out: { d: string; positive: boolean }[] = [];
  let cur: string[] = [];
  let curPos = pts[0].v >= 0;

  const start = (p: Pt, pos: boolean) => {
    cur = [`M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`];
    curPos = pos;
  };
  const flush = () => {
    if (cur.length >= 2) out.push({ d: cur.join(" "), positive: curPos });
    cur = [];
  };

  start(pts[0], curPos);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const aPos = a.v >= 0;
    const bPos = b.v >= 0;
    if (aPos !== bPos && a.v !== b.v) {
      // interpolate the crossing point on the x/y line
      const t = (0 - a.v) / (b.v - a.v);
      const cx = a.x + (b.x - a.x) * t;
      cur.push(`L ${cx.toFixed(2)} ${zeroY.toFixed(2)}`);
      flush();
      start({ x: cx, y: zeroY, v: 0 }, bPos);
    }
    cur.push(`L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`);
  }
  flush();
  return out;
}

export function Sparkline({ pnl }: { pnl: Float64Array }): JSX.Element | null {
  const model = useMemo(() => {
    const built = buildPoints(pnl);
    if (!built) return null;
    return { ...built, segs: segments(built.pts, built.zeroY) };
  }, [pnl]);

  if (!model) return null;

  return (
    <svg
      className="sparkline"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
    >
      {/* faint zero baseline */}
      <line
        x1={PAD}
        x2={W - PAD}
        y1={model.zeroY}
        y2={model.zeroY}
        stroke="var(--line-strong)"
        strokeWidth={0.5}
      />
      {model.segs.map((s, i) => (
        <path
          key={i}
          d={s.d}
          fill="none"
          stroke={s.positive ? "var(--g-2)" : "var(--r-2)"}
          strokeWidth={1.25}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export default Sparkline;
