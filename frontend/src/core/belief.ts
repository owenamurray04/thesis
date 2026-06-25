// The two-piece (split) lognormal belief -- exact TS port of
// backend/src/ose/mathx/belief.py (design doc 3.2 / 9.5). Pure, no deps.
// The engine consumes only the normalized density f(S) on the shared grid (D5).

import type { BeliefParams, ScoringBundle } from "../types/contracts";
import { gradient, mass } from "./grid";

// design doc 3.6 / 11.1 -- clamp floors/caps so degenerate sculpting stays valid.
export const SIGMA_FLOOR = 1e-3;
export const MAX_SKEW_RATIO = 6.0;

/** Belief.clamped() -- floor both widths, cap extreme skew in both directions,
 *  keep the center strictly positive. t_days passes through untouched. */
export function clampBelief(b: BeliefParams): BeliefParams {
  let sd = Math.max(b.sigma_down, SIGMA_FLOOR);
  let su = Math.max(b.sigma_up, SIGMA_FLOOR);
  if (su / sd > MAX_SKEW_RATIO) su = sd * MAX_SKEW_RATIO;
  if (sd / su > MAX_SKEW_RATIO) sd = su * MAX_SKEW_RATIO;
  return {
    m: Math.max(b.m, 1e-6),
    sigma_down: sd,
    sigma_up: su,
    t_days: b.t_days,
  };
}

/** Two-piece lognormal density f(S) (design doc 9.5). sigma_down below the
 *  center, sigma_up above; joins continuously at the peak and integrates to 1.
 *  sigma_down == sigma_up recovers an ordinary lognormal. S<=0 -> 0. */
export function twoPieceLognormalPdf(
  S: ArrayLike<number>,
  m: number,
  sigmaDown: number,
  sigmaUp: number,
): Float64Array {
  const n = S.length;
  const out = new Float64Array(n);
  const mu = Math.log(m);
  const A = Math.sqrt(2.0 / Math.PI) / (sigmaDown + sigmaUp);
  for (let i = 0; i < n; i++) {
    const s = S[i];
    if (s > 0) {
      const x = Math.log(s);
      const sigma = x <= mu ? sigmaDown : sigmaUp;
      const g = A * Math.exp(-((x - mu) * (x - mu)) / (2.0 * sigma * sigma));
      out[i] = g / s;
    }
  }
  return out;
}

/** Evaluate and normalize the belief on a grid so Σ f_i·dS_i == 1 (design doc 9.9). */
export function beliefOnGrid(
  belief: BeliefParams,
  grid: number[] | Float64Array,
): Float64Array {
  const b = clampBelief(belief);
  const f = twoPieceLognormalPdf(grid, b.m, b.sigma_down, b.sigma_up);
  const dS = gradient(grid);
  const m = mass(f, dS);
  if (m <= 0) {
    throw new Error("belief integrated to non-positive mass; check grid/params");
  }
  const out = new Float64Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = f[i] / m;
  return out;
}

/** Default "no edge" cloud (design doc 3.4). Center at the forward; width is the
 *  market's own implied log-width, recovered from market_q's log-moments when
 *  present, else a flat 20%·sqrt(t/365) fallback. Symmetric (sigma_up == sigma_down). */
export function seedFromMarket(bundle: ScoringBundle): BeliefParams {
  const m = bundle.meta.forward;
  const tDays = daysBetween(bundle.meta.fetched_at, bundle.meta.expiration);

  const grid = bundle.grid;
  const q = bundle.market_q;
  let sigma: number;

  if (q && q.length === grid.length) {
    const dS = gradient(grid);
    let qMass = 0;
    for (let i = 0; i < grid.length; i++) qMass += q[i] * dS[i];
    if (qMass > 0) {
      // normalize q, then take log-moments under the normalized density
      let meanLog = 0;
      for (let i = 0; i < grid.length; i++) {
        const qn = q[i] / qMass;
        meanLog += Math.log(grid[i]) * qn * dS[i];
      }
      let varLog = 0;
      for (let i = 0; i < grid.length; i++) {
        const qn = q[i] / qMass;
        const d = Math.log(grid[i]) - meanLog;
        varLog += d * d * qn * dS[i];
      }
      sigma = Math.sqrt(Math.max(varLog, SIGMA_FLOOR * SIGMA_FLOOR));
      return { m, sigma_down: sigma, sigma_up: sigma, t_days: tDays };
    }
  }

  sigma = 0.2 * Math.sqrt(tDays / 365);
  return { m, sigma_down: sigma, sigma_up: sigma, t_days: tDays };
}

/** §3.3 handle->sigma mapping: a band edge price maps to a log-width. The UI uses
 *  this to translate a dragged band into sigma_down / sigma_up. */
export function sigmaFromBandPrice(m: number, bandPrice: number): number {
  return Math.abs(Math.log(bandPrice / m));
}

/** Whole calendar days between two ISO datetimes/dates (rounded, >= 0). */
function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  const days = (to - from) / 86_400_000;
  return Math.max(0, Math.round(days));
}
