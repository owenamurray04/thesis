// The hot loop (design doc 6.6 / D18). One hook the app-shell calls with a loaded
// bundle. The per-candidate dollar-P&L map and dS depend only on the bundle and are
// memoized; f and the scored ranking recompute on belief/weight change via cheap dot
// products. The loop NEVER hits the network -- re-ranking is local per drag.

import { useCallback, useMemo, useState } from "react";
import type { BeliefParams, ScoringBundle } from "../types/contracts";
import { beliefOnGrid, seedFromMarket } from "../core/belief";
import { gradient } from "../core/grid";
import {
  buildPnlMap,
  buildScoredRows,
  riskAppetiteToWeights,
  sortRows,
  DEFAULT_WEIGHTS,
} from "../core/scoring";
import type { ScoredRow, SortKey, Weights } from "../core/scoring";

export interface EngineState {
  bundle: ScoringBundle;
  grid: number[];
  dS: Float64Array;
  belief: BeliefParams;
  setBelief: (b: BeliefParams) => void;
  weights: Weights;
  setWeights: (w: Weights) => void;
  riskAppetite: number;
  setRiskAppetite: (a: number) => void;
  sortKey: SortKey;
  setSortKey: (k: SortKey) => void;
  selectedId: number;
  setSelectedId: (id: number) => void;
  f: Float64Array;
  ranked: ScoredRow[];
  benchmark: ScoredRow;
  selected: ScoredRow;
  seed: BeliefParams;
}

export function useEngine(bundle: ScoringBundle): EngineState {
  // bundle-keyed caches: spacing, payoff map, market seed.
  const dS = useMemo(() => gradient(bundle.grid), [bundle]);
  const pnlMap = useMemo(() => buildPnlMap(bundle), [bundle]);
  const seed = useMemo(() => seedFromMarket(bundle), [bundle]);

  const [belief, setBelief] = useState<BeliefParams>(seed);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [riskAppetite, setRiskAppetiteState] = useState<number>(0);
  const [sortKey, setSortKey] = useState<SortKey>("edge");
  const [selectedId, setSelectedId] = useState<number>(-1);

  const setRiskAppetite = useCallback((a: number) => {
    setRiskAppetiteState(a);
    setWeights(riskAppetiteToWeights(a));
  }, []);

  // density under the current belief (cheap; recompute on belief change).
  const f = useMemo(() => beliefOnGrid(belief, bundle.grid), [belief, bundle]);

  // score + split benchmark (recompute on belief / weights change).
  const { ranked: rankedByScore, benchmark } = useMemo(
    () => buildScoredRows(bundle, f, dS, weights, pnlMap),
    [bundle, f, dS, weights, pnlMap],
  );

  const ranked = useMemo(
    () => sortRows(rankedByScore, sortKey),
    [rankedByScore, sortKey],
  );

  // selection: explicit id if it resolves, else the top-ranked-by-score row.
  const selected = useMemo<ScoredRow>(() => {
    const hit = ranked.find((r) => r.candidate.id === selectedId);
    if (hit) return hit;
    return rankedByScore[0] ?? benchmark;
  }, [ranked, rankedByScore, benchmark, selectedId]);

  return {
    bundle,
    grid: bundle.grid,
    dS,
    belief,
    setBelief,
    weights,
    setWeights,
    riskAppetite,
    setRiskAppetite,
    sortKey,
    setSortKey,
    selectedId,
    setSelectedId,
    f,
    ranked,
    benchmark,
    selected,
    seed,
  };
}
