// Shared scale + layout geometry for the 2D belief canvas (design doc 8.2).
// One price x-axis (terminal price S_T) shared by the PnL curve and the belief
// cloud; two independent y-quantities (dollars, density) drawn over it.

import { scaleLinear } from "d3-scale";
import type { ScaleLinear } from "d3-scale";

/** Fractions of the inner height used to place the canvas furniture (design doc 8.2). */
export const ZERO_LINE_FRAC = 0.58; // PnL $0 baseline sits ~58% down from the top
export const CLOUD_PEAK_FRAC = 0.38; // belief peak occupies ~38% of the height
export const CLOUD_BASE_FRAC = 0.985; // cloud is anchored just above the bottom

/** Inner-plot insets so axis ticks / labels have room (px in viewBox units). */
export const MARGIN = { top: 16, right: 16, bottom: 30, left: 16 } as const;

export interface Geometry {
  width: number;
  height: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  innerWidth: number;
  innerHeight: number;
  /** terminal price -> x px */
  x: ScaleLinear<number, number>;
  /** dollars -> y px (zero pinned at ZERO_LINE_FRAC) */
  yPnl: ScaleLinear<number, number>;
  /** density -> height px (cloud), anchored at the baseline */
  yCloudHeight: ScaleLinear<number, number>;
  /** y px of the PnL zero line and the cloud baseline */
  zeroY: number;
  cloudBaseY: number;
}

/** Percentile of an array (linear interpolation), ignoring NaN. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

/** Build all scales for a given container size + data (design doc 8.2).
 *  The PnL domain is clamped so an extreme max_gain (long stock ~16k) does not
 *  crush the rest of the structure: the visible top is capped at ~1.4× the 99th
 *  percentile of positive P&L; the curve simply exits the top of the frame. */
export function buildGeometry(
  width: number,
  height: number,
  grid: number[],
  pnl: ArrayLike<number>,
): Geometry {
  const innerLeft = MARGIN.left;
  const innerRight = width - MARGIN.right;
  const innerTop = MARGIN.top;
  const innerBottom = height - MARGIN.bottom;
  const innerWidth = Math.max(1, innerRight - innerLeft);
  const innerHeight = Math.max(1, innerBottom - innerTop);

  const x = scaleLinear()
    .domain([grid[0], grid[grid.length - 1]])
    .range([innerLeft, innerRight]);

  // --- PnL vertical domain with a robust top cap ---
  let pMin = 0;
  let pMax = 0;
  const positives: number[] = [];
  for (let i = 0; i < pnl.length; i++) {
    const v = pnl[i];
    if (!Number.isFinite(v)) continue;
    if (v < pMin) pMin = v;
    if (v > pMax) pMax = v;
    if (v > 0) positives.push(v);
  }
  positives.sort((a, b) => a - b);
  const p99 = percentile(positives, 0.99);
  const cappedTop = p99 > 0 ? Math.min(pMax, p99 * 1.4) : pMax;
  const visTop = Math.max(cappedTop, 1); // never a zero-height upper band

  // Symmetric-ish padding so the zero line lands at ZERO_LINE_FRAC.
  const zeroY = innerTop + innerHeight * ZERO_LINE_FRAC;
  const padTop = visTop * 0.08;
  const padBot = Math.abs(pMin) * 0.08 || visTop * 0.04;
  const domTop = visTop + padTop;
  const domBot = pMin - padBot;

  // Two-piece linear map keeps $0 fixed at zeroY while spanning the clamped range.
  const yPnl = scaleLinear<number, number>()
    .domain([domBot, 0, domTop])
    .range([innerBottom, zeroY, innerTop]);

  const cloudBaseY = innerTop + innerHeight * CLOUD_BASE_FRAC;
  const yCloudHeight = scaleLinear()
    .domain([0, 1]) // filled per-frame against the peak density
    .range([0, innerHeight * CLOUD_PEAK_FRAC]);

  return {
    width,
    height,
    innerLeft,
    innerRight,
    innerTop,
    innerBottom,
    innerWidth,
    innerHeight,
    x,
    yPnl,
    yCloudHeight,
    zeroY,
    cloudBaseY,
  };
}

/** ~6 "nice" mono price ticks across the x domain (design doc 8.2 axis). */
export function priceTicks(x: ScaleLinear<number, number>, count = 6): number[] {
  return x.ticks(count);
}
