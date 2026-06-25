// The single react-three-fiber scene (design doc 8.2 / 8.3 / 3.3). ONE world that
// IS both views: "2D" is the camera looking straight down; "3D" smoothly orbits the
// SAME world to a tilted angle. Contents:
//
//   - SceneFloor    grid + $ / month ticks + the dashed "Now" line (grey)
//   - SceneHistory  the historical close line + a Now sphere (grey)
//   - PnlSurface    green mountain / red valley P&L terrain (stage != "predict")
//   - BeliefSurface the cool white-grey belief fog/hump (shader: fog top-down, hump side-on)
//   - BeliefRings   the 68% / 95% egg rings (white/grey)
//   - BeliefHandle  the center ring affordance
//   - SceneReshape  the invisible pointer catcher that reshapes the blob
//   - SceneCamera   the mode-driven 2D<->3D camera tween
//
// The locked D5 seam holds: nothing here feeds the engine; reshape only edits the
// belief params (m, sigma_up, sigma_down). Zero network on drag.

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";

import type { BeliefParams, BundleMeta, HistoryBar } from "../types/contracts";
import type { ScoredRow } from "../core/scoring";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { buildTimeline, priceDomain } from "./scene";
import { SceneFloor } from "./sceneFloor";
import { SceneHistory } from "./sceneHistory";
import { BeliefSurface } from "./sceneBeliefSurface";
import { BeliefRings } from "./sceneRings";
import { PnlSurface } from "./scenePnlSurface";
import { BeliefHandle } from "./sceneHandle";
import { SceneReshape } from "./sceneReshape";
import { SceneCamera } from "./sceneCamera";

export interface SceneProps {
  grid: number[];
  belief: BeliefParams;
  setBelief: (b: BeliefParams) => void;
  seed: BeliefParams;
  selected: ScoredRow;
  meta: BundleMeta;
  history: HistoryBar[];
  mode: "2d" | "3d";
  stage: "predict" | "reveal" | "browse";
}

export function Scene(props: SceneProps): JSX.Element {
  const { grid, belief, setBelief, selected, meta, history, mode, stage } = props;
  const reduced = usePrefersReducedMotion();

  const tl = useMemo(() => buildTimeline(meta, history), [meta, history]);
  // priceDomain widens with the belief so the cloud always stays on-canvas; it's the
  // shared vertical extent the floor, fog, rings, and terrain all register to.
  const domain = useMemo(
    () => priceDomain(belief, meta.spot, history),
    [belief, meta.spot, history],
  );

  const showPnl = stage !== "predict";

  return (
    <Canvas
      gl={{ alpha: true }}
      camera={{ fov: 35, near: 0.1, far: 100, position: [0, 16, 0.001] }}
      style={{ width: "100%", height: "100%" }}
    >
      <SceneCamera mode={mode} reducedMotion={reduced} />

      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 10, 6]} intensity={0.5} />

      <SceneFloor tl={tl} domain={domain} />
      <SceneHistory history={history} tl={tl} domain={domain} />

      {selected.pnl.length > 0 && (
        <PnlSurface
          grid={grid}
          pnl={selected.pnl}
          tl={tl}
          domain={domain}
          visible={showPnl}
        />
      )}

      <BeliefSurface belief={belief} tl={tl} domain={domain} />
      <BeliefRings belief={belief} tl={tl} domain={domain} />
      <BeliefHandle belief={belief} tl={tl} domain={domain} />

      <SceneReshape belief={belief} setBelief={setBelief} tl={tl} domain={domain} />
    </Canvas>
  );
}
