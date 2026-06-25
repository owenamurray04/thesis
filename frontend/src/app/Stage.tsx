// The staged graph experience (design doc 12.4 / 8.1). Stage owns the hot loop
// (useEngine) so the engine hook always runs with a real bundle -- App handles
// landing/loading above it, keeping every hook call unconditional.
//
// The graph is the full-bleed substrate; chrome floats over it as ink on glass.
// Stage drives the predict -> reveal -> browse choreography for the bundle that
// App has loaded; `onConfirm` is what App wires to advance out of `predict`.

import { useEffect, useState } from "react";
import type { ScoringBundle } from "../types/contracts";
import { useEngine } from "../state/useEngine";
import { BeliefCanvas } from "../viz/BeliefCanvas";
import { Rail } from "../rail/Rail";
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

  const railShown = stage === "reveal" || stage === "browse";

  // Predict: Enter is the quiet confirm affordance (design doc 12.4).
  useEffect(() => {
    if (stage !== "predict") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, onConfirm]);

  // The belief seam (D5): the canvas writes belief via setBelief; first write
  // fades the one-time "drag to predict" hint.
  const handleSetBelief = (b: typeof engine.belief) => {
    if (!hintFaded) setHintFaded(true);
    engine.setBelief(b);
  };

  return (
    <div className="app-stage">
      {/* full-bleed canvas substrate */}
      <div className="app-canvas-layer">
        <BeliefCanvas
          grid={engine.grid}
          f={engine.f}
          selected={engine.selected}
          belief={engine.belief}
          setBelief={handleSetBelief}
          seed={engine.seed}
          meta={bundle.meta}
          marketQ={bundle.market_q}
          mode={mode}
          stage={stage}
          showGhost={showGhost}
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

      {/* docked rail (states >= reveal): slides in from the right */}
      <div
        className={
          "app-rail " + (railShown ? "app-rail--shown" : "app-rail--enter")
        }
        aria-hidden={!railShown}
      >
        {railShown && (
          <Rail
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
        )}
      </div>
    </div>
  );
}

export default StageView;
