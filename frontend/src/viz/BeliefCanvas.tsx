// The signature belief canvas (design doc 8.2). Orchestrates the 2D SVG view --
// shared price x-axis, the PnL curve, the belief cloud, markers, draggable belief
// handles, ghost paths and an optional market-q overlay -- or swaps in the 3D
// ridge (D26). Fills its parent (full-bleed behind floating UI); the SVG viewBox
// is measured 1:1 with the container so cursor tracking is exact (design doc 12.3).

import { useCallback, useMemo, useRef } from "react";
import type { BundleMeta, BeliefParams } from "../types/contracts";
import type { ScoredRow } from "../core/scoring";
import { buildGeometry } from "./scales";
import { useMeasure } from "./useMeasure";
import { Axes } from "./Axes";
import { BeliefCloud } from "./BeliefCloud";
import { PnLCurve } from "./PnLCurve";
import { Markers } from "./Markers";
import { BeliefHandles } from "./BeliefHandles";
import { GhostPaths } from "./GhostPaths";
import { MarketQOverlay } from "./MarketQOverlay";
import { Terrain3D } from "./Terrain3D";
import "./viz.css";

export interface BeliefCanvasProps {
  grid: number[];
  f: Float64Array; // belief density on grid (already normalized)
  selected: ScoredRow; // selected.pnl (DOLLARS) + selected.candidate
  belief: BeliefParams;
  setBelief: (b: BeliefParams) => void;
  seed: BeliefParams;
  meta: BundleMeta;
  marketQ?: number[] | null; // optional q overlay (design doc 6.8)
  mode: "2d" | "3d";
  stage: "predict" | "reveal" | "browse";
  showGhost: boolean;
}

export function BeliefCanvas(props: BeliefCanvasProps): JSX.Element {
  const {
    grid,
    f,
    selected,
    belief,
    setBelief,
    meta,
    marketQ,
    mode,
    stage,
    showGhost,
  } = props;

  const [containerRef, size] = useMeasure<HTMLDivElement>();

  // rAF-throttled drag commit so dragging the belief never stutters: stash the
  // latest params and flush at most once per frame (design doc 12.3).
  const pendingBelief = useRef<BeliefParams | null>(null);
  const rafRef = useRef<number | null>(null);
  const onDrag = useCallback(
    (next: BeliefParams) => {
      pendingBelief.current = next;
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (pendingBelief.current) {
          setBelief(pendingBelief.current);
          pendingBelief.current = null;
        }
      });
    },
    [setBelief],
  );

  const geom = useMemo(() => {
    if (size.width <= 0 || size.height <= 0 || grid.length < 2) return null;
    return buildGeometry(size.width, size.height, grid, selected.pnl);
  }, [size.width, size.height, grid, selected.pnl]);

  // In the predict stage the chosen structure is hidden: dim the PnL read so the
  // belief sketch leads (design doc 8.2 staged reveal). Cloud/handles stay live.
  const revealPnl = stage !== "predict";

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      {mode === "3d" ? (
        <Terrain3D grid={grid} f={f} selected={selected} belief={belief} />
      ) : geom ? (
        <svg
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          preserveAspectRatio="none"
          style={{ display: "block", width: "100%", height: "100%", touchAction: "none" }}
        >
          {showGhost && <GhostPaths belief={belief} meta={meta} geom={geom} />}

          <BeliefCloud grid={grid} f={f} pnl={selected.pnl} geom={geom} />

          {marketQ && marketQ.length === grid.length && (
            <MarketQOverlay grid={grid} q={marketQ} geom={geom} />
          )}

          <Axes geom={geom} />

          {revealPnl && (
            <PnLCurve
              grid={grid}
              pnl={selected.pnl}
              candidateId={selected.candidate.id}
              geom={geom}
            />
          )}

          {revealPnl && (
            <Markers
              grid={grid}
              pnl={selected.pnl}
              candidate={selected.candidate}
              meta={meta}
              belief={belief}
              geom={geom}
            />
          )}

          <BeliefHandles belief={belief} geom={geom} onDrag={onDrag} />
        </svg>
      ) : null}
    </div>
  );
}

export default BeliefCanvas;
