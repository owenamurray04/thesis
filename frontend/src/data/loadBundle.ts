// The single data-source seam (provider interface, design doc 7.3 / D18). Slice 1
// serves the offline mock; Slice 4 swaps the bodies for a fetch against /bundle.
// Nothing else in the app touches the data source -- this is the only swap point.

import type { HistoryBar, ScoringBundle } from "../types/contracts";
import mock from "../mock/bundle.json";

/** One ScoringBundle per (ticker, expiration). Slice 1 ignores the symbol. */
export async function loadBundle(_symbol: string): Promise<ScoringBundle> {
  return mock as unknown as ScoringBundle;
}

/** Available expirations for the symbol (Slice 1: just the mock's one). */
export async function loadExpirations(_symbol: string): Promise<string[]> {
  return [mock.meta.expiration];
}

/** Lightweight spot quote, derived from the mock meta. */
export async function loadQuote(
  _symbol: string,
): Promise<{ symbol: string; spot: number; delayed: boolean }> {
  return {
    symbol: mock.meta.symbol,
    spot: mock.meta.spot,
    delayed: mock.meta.delayed,
  };
}

/** Historical daily closes leading up to "now" (design doc 8.5 / 12.4 -- the solid
 *  line that stops at Now before the belief fan begins). Slice 1 synthesizes a
 *  deterministic gentle up-trend that lands exactly on spot; Slice 5 swaps this for
 *  the provider's real bars. Pure + deterministic so the render never jitters. */
export async function loadHistory(
  _symbol: string,
  days = 132,
): Promise<HistoryBar[]> {
  const spot = mock.meta.spot;
  const endMs = new Date(mock.meta.fetched_at).getTime();
  const dayMs = 86_400_000;

  // Deterministic pseudo-random walk (mulberry32) drifting up toward spot, then
  // rescaled so the final close == spot exactly (the line meets the cloud at Now).
  let s = 0x9e3779b9;
  const rand = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const raw: number[] = [];
  let level = spot * 0.82; // start ~18% below spot
  for (let i = 0; i < days; i++) {
    const drift = (spot - level) * 0.012; // mean-revert toward spot
    const shock = (rand() - 0.5) * spot * 0.018;
    level = Math.max(spot * 0.5, level + drift + shock);
    raw.push(level);
  }
  const adjust = spot - raw[raw.length - 1]; // pin the last close to spot
  return raw.map((close, i) => {
    const c = close + adjust * (i / (days - 1));
    const o = i === 0 ? c : raw[i - 1] + adjust * ((i - 1) / (days - 1));
    return {
      d: new Date(endMs - (days - 1 - i) * dayMs).toISOString().slice(0, 10),
      open: round2(o),
      high: round2(Math.max(o, c) * 1.004),
      low: round2(Math.min(o, c) * 0.996),
      close: round2(c),
    };
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
