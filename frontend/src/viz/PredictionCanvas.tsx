// The signature PRICE x TIME canvas (design doc 8.2 / 3.3 / 12.4). Price is the
// vertical axis, time the horizontal. A soft canvas FOG layer (belief cloud + the
// selected strategy's P&L) sits UNDER a crisp SVG layer (axes, history line, Now
// marker, expiration band, handles). Fills its parent full-bleed; the SVG viewBox is
// measured 1:1 with the container so cursor tracking is exact (design doc 12.3).
//
// The locked D5 seam: dragging the white ring (m) and the band endpoints
// (sigma_up/down) edits only the belief; the engine still consumes the terminal
// density. The 3D mode hands off to <Terrain3D>.

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { BeliefParams, BundleMeta, HistoryBar } from "../types/contracts";
import type { ScoredRow } from "../core/scoring";
import { sigmaFromBandPrice } from "../core/belief";
import {
  buildTimeline,
  priceDomain,
  timeFrac,
  type Timeline,
} from "./scene";
import { useMeasure } from "./useMeasure";
import { drawBeliefFog, type FogScales } from "./BeliefFog";
import { drawPnLFog } from "./PnLFog";
import { PriceTimeAxes } from "./PriceTimeAxes";
import { HistoryLine } from "./HistoryLine";
import { NowMarker } from "./NowMarker";
import { ExpirationBand } from "./ExpirationBand";
import { CenterHandle } from "./CenterHandle";
import { Terrain3D } from "./Terrain3D";
import "./prediction.css";

export interface PredictionCanvasProps {
  grid: number[];
  belief: BeliefParams;
  setBelief: (b: BeliefParams) => void;
  seed: BeliefParams;
  selected: ScoredRow; // selected.pnl + selected.candidate
  meta: BundleMeta;
  history: HistoryBar[];
  mode: "2d" | "3d";
  stage: "predict" | "reveal" | "browse"; // P&L fog shows when stage !== "predict"
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function expirationLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

export function PredictionCanvas(props: PredictionCanvasProps): JSX.Element {
  const { grid, belief, setBelief, selected, meta, history, mode, stage } = props;

  const [containerRef, size] = useMeasure<HTMLDivElement>();
  const showPnl = stage !== "predict";

  // rAF-throttled belief commit so dragging stays smooth (design doc 12.3).
  const pending = useRef<BeliefParams | null>(null);
  const raf = useRef<number | null>(null);
  const commit = useCallback(
    (next: BeliefParams) => {
      pending.current = next;
      if (raf.current != null) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = null;
        if (pending.current) {
          setBelief(pending.current);
          pending.current = null;
        }
      });
    },
    [setBelief],
  );
  useEffect(() => () => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
  }, []);

  const tl = useMemo<Timeline>(() => buildTimeline(meta, history), [meta, history]);
  const domain = useMemo(
    () => priceDomain(belief, meta.spot, history),
    [belief, meta.spot, history],
  );

  // price <-> y (higher price -> smaller y); time -> x. Pure affine maps.
  const scales = useMemo<FogScales>(() => {
    const w = size.width;
    const h = size.height;
    const [lo, hi] = domain;
    const span = hi - lo || 1;
    return {
      width: w,
      height: h,
      xOfMs: (ms: number) => timeFrac(ms, tl) * w,
      yOfPrice: (price: number) => h - ((price - lo) / span) * h,
      priceOfY: (y: number) => lo + ((h - y) / h) * span,
    };
  }, [size.width, size.height, domain, tl]);

  // --- canvas fog layers ----------------------------------------------------
  const beliefCanvas = useRef<HTMLCanvasElement | null>(null);
  const pnlCanvas = useRef<HTMLCanvasElement | null>(null);

  // belief fog: redraw on belief / size change
  useEffect(() => {
    const cv = beliefCanvas.current;
    if (!cv || size.width <= 0 || size.height <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(size.width * dpr);
    cv.height = Math.round(size.height * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    drawBeliefFog(ctx, belief, meta.spot, tl, scales);
  }, [belief, meta.spot, tl, scales, size.width, size.height]);

  // P&L fog: redraw on selected / size / fog-visibility change
  useEffect(() => {
    const cv = pnlCanvas.current;
    if (!cv || size.width <= 0 || size.height <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(size.width * dpr);
    cv.height = Math.round(size.height * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    if (showPnl) drawPnLFog(ctx, grid, selected.pnl, tl, scales);
  }, [showPnl, grid, selected.pnl, tl, scales, size.width, size.height]);

  // --- drag handlers --------------------------------------------------------
  const onCenterDrag = useCallback(
    (m: number) => commit({ ...belief, m: Math.max(1e-6, m) }),
    [belief, commit],
  );

  const onBandDrag = useCallback(
    (edge: "up" | "down", price: number) => {
      const p = Math.max(1e-6, price);
      if (edge === "up") {
        if (p <= belief.m) return; // upper endpoint stays above center
        commit({ ...belief, sigma_up: sigmaFromBandPrice(belief.m, p) });
      } else {
        if (p >= belief.m) return; // lower endpoint stays below center
        commit({ ...belief, sigma_down: sigmaFromBandPrice(belief.m, p) });
      }
    },
    [belief, commit],
  );

  if (mode === "3d") {
    return (
      <div ref={containerRef} style={fillStyle}>
        <Terrain3D
          grid={grid}
          belief={belief}
          selected={selected}
          meta={meta}
          history={history}
          showPnl={showPnl}
        />
      </div>
    );
  }

  const ready = size.width > 0 && size.height > 0 && grid.length >= 2;

  return (
    <div ref={containerRef} style={fillStyle}>
      {/* fog layers (canvas, soft) UNDER the crisp SVG */}
      <canvas ref={beliefCanvas} style={canvasStyle} />
      <canvas
        ref={pnlCanvas}
        className="viz-pnl-fog"
        style={{ ...canvasStyle, opacity: showPnl ? 1 : 0 }}
      />

      {ready && (
        <svg
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, display: "block", width: "100%", height: "100%", touchAction: "none" }}
        >
          <PriceTimeAxes
            tl={tl}
            domain={domain}
            width={size.width}
            height={size.height}
            yOfPrice={scales.yOfPrice}
          />

          <HistoryLine history={history} tl={tl} width={size.width} yOfPrice={scales.yOfPrice} />

          <NowMarker tl={tl} width={size.width} height={size.height} />

          <ExpirationBand
            belief={belief}
            expirationLabel={expirationLabel(meta.expiration)}
            tl={tl}
            width={size.width}
            yOfPrice={scales.yOfPrice}
            priceOfY={scales.priceOfY}
            onBandDrag={onBandDrag}
          />

          <CenterHandle
            belief={belief}
            tl={tl}
            width={size.width}
            yOfPrice={scales.yOfPrice}
            priceOfY={scales.priceOfY}
            onCenterDrag={onCenterDrag}
          />
        </svg>
      )}
    </div>
  );
}

const fillStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
};

const canvasStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  display: "block",
  pointerEvents: "none",
};

export default PredictionCanvas;
