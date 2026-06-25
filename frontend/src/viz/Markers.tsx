// Reference markers on the price axis (design doc 8.2): breakevens, spot, the
// belief center, and the candidate's max-profit / max-loss points. All labels are
// mono, small, greyscale -- color stays reserved for P&L (design doc 12).

import { price, signedUsd } from "../lib/format";
import type { BundleCandidate, BundleMeta, BeliefParams } from "../types/contracts";
import type { Geometry } from "./scales";

interface MarkersProps {
  grid: number[];
  pnl: Float64Array;
  candidate: BundleCandidate;
  meta: BundleMeta;
  belief: BeliefParams;
  geom: Geometry;
}

interface VLine {
  key: string;
  xPrice: number;
  label: string;
  tone: string; // text color token
  dash?: boolean;
}

export function Markers({ grid, pnl, candidate, meta, belief, geom }: MarkersProps) {
  const lines: VLine[] = [];

  for (let i = 0; i < candidate.breakevens.length; i++) {
    lines.push({
      key: `be-${i}`,
      xPrice: candidate.breakevens[i],
      label: price(candidate.breakevens[i]),
      tone: "var(--text-2)",
      dash: true,
    });
  }
  lines.push({
    key: "spot",
    xPrice: meta.spot,
    label: "SPOT " + price(meta.spot),
    tone: "var(--text-3)",
  });
  lines.push({
    key: "center",
    xPrice: belief.m,
    label: price(belief.m),
    tone: "var(--text-1)",
  });

  // max profit / max loss points along the realized pnl on the grid
  let iMax = 0;
  let iMin = 0;
  for (let i = 1; i < pnl.length; i++) {
    if (pnl[i] > pnl[iMax]) iMax = i;
    if (pnl[i] < pnl[iMin]) iMin = i;
  }

  const extrema: { key: string; i: number; tone: string; label: string }[] = [
    {
      key: "maxp",
      i: iMax,
      tone: "var(--g-2)",
      label: signedUsd(candidate.max_gain),
    },
    {
      key: "maxl",
      i: iMin,
      tone: "var(--r-2)",
      label: signedUsd(-Math.abs(candidate.max_loss)),
    },
  ];

  const inX = (xp: number) =>
    xp >= grid[0] && xp <= grid[grid.length - 1];

  return (
    <g className="viz-markers" aria-hidden>
      {lines.map((l) => {
        if (!inX(l.xPrice)) return null;
        const xpx = geom.x(l.xPrice);
        const isCenter = l.key === "center";
        return (
          <g key={l.key}>
            <line
              x1={xpx}
              x2={xpx}
              y1={geom.innerTop}
              y2={geom.cloudBaseY}
              stroke={isCenter ? "var(--line-strong)" : "var(--line)"}
              strokeWidth={1}
              strokeDasharray={l.dash ? "2 4" : undefined}
            />
            <text
              x={xpx}
              y={geom.cloudBaseY + 10}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize={9}
              fill={l.tone}
            >
              {l.label}
            </text>
          </g>
        );
      })}

      {extrema.map((e) => {
        if (e.i < 0 || e.i >= pnl.length) return null;
        const xpx = geom.x(grid[e.i]);
        const ypx = geom.yPnl(pnl[e.i]);
        // clamp the dot/label inside the frame (extreme gains exit the top)
        const yClamped = Math.max(geom.innerTop + 2, Math.min(ypx, geom.innerBottom - 2));
        const below = e.key === "maxl";
        return (
          <g key={e.key}>
            <circle cx={xpx} cy={yClamped} r={2.5} fill={e.tone} />
            <text
              x={xpx}
              y={below ? yClamped + 13 : yClamped - 7}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize={9}
              fill={e.tone}
            >
              {e.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export default Markers;
