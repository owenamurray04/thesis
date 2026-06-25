// Price x time axes (design doc 12.4). Left axis = PRICE ($ ticks on horizontal
// hairlines); bottom axis = TIME (a "Now" label plus month boundaries -- "Jul",
// "Aug", "Sep"). All numbers/labels in --font-mono per the convention.

import { useMemo } from "react";
import { timeFrac, type Timeline } from "./scene";

interface PriceTimeAxesProps {
  tl: Timeline;
  domain: [number, number];
  width: number;
  height: number;
  yOfPrice: (price: number) => number;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** ~"nice" price ticks across the domain (rounded step). */
function priceTicks(lo: number, hi: number): number[] {
  const span = hi - lo;
  if (span <= 0) return [];
  const target = 6;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + 1e-9; v += step) out.push(v);
  return out;
}

/** First-of-month timestamps inside the timeline span (for month boundary ticks). */
function monthTicks(tl: Timeline): { ms: number; label: string }[] {
  const out: { ms: number; label: string }[] = [];
  const start = new Date(tl.startMs);
  let y = start.getFullYear();
  let m = start.getMonth();
  // advance to the first month boundary at/after startMs
  let ms = new Date(y, m, 1).getTime();
  while (ms < tl.startMs) {
    m += 1;
    if (m > 11) { m = 0; y += 1; }
    ms = new Date(y, m, 1).getTime();
  }
  while (ms <= tl.endMs) {
    out.push({ ms, label: MONTHS[m] });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
    ms = new Date(y, m, 1).getTime();
  }
  return out;
}

export function PriceTimeAxes(props: PriceTimeAxesProps): JSX.Element {
  const { tl, domain, width, height, yOfPrice } = props;

  const yTicks = useMemo(() => priceTicks(domain[0], domain[1]), [domain]);
  const xTicks = useMemo(() => monthTicks(tl), [tl]);
  const nowX = timeFrac(tl.nowMs, tl) * width;

  return (
    <g className="viz-axes" aria-hidden>
      {/* price hairlines + $ labels */}
      {yTicks.map((p) => {
        const y = yOfPrice(p);
        return (
          <g key={`y-${p}`}>
            <line x1={0} x2={width} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
            <text
              x={6}
              y={y - 3}
              fontFamily="var(--font-mono)"
              fontSize={9}
              fill="var(--text-3)"
            >
              ${Math.round(p)}
            </text>
          </g>
        );
      })}

      {/* month boundary ticks along the bottom */}
      {xTicks.map(({ ms, label }, i) => {
        const x = timeFrac(ms, tl) * width;
        if (x < 2 || x > width - 2) return null;
        return (
          <text
            key={`x-${i}`}
            x={x + 4}
            y={height - 8}
            fontFamily="var(--font-mono)"
            fontSize={9}
            fill="var(--text-3)"
          >
            {label}
          </text>
        );
      })}

      {/* the "Now" label anchored at the dashed marker */}
      <text
        x={nowX - 4}
        y={height - 8}
        textAnchor="end"
        fontFamily="var(--font-mono)"
        fontSize={9}
        fill="var(--text-2)"
      >
        Now
      </text>
    </g>
  );
}

export default PriceTimeAxes;
