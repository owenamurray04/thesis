import { describe, it, expect } from "vitest";
import {
  buildPnlMap,
  buildScoredRows,
  scoreCandidate,
  DEFAULT_WEIGHTS,
} from "../scoring";
import { beliefOnGrid, seedFromMarket } from "../belief";
import { gradient } from "../grid";
import mock from "../../mock/bundle.json";
import type { ScoringBundle } from "../../types/contracts";

const bundle = mock as unknown as ScoringBundle;

describe("scoring", () => {
  it("long-stock pnl crosses zero near 100.01 and tops out ~16037 at grid end", () => {
    const pnls = buildPnlMap(bundle);
    const grid = bundle.grid;
    const pnl = pnls.get(0)!; // candidate id 0 = long stock benchmark

    // max gain at the top of the grid
    expect(pnl[pnl.length - 1]).toBeCloseTo(16036.72, 0);

    // breakeven crossing near 100.01
    let crossing = -1;
    for (let i = 1; i < pnl.length; i++) {
      if (pnl[i - 1] <= 0 && pnl[i] > 0) {
        crossing = grid[i];
        break;
      }
    }
    expect(crossing).toBeGreaterThan(99);
    expect(crossing).toBeLessThan(101.5);
  });

  it("scoreCandidate returns finite ev/popF/roi under the market seed", () => {
    const seed = seedFromMarket(bundle);
    const f = beliefOnGrid(seed, bundle.grid);
    const dS = gradient(bundle.grid);
    const pnls = buildPnlMap(bundle);
    for (const c of bundle.candidates) {
      const s = scoreCandidate(pnls.get(c.id)!, f, dS, c.capital);
      expect(Number.isFinite(s.ev)).toBe(true);
      expect(Number.isFinite(s.roi)).toBe(true);
      expect(s.popF).toBeGreaterThanOrEqual(0);
      expect(s.popF).toBeLessThanOrEqual(1);
    }
  });

  it("buildScoredRows ranks non-benchmark rows and separates the benchmark", () => {
    const seed = seedFromMarket(bundle);
    const f = beliefOnGrid(seed, bundle.grid);
    const dS = gradient(bundle.grid);
    const { ranked, benchmark } = buildScoredRows(bundle, f, dS, DEFAULT_WEIGHTS);

    expect(benchmark.candidate.is_benchmark).toBe(true);
    expect(ranked.every((r) => !r.candidate.is_benchmark)).toBe(true);
    expect(ranked.length).toBe(bundle.candidates.length - 1);

    // ranks assigned 1..n in score-desc order
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].score).toBeLessThanOrEqual(ranked[i - 1].score);
      expect(ranked[i].rank).toBe(i + 1);
    }
    for (const r of ranked) {
      expect(r.popF).toBeGreaterThanOrEqual(0);
      expect(r.popF).toBeLessThanOrEqual(1);
    }
  });
});
