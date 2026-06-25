// Belief fog (design doc 3.3 / 12.4): the soft green probability cloud painted in
// price x time space. We sample the belief fan over a coarse (time, price) grid in
// the FUTURE region (Now -> right edge), normalize by the field max, and paint each
// cell green with alpha proportional to density. Drawing at low resolution and
// letting the browser smooth the upscale gives the soft, fog-like falloff cheaply
// (no per-pixel blur, no network -- D5 keeps this a pure render of the belief).

import type { BeliefParams } from "../types/contracts";
import { beliefFan, nowToExp, timeFrac, type Timeline } from "./scene";

export interface FogScales {
  /** px x for a timestamp. */
  xOfMs: (ms: number) => number;
  /** px y for a price (higher price -> smaller y). */
  yOfPrice: (price: number) => number;
  /** price for a px y (inverse of yOfPrice). */
  priceOfY: (y: number) => number;
  width: number;
  height: number;
}

const GREEN = "16, 185, 129"; // --g-3 rgb, the deepest fog green
const MAX_ALPHA = 0.55;

/** Paint the belief cloud into `ctx`. Coarse cell grid (<= 80x120) over the future
 *  region; alpha rises with normalized fan density so the cloud is densest at the
 *  prediction and fans out from Now to the right edge. */
export function drawBeliefFog(
  ctx: CanvasRenderingContext2D,
  belief: BeliefParams,
  spot: number,
  tl: Timeline,
  scales: FogScales,
): void {
  const { width, height } = scales;
  if (width <= 0 || height <= 0) return;

  const nowX = scales.xOfMs(tl.nowMs);
  const x0 = Math.max(0, nowX);
  const fanW = width - x0;
  if (fanW <= 0) return;

  // coarse sampling grid
  const cols = Math.min(80, Math.max(2, Math.round(fanW / 8)));
  const rows = Math.min(120, Math.max(2, Math.round(height / 6)));
  const cellW = fanW / cols;
  const cellH = height / rows;

  const fan = beliefFan(belief, spot);

  // first pass: density field + max for normalization
  const field = new Float64Array(cols * rows);
  let maxD = 0;
  for (let c = 0; c < cols; c++) {
    const px = x0 + (c + 0.5) * cellW;
    const ms = msOfX(px, scales, tl);
    const u = nowToExp(ms, tl);
    for (let r = 0; r < rows; r++) {
      const py = (r + 0.5) * cellH;
      const price = scales.priceOfY(py);
      const d = fan(price, u);
      field[c * rows + r] = d;
      if (d > maxD) maxD = d;
    }
  }
  if (maxD <= 0) return;

  // second pass: paint. Soft edges come from the coarse cells + a touch of overlap.
  for (let c = 0; c < cols; c++) {
    const px = x0 + c * cellW;
    for (let r = 0; r < rows; r++) {
      const norm = field[c * rows + r] / maxD;
      if (norm < 0.012) continue;
      const a = MAX_ALPHA * Math.pow(norm, 0.75);
      ctx.fillStyle = `rgba(${GREEN}, ${a.toFixed(3)})`;
      // +1 overlap removes seams between cells (cheap softening)
      ctx.fillRect(px, r * cellH, cellW + 1, cellH + 1);
    }
  }
}

/** Inverse of an affine timeFrac mapping: px x -> timestamp. */
function msOfX(px: number, scales: FogScales, tl: Timeline): number {
  const frac = px / scales.width;
  return tl.startMs + frac * (tl.endMs - tl.startMs);
}

/** Re-export so callers can build the same x mapping the fog assumes. */
export function fogXOfMs(tl: Timeline, width: number): (ms: number) => number {
  return (ms: number) => timeFrac(ms, tl) * width;
}
