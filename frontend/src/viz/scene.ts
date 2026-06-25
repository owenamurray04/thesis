// Shared coordinate model for the price x time canvas (design doc 3.3 / 8.2-3D /
// 12.4). Price is the vertical axis, time the horizontal -- the layout the user
// sculpts the belief cloud in. Both the 2D fog renderer and the 3D terrain consume
// these pure helpers so the two views stay registered to the same space.
//
// IMPORTANT (the locked D5 seam): the engine still consumes ONLY the terminal
// density f(S_T) at expiration. The fan below is a *rendering* of the belief through
// time -- at u=1 (expiration) it collapses to the same two-piece lognormal the engine
// scores, so the picture and the math never disagree.

import type { BeliefParams, BundleMeta, HistoryBar } from "../types/contracts";
import { clampBelief, twoPieceLognormalPdf } from "../core/belief";

const DAY_MS = 86_400_000;

// ---- time axis -------------------------------------------------------------

export interface Timeline {
  nowMs: number; // "Now" -- the present (meta.fetched_at)
  expMs: number; // the chosen expiration (meta.expiration)
  startMs: number; // left edge of the canvas (history reaches back to here)
  endMs: number; // right edge (a little past expiration, for breathing room)
}

/** Build the time axis from the bundle meta + the history span. The canvas runs
 *  from the first history bar to a little beyond expiration (design doc 12.4). */
export function buildTimeline(meta: BundleMeta, history: HistoryBar[]): Timeline {
  const nowMs = new Date(meta.fetched_at).getTime();
  const expMs = new Date(meta.expiration + "T00:00:00").getTime();
  const firstBar = history.length ? new Date(history[0].d).getTime() : nowMs - 132 * DAY_MS;
  const tail = (expMs - nowMs) * 0.25; // ~a quarter of now->exp past the edge
  return { nowMs, expMs, startMs: firstBar, endMs: expMs + tail };
}

/** Fraction in [0,1] of a timestamp across the canvas (left edge -> right edge). */
export function timeFrac(ms: number, tl: Timeline): number {
  return (ms - tl.startMs) / (tl.endMs - tl.startMs);
}

/** Now -> expiration progress in [0,1] for a timestamp (clamped). u=0 at Now,
 *  u=1 at expiration -- the parameter the belief fan widens over. */
export function nowToExp(ms: number, tl: Timeline): number {
  const u = (ms - tl.nowMs) / (tl.expMs - tl.nowMs);
  return u < 0 ? 0 : u > 1 ? 1 : u;
}

// ---- the belief fan (a rendering of the belief through time) ----------------

const FAN_FLOOR = 0.04; // keep a sliver of width at Now so the cloud isn't a spike

/** A density field over (price, u in [0,1]): the belief's two-piece lognormal whose
 *  center drifts spot -> m and whose log-width grows ~sqrt(u) (a Brownian fan). At
 *  u=1 it equals the engine's terminal f(S_T). Returns an UN-normalized density --
 *  callers rescale by the field max for fog alpha / terrain height. */
export function beliefFan(
  belief: BeliefParams,
  spot: number,
): (price: number, u: number) => number {
  const b = clampBelief(belief);
  const lnSpot = Math.log(Math.max(spot, 1e-6));
  const lnM = Math.log(b.m);
  return (price: number, u: number): number => {
    if (price <= 0) return 0;
    const uu = Math.max(FAN_FLOOR, Math.min(1, u));
    // center drifts log-linearly from spot (u=0) to m (u=1)
    const centerLn = lnSpot + (lnM - lnSpot) * uu;
    const center = Math.exp(centerLn);
    // widths grow with sqrt(time) -- the classic fan
    const sd = b.sigma_down * Math.sqrt(uu);
    const su = b.sigma_up * Math.sqrt(uu);
    return twoPieceLognormalPdf([price], center, sd, su)[0];
  };
}

/** The terminal belief band prices (design doc 3.3): the 68% marks at +/-1 sigma and
 *  the 95% marks at +/-2 sigma about the center m. This is what the vertical bar at
 *  the expiration draws, and the slice the engine actually scores. */
export interface BeliefBand {
  center: number; // m
  p68: [number, number]; // [m*exp(-sd), m*exp(+su)]
  p95: [number, number]; // [m*exp(-2sd), m*exp(+2su)]
}

export function beliefBand(belief: BeliefParams): BeliefBand {
  const b = clampBelief(belief);
  return {
    center: b.m,
    p68: [b.m * Math.exp(-b.sigma_down), b.m * Math.exp(+b.sigma_up)],
    p95: [b.m * Math.exp(-2 * b.sigma_down), b.m * Math.exp(+2 * b.sigma_up)],
  };
}

// ---- price axis + payoff sampling ------------------------------------------

/** A sensible price (vertical) domain: union the belief's ~3.2-sigma span, the spot,
 *  and the history range, with a little padding. Keeps the cloud, the band, and the
 *  historical line all on-canvas. */
export function priceDomain(
  belief: BeliefParams,
  spot: number,
  history: HistoryBar[],
): [number, number] {
  const b = clampBelief(belief);
  let lo = b.m * Math.exp(-3.2 * b.sigma_down);
  let hi = b.m * Math.exp(+3.2 * b.sigma_up);
  lo = Math.min(lo, spot);
  hi = Math.max(hi, spot);
  for (const bar of history) {
    if (bar.low < lo) lo = bar.low;
    if (bar.high > hi) hi = bar.high;
  }
  const pad = (hi - lo) * 0.06;
  return [Math.max(0, lo - pad), hi + pad];
}

// ---- the prediction blob (a circularish cloud in price x time) -------------
//
// The user sculpts a single smooth blob. Its PRICE distribution is the engine's
// two-piece lognormal (m, sigma_down, sigma_up) -- so the terminal slice the engine
// scores is unchanged (D5). Its TIME spread is purely representational (one
// expiration in this slice): it only rounds the blob out so it reads as a cloud, not
// a thin vertical sliver. The blob is centered at the expiration column in time.

/** Time spread (sigma, in ms) of the blob -- a fraction of the now->expiration span,
 *  so the cloud stays circularish across tickers. */
export const BLOB_TIME_FRAC = 0.34;

export function blobTimeSigmaMs(tl: Timeline): number {
  return Math.max(1, (tl.expMs - tl.nowMs) * BLOB_TIME_FRAC);
}

/** Separable 2D belief density at (price, timestamp): the two-piece lognormal in
 *  price times a gaussian in time centered at expiration. UN-normalized (callers
 *  scale by the field max for fog opacity / surface height). */
export function belief2DDensity(
  belief: BeliefParams,
  price: number,
  ms: number,
  tl: Timeline,
): number {
  if (price <= 0) return 0;
  const b = clampBelief(belief);
  const p = twoPieceLognormalPdf([price], b.m, b.sigma_down, b.sigma_up)[0];
  const ts = blobTimeSigmaMs(tl);
  const dt = ms - tl.expMs;
  const tk = Math.exp(-(dt * dt) / (2 * ts * ts));
  return p * tk;
}

/** The blob's center and its 68% / 95% extents, for drawing the egg-shaped iso-
 *  probability rings and for hit-testing the reshape grab zones. Price extents are
 *  asymmetric (two-piece -> egg, not circle): top = m*exp(k*sigma_up), bottom =
 *  m*exp(-k*sigma_down). Time extents are +/- k*timeSigma about expiration. */
export interface BlobExtents {
  centerPrice: number; // m
  centerMs: number; // expiration column
  rings: {
    k: number; // 1 = 68%, 2 = 95%
    top: number; // price at +k sigma_up
    bottom: number; // price at -k sigma_down
    leftMs: number; // expMs - k*timeSigma
    rightMs: number; // expMs + k*timeSigma
  }[];
}

export function beliefBlobExtents(belief: BeliefParams, tl: Timeline): BlobExtents {
  const b = clampBelief(belief);
  const ts = blobTimeSigmaMs(tl);
  const ring = (k: number) => ({
    k,
    top: b.m * Math.exp(k * b.sigma_up),
    bottom: b.m * Math.exp(-k * b.sigma_down),
    leftMs: tl.expMs - k * ts,
    rightMs: tl.expMs + k * ts,
  });
  return {
    centerPrice: b.m,
    centerMs: tl.expMs,
    rings: [ring(1), ring(2)],
  };
}

/** Linear-interpolate a per-grid value (e.g. a candidate's dollar P&L) at an
 *  arbitrary price. Grid is ascending. Clamps to the ends. */
export function interpAtPrice(
  grid: number[],
  values: ArrayLike<number>,
  price: number,
): number {
  const n = grid.length;
  if (n === 0) return 0;
  if (price <= grid[0]) return values[0];
  if (price >= grid[n - 1]) return values[n - 1];
  // binary search for the bracketing pair
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (grid[mid] <= price) lo = mid;
    else hi = mid;
  }
  const t = (price - grid[lo]) / (grid[hi] - grid[lo]);
  return values[lo] + (values[hi] - values[lo]) * t;
}
