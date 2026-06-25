// Optional market-implied risk-neutral density q(S) overlay (design doc 6.8 / D17).
// Rendered as a faint dashed line under the belief cloud for comparison only -- q
// is for *explanation*, never ranking (CLAUDE.md). Kept deliberately subtle.

import { useMemo } from "react";
import { line as d3line, curveBasis } from "d3-shape";
import type { Geometry } from "./scales";

interface MarketQOverlayProps {
  grid: number[];
  q: number[];
  geom: Geometry;
}

export function MarketQOverlay({ grid, q, geom }: MarketQOverlayProps) {
  const d = useMemo(() => {
    let peak = 0;
    for (const v of q) if (v > peak) peak = v;
    const inv = peak > 0 ? 1 / peak : 0;
    const ln = d3line<number>()
      .x((_v, i) => geom.x(grid[i]))
      .y((v) => geom.cloudBaseY - geom.yCloudHeight(v * inv))
      .curve(curveBasis);
    return ln(q.slice(0, Math.min(q.length, grid.length))) ?? "";
  }, [grid, q, geom]);

  return (
    <path
      className="viz-market-q"
      d={d}
      fill="none"
      stroke="var(--text-3)"
      strokeOpacity={0.5}
      strokeWidth={1}
      strokeDasharray="3 4"
      aria-hidden
    />
  );
}

export default MarketQOverlay;
