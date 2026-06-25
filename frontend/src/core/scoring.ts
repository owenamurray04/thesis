// Client-side scoring + ranking (design doc 6.4 / 9.7). Pure.
//
// CRITICAL unit convention: leg `payoff_vector` is PER SHARE; candidate
// `net_cost`, `capital`, `max_loss`, `max_gain` are already DOLLARS (×100 applied).
// We apply the ×100 multiplier when turning per-share payoffs into a dollar P&L.

import type { BundleCandidate, ScoringBundle } from "../types/contracts";
import { integrate } from "./grid";

const MULT = 100; // contract multiplier (CLAUDE.md money math)

export interface Weights {
  wPop: number;
  wRoi: number;
  wEv: number;
}

export const DEFAULT_WEIGHTS: Weights = { wPop: 0.4, wRoi: 0.4, wEv: 0.2 };

export type SortKey = "capital" | "prob" | "return" | "risk" | "edge";

export interface CandidateScore {
  ev: number;
  popF: number;
  roi: number;
}

export interface ScoredRow {
  candidate: BundleCandidate;
  pnl: Float64Array;
  ev: number;
  popF: number;
  roi: number;
  merit: number;
  score: number;
  rank: number;
}

/** Per-grid-point dollar P&L for a candidate (design doc 6.4):
 *  pnl_i = 100 · Σ_legs(side·qty·payoff_vector[leg_id][i]) − net_cost. */
export function candidatePnL(
  candidate: BundleCandidate,
  legPayoffById: Map<number, number[]>,
): Float64Array {
  // grid length from any participating leg
  let n = 0;
  for (const cl of candidate.legs) {
    const pv = legPayoffById.get(cl.leg_id);
    if (pv) {
      n = pv.length;
      break;
    }
  }
  const out = new Float64Array(n);
  for (const cl of candidate.legs) {
    const pv = legPayoffById.get(cl.leg_id);
    if (!pv) continue;
    const w = cl.side * cl.qty;
    for (let i = 0; i < n; i++) out[i] += w * pv[i];
  }
  for (let i = 0; i < n; i++) out[i] = MULT * out[i] - candidate.net_cost;
  return out;
}

/** Score a P&L profile against the belief density (design doc 9.7).
 *  ev = Σ pnl·f·dS ; popF = Σ_{pnl>0} f·dS ; roi = ev / capital. */
export function scoreCandidate(
  pnl: ArrayLike<number>,
  f: ArrayLike<number>,
  dS: ArrayLike<number>,
  capital: number,
): CandidateScore {
  const ev = integrate(pnl, f, dS);
  let popF = 0;
  for (let i = 0; i < pnl.length; i++) {
    if (pnl[i] > 0) popF += f[i] * dS[i];
  }
  const roi = capital !== 0 ? ev / capital : 0;
  return { ev, popF, roi };
}

/** Per-candidate dollar-P&L cache keyed on bundle (recompute only when bundle changes). */
export function buildPnlMap(bundle: ScoringBundle): Map<number, Float64Array> {
  const legPayoffById = new Map<number, number[]>();
  for (const leg of bundle.legs) legPayoffById.set(leg.id, leg.payoff_vector);
  const out = new Map<number, Float64Array>();
  for (const c of bundle.candidates) {
    out.set(c.id, candidatePnL(c, legPayoffById));
  }
  return out;
}

/** Score every candidate, min-max normalize ev & roi across non-benchmark rows,
 *  form merit = wPop·popF + wRoi·normRoi + wEv·normEv, score = merit·exec_quality.
 *  Benchmark (long stock, D11) is scored too but returned separately and never
 *  enters the normalization basis. Ranked by score desc. */
export function buildScoredRows(
  bundle: ScoringBundle,
  f: ArrayLike<number>,
  dS: ArrayLike<number>,
  weights: Weights,
  pnlMap?: Map<number, Float64Array>,
): { ranked: ScoredRow[]; benchmark: ScoredRow } {
  const pnls = pnlMap ?? buildPnlMap(bundle);

  type Pre = {
    candidate: BundleCandidate;
    pnl: Float64Array;
    score: CandidateScore;
  };
  const pre: Pre[] = bundle.candidates.map((candidate) => {
    const pnl = pnls.get(candidate.id) ?? new Float64Array(0);
    return { candidate, pnl, score: scoreCandidate(pnl, f, dS, candidate.capital) };
  });

  const nonBench = pre.filter((p) => !p.candidate.is_benchmark);

  // min-max bounds over non-benchmark rows (guard degenerate spread)
  const evs = nonBench.map((p) => p.score.ev);
  const rois = nonBench.map((p) => p.score.roi);
  const evLo = Math.min(...evs);
  const evHi = Math.max(...evs);
  const roiLo = Math.min(...rois);
  const roiHi = Math.max(...rois);

  const norm = (v: number, lo: number, hi: number) =>
    hi === lo ? 0.5 : (v - lo) / (hi - lo);

  const toRow = (p: Pre): ScoredRow => {
    const normEv = norm(p.score.ev, evLo, evHi);
    const normRoi = norm(p.score.roi, roiLo, roiHi);
    const merit =
      weights.wPop * p.score.popF + weights.wRoi * normRoi + weights.wEv * normEv;
    const score = merit * p.candidate.exec_quality;
    return {
      candidate: p.candidate,
      pnl: p.pnl,
      ev: p.score.ev,
      popF: p.score.popF,
      roi: p.score.roi,
      merit,
      score,
      rank: 0,
    };
  };

  const benchPre = pre.find((p) => p.candidate.is_benchmark);
  const benchmark = benchPre ? toRow(benchPre) : emptyBenchmark(bundle);

  const ranked = nonBench
    .map(toRow)
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return { ranked, benchmark };
}

/** Re-sort already-scored rows by a UI sort key. Stable. */
export function sortRows(rows: ScoredRow[], key: SortKey): ScoredRow[] {
  const decorated = rows.map((row, i) => ({ row, i }));
  const cmp = (a: ScoredRow, b: ScoredRow): number => {
    switch (key) {
      case "capital":
        return a.candidate.capital - b.candidate.capital; // asc
      case "prob":
        return b.popF - a.popF; // desc
      case "return":
        return b.roi - a.roi; // desc
      case "risk": {
        const r2r = (r: ScoredRow) =>
          r.candidate.max_loss !== 0
            ? r.candidate.max_gain / Math.abs(r.candidate.max_loss)
            : Infinity;
        return r2r(b) - r2r(a); // desc
      }
      case "edge":
        return b.score - a.score; // desc
    }
  };
  decorated.sort((a, b) => {
    const c = cmp(a.row, b.row);
    return c !== 0 ? c : a.i - b.i; // stable
  });
  return decorated.map((d) => d.row);
}

/** Map a risk-appetite dial a∈[-1,1] to scoring weights (design doc 6.4).
 *  a=-1 conservative (toward PoP), a=0 default, a=+1 aggressive (toward EV/convexity).
 *  Linear interpolation; result sums to 1. */
export function riskAppetiteToWeights(a: number): Weights {
  const t = Math.max(-1, Math.min(1, a));
  const cons: Weights = { wPop: 0.6, wRoi: 0.25, wEv: 0.15 };
  const mid: Weights = { wPop: 0.4, wRoi: 0.4, wEv: 0.2 };
  const aggr: Weights = { wPop: 0.2, wRoi: 0.35, wEv: 0.45 };
  const lerp = (x: number, y: number, u: number) => x + (y - x) * u;
  let w: Weights;
  if (t <= 0) {
    const u = t + 1; // -1->0, 0->1
    w = {
      wPop: lerp(cons.wPop, mid.wPop, u),
      wRoi: lerp(cons.wRoi, mid.wRoi, u),
      wEv: lerp(cons.wEv, mid.wEv, u),
    };
  } else {
    w = {
      wPop: lerp(mid.wPop, aggr.wPop, t),
      wRoi: lerp(mid.wRoi, aggr.wRoi, t),
      wEv: lerp(mid.wEv, aggr.wEv, t),
    };
  }
  const sum = w.wPop + w.wRoi + w.wEv;
  return { wPop: w.wPop / sum, wRoi: w.wRoi / sum, wEv: w.wEv / sum };
}

function emptyBenchmark(bundle: ScoringBundle): ScoredRow {
  // Defensive: a well-formed bundle always pins a long-stock benchmark (D11).
  const candidate = bundle.candidates[0];
  return {
    candidate,
    pnl: new Float64Array(0),
    ev: 0,
    popF: 0,
    roi: 0,
    merit: 0,
    score: 0,
    rank: 0,
  };
}
