// The selected candidate's terminal P&L profile pnl(S_T) (design doc 8.2).
// Green (--g-2) above the $0 line, red (--r-2) below, split at the zero crossings.
// Morphs between strategies: when the candidate id changes the pnl vector is
// interpolated old -> new over ~600ms with --ease-morph (design doc 12 motion).
// prefers-reduced-motion swaps the tween for an instant cross-fade.

import { useEffect, useRef, useState } from "react";
import { line as d3line, curveLinear } from "d3-shape";
import type { Geometry } from "./scales";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

interface PnLCurveProps {
  grid: number[];
  pnl: Float64Array;
  candidateId: number;
  geom: Geometry;
}

const MORPH_MS = 600;
// --ease-morph = cubic-bezier(0.65, 0, 0.35, 1)
function easeMorph(t: number): number {
  // cheap, no-overshoot approximation of the token curve
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Build the green-above / red-below split paths for a pnl vector, clipping each
 *  segment to its side of the $0 line with a crossing-interpolated x. */
function buildSplitPaths(
  grid: number[],
  pnl: ArrayLike<number>,
  geom: Geometry,
): { up: string; down: string } {
  const n = Math.min(grid.length, pnl.length);
  const ln = d3line<[number, number]>()
    .x((d) => d[0])
    .y((d) => d[1])
    .curve(curveLinear);

  const up: [number, number][][] = [];
  const down: [number, number][][] = [];
  let upRun: [number, number][] = [];
  let downRun: [number, number][] = [];

  const px = (i: number) => geom.x(grid[i]);
  const py = (v: number) => geom.yPnl(v);

  const crossX = (i: number): number => {
    // x where pnl crosses 0 between i-1 and i
    const a = pnl[i - 1];
    const b = pnl[i];
    const t = a === b ? 0 : a / (a - b);
    return geom.x(grid[i - 1] + (grid[i] - grid[i - 1]) * t);
  };

  for (let i = 0; i < n; i++) {
    const v = pnl[i];
    const isUp = v >= 0;
    const pt: [number, number] = [px(i), py(v)];
    if (i > 0) {
      const prevUp = pnl[i - 1] >= 0;
      if (prevUp !== isUp) {
        // insert the zero-crossing into both runs so segments meet at the line
        const cx = crossX(i);
        const cpt: [number, number] = [cx, geom.zeroY];
        upRun.push(cpt);
        downRun.push(cpt);
        if (prevUp) {
          up.push(upRun);
          upRun = [cpt];
        } else {
          down.push(downRun);
          downRun = [cpt];
        }
      }
    }
    if (isUp) upRun.push(pt);
    else downRun.push(pt);
  }
  if (upRun.length > 1) up.push(upRun);
  if (downRun.length > 1) down.push(downRun);

  const join = (runs: [number, number][][]) =>
    runs.map((r) => ln(r) ?? "").join(" ");
  return { up: join(up), down: join(down) };
}

export function PnLCurve({ grid, pnl, candidateId, geom }: PnLCurveProps) {
  const reduced = usePrefersReducedMotion();
  const [paths, setPaths] = useState(() => buildSplitPaths(grid, pnl, geom));
  const [fadeKey, setFadeKey] = useState(0);

  const prevPnl = useRef<Float64Array>(pnl);
  const prevId = useRef<number>(candidateId);
  const rafRef = useRef<number | null>(null);

  // Morph when the candidate id changes; otherwise (geom/pnl-from-belief) redraw
  // directly so dragging the belief never triggers a tween.
  useEffect(() => {
    const idChanged = prevId.current !== candidateId;
    prevId.current = candidateId;

    if (!idChanged) {
      setPaths(buildSplitPaths(grid, pnl, geom));
      prevPnl.current = pnl;
      return;
    }

    if (reduced) {
      setPaths(buildSplitPaths(grid, pnl, geom));
      prevPnl.current = pnl;
      setFadeKey((k) => k + 1); // re-trigger the CSS cross-fade
      return;
    }

    const from = prevPnl.current;
    const to = pnl;
    const n = Math.min(from.length, to.length, grid.length);
    const lerped = new Float64Array(n);
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / MORPH_MS);
      const e = easeMorph(t);
      for (let i = 0; i < n; i++) lerped[i] = from[i] + (to[i] - from[i]) * e;
      setPaths(buildSplitPaths(grid, lerped, geom));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevPnl.current = to;
        rafRef.current = null;
      }
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [grid, pnl, candidateId, geom, reduced]);

  return (
    <g
      className="viz-pnl-curve"
      key={fadeKey}
      style={
        reduced
          ? { animation: `viz-fade var(--dur-standard) var(--ease-settle)` }
          : undefined
      }
    >
      <path
        d={paths.down}
        fill="none"
        stroke="var(--r-2)"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d={paths.up}
        fill="none"
        stroke="var(--g-2)"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </g>
  );
}

export default PnLCurve;
