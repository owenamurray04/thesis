// Geometry builders for the PRICE x TIME 3D terrain (design doc 8.2-3D / 3.3).
//
// The scene mirrors the 2D price x time chart, tilted into perspective:
//   world X = time   (timeFrac across the canvas -> [-X_SPAN, +X_SPAN])
//   world Z = price  (priceDomain -> [-Z_SPAN, +Z_SPAN], near edge = low price)
//   world Y = elevation (belief height, signed payoff height)
//
// Pure numeric helpers only -- no React, no THREE objects -- so they stay testable
// and the component file owns all the scene-graph wiring.

import type { BeliefParams } from "../types/contracts";
import type { HistoryBar } from "../types/contracts";
import {
  beliefFan,
  interpAtPrice,
  nowToExp,
  timeFrac,
  type Timeline,
} from "./scene";

// World extents (kept modest so the default camera frames the whole scene).
export const X_SPAN = 5; // time half-extent
export const Z_SPAN = 4; // price half-extent
export const FLOOR_Y = 0;

// Elevation amplitudes (world units of "up").
export const BELIEF_AMP = 2.4; // tallest point of the green hump
export const PNL_AMP = 1.8; // peak height of the profit mountain / valley depth

/** Map a timeFrac in [0,1] to world X in [-X_SPAN, +X_SPAN]. */
export function fracToX(frac: number): number {
  return frac * 2 * X_SPAN - X_SPAN;
}

/** Map a price to world Z in [-Z_SPAN, +Z_SPAN] given the price domain.
 *  Low price -> near edge (+Z_SPAN, toward camera), high price -> far (-Z_SPAN),
 *  so the $-tick labels read bottom-to-top like the 2D chart. */
export function priceToZ(price: number, domain: [number, number]): number {
  const [lo, hi] = domain;
  const t = hi > lo ? (price - lo) / (hi - lo) : 0.5;
  return Z_SPAN - t * 2 * Z_SPAN;
}

/** Inverse of priceToZ: world Z back to a price (for sampling a Z-grid). */
export function zToPrice(z: number, domain: [number, number]): number {
  const [lo, hi] = domain;
  const t = (Z_SPAN - z) / (2 * Z_SPAN);
  return lo + t * (hi - lo);
}

export interface SurfaceGeometry {
  positions: Float32Array; // xyz triples
  indices: Uint32Array;
  colors?: Float32Array; // rgb triples (optional, for vertex-colored terrain)
  cols: number; // grid columns (time)
  rows: number; // grid rows (price)
}

/** Build the triangle index list for a (cols x rows) vertex lattice. */
function latticeIndices(cols: number, rows: number): Uint32Array {
  const quads = (cols - 1) * (rows - 1);
  const idx = new Uint32Array(quads * 6);
  let k = 0;
  for (let c = 0; c < cols - 1; c++) {
    for (let r = 0; r < rows - 1; r++) {
      const a = c * rows + r;
      const b = c * rows + (r + 1);
      const d = (c + 1) * rows + r;
      const e = (c + 1) * rows + (r + 1);
      idx[k++] = a;
      idx[k++] = b;
      idx[k++] = e;
      idx[k++] = a;
      idx[k++] = e;
      idx[k++] = d;
    }
  }
  return idx;
}

/** The BELIEF HUMP surface: a parametric mesh over the *future* region (Now ->
 *  a little past expiration) whose height is the belief fan density, normalized by
 *  the field max and raised to BELIEF_AMP. It naturally peaks near the expiration
 *  over the predicted price m -- the 2D cloud rendered as 3D elevation (doc 3.3). */
export function buildBeliefHump(
  belief: BeliefParams,
  spot: number,
  tl: Timeline,
  domain: [number, number],
  cols = 40,
  rows = 48,
): SurfaceGeometry {
  const fan = beliefFan(belief, spot);
  const nowFrac = timeFrac(tl.nowMs, tl);
  const endFrac = 1; // canvas right edge already sits a little past expiration

  // First pass: sample raw densities to find the field max for normalization.
  const heights = new Float32Array(cols * rows);
  let maxH = 1e-12;
  for (let c = 0; c < cols; c++) {
    const frac = nowFrac + (endFrac - nowFrac) * (c / (cols - 1));
    const ms = tl.startMs + frac * (tl.endMs - tl.startMs);
    const u = nowToExp(ms, tl);
    for (let r = 0; r < rows; r++) {
      const z = Z_SPAN - (r / (rows - 1)) * 2 * Z_SPAN;
      const price = zToPrice(z, domain);
      const h = fan(price, u);
      heights[c * rows + r] = h;
      if (h > maxH) maxH = h;
    }
  }

  const positions = new Float32Array(cols * rows * 3);
  for (let c = 0; c < cols; c++) {
    const frac = nowFrac + (endFrac - nowFrac) * (c / (cols - 1));
    const x = fracToX(frac);
    for (let r = 0; r < rows; r++) {
      const z = Z_SPAN - (r / (rows - 1)) * 2 * Z_SPAN;
      const y = FLOOR_Y + (heights[c * rows + r] / maxH) * BELIEF_AMP;
      const o = (c * rows + r) * 3;
      positions[o] = x;
      positions[o + 1] = y;
      positions[o + 2] = z;
    }
  }

  return { positions, indices: latticeIndices(cols, rows), cols, rows };
}

/** The PAYOFF TERRAIN surface (shown when a strategy is selected): elevation =
 *  signed dollar P&L sampled across price, constant along time -> ridges/valleys
 *  running down the time axis. Profit raises green high ground; loss sinks a red
 *  valley. Height is normalized by the 90th percentile of |pnl| so a long-stock
 *  tail can't dominate (design doc 8.2-3D). Returns vertex colors too. */
export function buildPayoffTerrain(
  grid: number[],
  pnl: ArrayLike<number>,
  domain: [number, number],
  green: [number, number, number],
  red: [number, number, number],
  cols = 32,
  rows = 56,
): SurfaceGeometry {
  // Robust scale: 90th percentile of |pnl| over the visible price domain.
  const mags: number[] = [];
  for (let r = 0; r < rows; r++) {
    const z = Z_SPAN - (r / (rows - 1)) * 2 * Z_SPAN;
    const price = zToPrice(z, domain);
    mags.push(Math.abs(interpAtPrice(grid, pnl, price)));
  }
  const sorted = [...mags].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(0.9 * (sorted.length - 1))] || 1;
  const scale = p90 > 0 ? PNL_AMP / p90 : 0;

  const positions = new Float32Array(cols * rows * 3);
  const colors = new Float32Array(cols * rows * 3);

  for (let r = 0; r < rows; r++) {
    const z = Z_SPAN - (r / (rows - 1)) * 2 * Z_SPAN;
    const price = zToPrice(z, domain);
    const dollars = interpAtPrice(grid, pnl, price);
    // clamp the signed height so an extreme tail saturates rather than spikes
    let y = dollars * scale;
    if (y > PNL_AMP) y = PNL_AMP;
    if (y < -PNL_AMP) y = -PNL_AMP;
    const mag = Math.min(1, Math.abs(dollars) / p90);
    const base = dollars >= 0 ? green : red;
    // deeper / brighter color with magnitude
    const f = 0.5 + 0.5 * mag;
    const cr = base[0] * f;
    const cg = base[1] * f;
    const cb = base[2] * f;
    for (let c = 0; c < cols; c++) {
      const x = fracToX(c / (cols - 1));
      const o = (c * rows + r) * 3;
      positions[o] = x;
      positions[o + 1] = FLOOR_Y + y;
      positions[o + 2] = z;
      colors[o] = cr;
      colors[o + 1] = cg;
      colors[o + 2] = cb;
    }
  }

  return { positions, colors, indices: latticeIndices(cols, rows), cols, rows };
}

/** World-space polyline (xyz triples) for the historical close line, laid flat on
 *  the floor: x from each bar's date, z from its close, y = FLOOR_Y. Returns the
 *  Now-anchor point separately so the caller can drop a sphere there. */
export function buildHistoryLine(
  history: HistoryBar[],
  tl: Timeline,
  domain: [number, number],
): { points: Float32Array; nowPoint: [number, number, number] } {
  const pts = new Float32Array(history.length * 3);
  for (let i = 0; i < history.length; i++) {
    const ms = new Date(history[i].d + "T00:00:00").getTime();
    const x = fracToX(timeFrac(ms, tl));
    const z = priceToZ(history[i].close, domain);
    pts[i * 3] = x;
    pts[i * 3 + 1] = FLOOR_Y + 0.01;
    pts[i * 3 + 2] = z;
  }
  const last = history.length ? history[history.length - 1].close : domain[0];
  const nowPoint: [number, number, number] = [
    fracToX(timeFrac(tl.nowMs, tl)),
    FLOOR_Y + 0.02,
    priceToZ(last, domain),
  ];
  return { points: pts, nowPoint };
}

/** Sample the belief hump's summit (the world point over the expiration at price m)
 *  so the caller can place the white ring handle there. */
export function beliefSummit(
  belief: BeliefParams,
  spot: number,
  tl: Timeline,
  domain: [number, number],
): [number, number, number] {
  const fan = beliefFan(belief, spot);
  // sample the fan over the future region to find the global max -> summit.
  const nowFrac = timeFrac(tl.nowMs, tl);
  let best = -1;
  let bestX = 0;
  let bestZ = 0;
  for (let c = 0; c <= 24; c++) {
    const frac = nowFrac + (1 - nowFrac) * (c / 24);
    const ms = tl.startMs + frac * (tl.endMs - tl.startMs);
    const u = nowToExp(ms, tl);
    for (let r = 0; r <= 32; r++) {
      const z = Z_SPAN - (r / 32) * 2 * Z_SPAN;
      const price = zToPrice(z, domain);
      const h = fan(price, u);
      if (h > best) {
        best = h;
        bestX = fracToX(frac);
        bestZ = z;
      }
    }
  }
  return [bestX, FLOOR_Y + BELIEF_AMP * 1.02, bestZ];
}
