// The staged graph experience (design doc 12.4 / 8.1). Stage owns the hot loop
// (useEngine) so the engine hook always runs with a real bundle -- App handles
// landing/loading above it, keeping every hook call unconditional.
//
// The price x time graph is the full-viewport substrate (sticky, 100vh). Chrome
// floats over it as ink on glass. Scrolling down "a little" reveals the ranked
// BottomRail strategy panel, which slides/fades up from beneath the graph while
// the graph dims and scales down slightly. The scroll position drives selection
// context; clicking a card drives the canvas selection (the belief seam, D5).

import { useCallback, useEffect, useRef, useState } from "react";
import type { HistoryBar, ScoringBundle } from "../types/contracts";
import { useEngine } from "../state/useEngine";
import { loadHistory } from "../data/loadBundle";
import { Scene } from "../viz/SceneView";
import { BottomRail } from "../rail/BottomRail";
import { usePrefersReducedMotion } from "../viz/usePrefersReducedMotion";
import Wordmark from "../ui/Wordmark";
import Num from "../ui/Num";
import Toggles from "./Toggles";

export type Stage = "predict" | "reveal" | "browse";

export interface StageProps {
  bundle: ScoringBundle;
  stage: Stage;
  onConfirm: () => void; // advance predict -> reveal (App owns the transition)
  mode: "2d" | "3d";
  setMode: (m: "2d" | "3d") => void;
  showGhost: boolean;
  setShowGhost: (v: boolean) => void;
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
}

// Aug 24 -- tiny local exp formatter (design doc gotchas).
function formatExp(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${month} ${d.getDate()}`;
}

export function StageView({
  bundle,
  stage,
  onConfirm,
  mode,
  setMode,
  showGhost,
  setShowGhost,
  theme,
  setTheme,
}: StageProps) {
  const engine = useEngine(bundle);
  const [hintFaded, setHintFaded] = useState(false);
  const [history, setHistory] = useState<HistoryBar[]>([]);

  // scroll-reveal: 0 = graph only, 1 = panel fully risen (design doc 12.4).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reveal, setReveal] = useState(0);
  const reduced = usePrefersReducedMotion();

  const railReachable = stage === "reveal" || stage === "browse";

  // Load the price history once per bundle and thread it to the canvas (8.5).
  useEffect(() => {
    let alive = true;
    loadHistory(bundle.meta.symbol).then((bars) => {
      if (alive) setHistory(bars);
    });
    return () => {
      alive = false;
    };
  }, [bundle.meta.symbol]);

  // Predict: Enter is the quiet confirm affordance (design doc 12.4).
  useEffect(() => {
    if (stage !== "predict") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, onConfirm]);

  // Map scroll position to a 0..1 reveal progress. The panel becomes reachable
  // only from `reveal` onward; before that the page is pinned to the top so the
  // graph reads as the whole screen (design doc 12.4).
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const p = max > 0 ? Math.min(1, el.scrollTop / max) : 0;
    setReveal(p);
  }, []);

  // When the rail is not yet reachable, hold the scroll container at the top.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!railReachable) {
      el.scrollTop = 0;
      setReveal(0);
    }
  }, [railReachable]);

  // The belief seam (D5): the canvas writes belief via setBelief; first write
  // fades the one-time "drag to predict" hint.
  const handleSetBelief = useCallback(
    (b: typeof engine.belief) => {
      setHintFaded(true);
      engine.setBelief(b);
    },
    [engine],
  );

  // The hint fades once the user scrolls into the reveal (design doc 12.4).
  const scrollHintFaded = reveal > 0.04;

  return (
    <div
      ref={scrollRef}
      className={"app-scroll" + (railReachable ? " is-reachable" : "")}
      onScroll={onScroll}
      data-reduced={reduced}
      style={{ ["--reveal" as string]: reveal }}
    >
      {/* sticky full-viewport graph screen */}
      <div className="app-screen">
        <div className="app-canvas-layer">
          <Scene
            grid={engine.grid}
            belief={engine.belief}
            setBelief={handleSetBelief}
            seed={engine.seed}
            selected={engine.selected}
            meta={bundle.meta}
            history={history}
            mode={mode}
            stage={stage}
          />
        </div>

        {/* floating chrome: dimmed wordmark, live expiration, toggles */}
        <div className="app-chrome app-wordmark app-enter app-enter--1">
          <Wordmark dim />
        </div>

        <div className="app-chrome app-exp app-enter app-enter--2">
          Exp <Num>{formatExp(bundle.meta.expiration)}</Num>
        </div>

        <Toggles
          mode={mode}
          setMode={setMode}
          showGhost={showGhost}
          setShowGhost={setShowGhost}
          theme={theme}
          setTheme={setTheme}
        />

        {/* predict-only affordances */}
        {stage === "predict" && (
          <>
            <div
              className="app-chrome app-hint"
              data-faded={hintFaded}
              aria-hidden="true"
            >
              drag to predict
            </div>
            <button
              type="button"
              className="app-chrome app-confirm app-toggle app-enter app-enter--4"
              onClick={onConfirm}
            >
              <kbd>↵</kbd> see strategies
            </button>
          </>
        )}

        {/* quiet "scroll for strategies" hint, appears at reveal, fades on scroll */}
        {railReachable && (
          <div
            className="app-chrome app-scroll-hint"
            data-faded={scrollHintFaded}
            aria-hidden="true"
          >
            scroll for strategies <span className="app-scroll-hint-arrow">↓</span>
          </div>
        )}
      </div>

      {/* scroll-reveal bottom strategy panel (states >= reveal). It sits below the
          sticky graph; the scroll-driven --reveal lifts + fades it into view. */}
      {railReachable && (
        <div className="app-bottomrail-scroll" aria-hidden={reveal < 0.02}>
          <div className="app-bottomrail">
            <BottomRail
              ranked={engine.ranked}
              benchmark={engine.benchmark}
              selectedId={engine.selectedId}
              setSelectedId={engine.setSelectedId}
              sortKey={engine.sortKey}
              setSortKey={engine.setSortKey}
              symbol={bundle.meta.symbol}
              expiration={bundle.meta.expiration}
              riskAppetite={engine.riskAppetite}
              setRiskAppetite={engine.setRiskAppetite}
              weights={engine.weights}
              setWeights={engine.setWeights}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default StageView;
