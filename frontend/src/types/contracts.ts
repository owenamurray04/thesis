// Wire contracts -- the locked API/serialization seam (design doc 10.3 / 10.6).
//
// This MUST stay in lockstep with backend/src/ose/contracts.py (pydantic). A parity
// test (build-plan slice 3) generates the JSON Schema from pydantic and checks these
// types against it. The client receives ONE ScoringBundle per (ticker, expiration) and
// then runs the hot loop locally (D18): reconstruct payoffs from leg indices, integrate
// against the belief density, re-rank -- no server call per drag (design doc 6.6).

export type OptionType = "call" | "put";
export type LegKind = "call" | "put" | "stock"; // bundle legs include the long-stock benchmark (D11)
export type LegSide = 1 | -1;
export type CapitalTier = "low" | "medium" | "high";

// --- request side ------------------------------------------------------------
export interface BeliefParams {
  m: number; // center / mode price (> 0)
  sigma_down: number; // downside log-width (> 0)
  sigma_up: number; // upside log-width (> 0)
  t_days: number; // calendar days to chosen expiration (> 0)
}

// --- the scoring bundle (design doc 10.3) ------------------------------------
export interface BundleMeta {
  symbol: string;
  expiration: string; // ISO date
  spot: number;
  forward: number;
  r: number;
  q_div: number;
  fetched_at: string; // ISO datetime
  delayed: boolean;
}

export interface BundleLeg {
  id: number;
  type: LegKind; // call/put, or "stock" for the benchmark leg (D11)
  strike: number; // ignored for stock legs
  payoff_vector: number[]; // per-share value on the grid: intrinsic for options, S for stock
  bid: number;
  ask: number;
  mid: number;
  half_spread: number; // uncertainty unit (design doc 10.4)
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  volume: number;
  open_interest: number;
  freshness_ts?: string | null;
  confidence: number; // [0, 1]
}

export interface BundleCandidateLeg {
  leg_id: number;
  side: LegSide;
  qty: number;
}

export interface BundleCandidate {
  id: number;
  legs: BundleCandidateLeg[];
  name: string; // familiar label attached afterward (D13)
  net_cost: number; // conservative executable (design doc 6.7 L1)
  capital: number;
  capital_tier: CapitalTier;
  max_loss: number;
  max_gain: number;
  breakevens: number[];
  exec_quality: number; // [0, 1] (design doc 6.7)
  uncertainty: number; // u = sum|side*qty*half_spread| (design doc 10.4)
  is_benchmark: boolean; // long stock pinned (D11)
}

export interface ScoringBundle {
  meta: BundleMeta;
  grid: number[]; // shared price grid (design doc 9.9)
  legs: BundleLeg[];
  candidates: BundleCandidate[];
  market_q?: number[] | null; // q on the grid, for the overlay (design doc 6.8 / D17)
}

// --- API responses (design doc 10.6) -----------------------------------------
export interface ExpirationsResponse {
  symbol: string;
  expirations: string[];
}

export interface HistoryBar {
  d: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface HistoryResponse {
  symbol: string;
  bars: HistoryBar[];
}

export interface QuoteResponse {
  symbol: string;
  spot: number;
  quote_time?: string | null;
  delayed: boolean;
}

// --- client-side scored result (computed locally per drag, design doc 6.6) ----
// Not part of the wire payload -- produced by the hot loop from a BundleCandidate
// plus the current belief. Listed here so the engine and UI agree on the shape.
export interface ScoredCandidate {
  candidate_id: number;
  ev: number; // expected profit under belief (design doc 9.7)
  pop_f: number; // probability of profit under belief
  roi: number;
  score: number; // merit * exec_quality (design doc 6.4)
}
