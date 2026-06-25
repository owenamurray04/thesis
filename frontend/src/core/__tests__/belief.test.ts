import { describe, it, expect } from "vitest";
import {
  beliefOnGrid,
  twoPieceLognormalPdf,
  clampBelief,
  SIGMA_FLOOR,
  MAX_SKEW_RATIO,
} from "../belief";
import { gradient, mass } from "../grid";
import type { BeliefParams } from "../../types/contracts";
import mock from "../../mock/bundle.json";
import type { ScoringBundle } from "../../types/contracts";

const bundle = mock as unknown as ScoringBundle;

describe("belief", () => {
  it("beliefOnGrid integrates to 1.0", () => {
    const belief: BeliefParams = {
      m: bundle.meta.forward,
      sigma_down: 0.18,
      sigma_up: 0.22,
      t_days: 60,
    };
    const f = beliefOnGrid(belief, bundle.grid);
    const dS = gradient(bundle.grid);
    expect(mass(f, dS)).toBeCloseTo(1.0, 9);
  });

  it("symmetric pdf peaks near the center m", () => {
    const grid = bundle.grid;
    const m = 100;
    const f = twoPieceLognormalPdf(grid, m, 0.15, 0.15);
    let argmax = 0;
    for (let i = 1; i < f.length; i++) if (f[i] > f[argmax]) argmax = i;
    // mode of a lognormal sits slightly below m; peak grid price should be near m.
    expect(Math.abs(grid[argmax] - m)).toBeLessThan(6);
  });

  it("clampBelief floors widths and caps skew", () => {
    const floored = clampBelief({
      m: 100,
      sigma_down: 0,
      sigma_up: 0,
      t_days: 30,
    });
    expect(floored.sigma_down).toBe(SIGMA_FLOOR);
    expect(floored.sigma_up).toBe(SIGMA_FLOOR);

    const skewed = clampBelief({
      m: 100,
      sigma_down: 0.1,
      sigma_up: 10,
      t_days: 30,
    });
    expect(skewed.sigma_up / skewed.sigma_down).toBeCloseTo(MAX_SKEW_RATIO, 9);
    expect(skewed.m).toBeGreaterThan(0);
  });
});
