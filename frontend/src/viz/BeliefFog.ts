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

const GREEN: [number, number, number] = [16, 185, 129]; // --g-3, the deepest fog green
const MAX_ALPHA = 0.55;

/** Paint a low-resolution (cols x rows) field smoothly into a destination rect. The
 *  field is rendered into a tiny offscreen canvas (one texel per cell) and drawn back
 *  scaled up with bilinear smoothing -- the browser's interpolation turns the coarse
 *  cells into soft, blur-free fog. `rgba(c, r)` returns the cell's [r,g,b,0..255a] or
 *  null for empty. This is the soft-falloff workhorse both fogs share (design doc
 *  12.1: shades within the data viz are allowed; this is NOT decorative chrome). */
export function paintSmoothField(
  ctx: CanvasRenderingContext2D,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  cols: number,
  rows: number,
  rgba: (c: number, r: number) => [number, number, number, number] | null,
): void {
  if (cols < 1 || rows < 1 || destW <= 0 || destH <= 0) return;
  const off = document.createElement("canvas");
  off.width = cols;
  off.height = rows;
  const octx = off.getContext("2d");
  if (!octx) return;
  const img = octx.createImageData(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 4;
      const v = rgba(c, r);
      if (!v) {
        img.data[i + 3] = 0;
        continue;
      }
      img.data[i] = v[0];
      img.data[i + 1] = v[1];
      img.data[i + 2] = v[2];
      img.data[i + 3] = v[3];
    }
  }
  octx.putImageData(img, 0, 0);
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(off, 0, 0, cols, rows, destX, destY, destW, destH);
  ctx.imageSmoothingEnabled = prev;
}

/** Paint the belief cloud into `ctx`: sample the fan over a coarse grid in the future
 *  region (Now -> right edge), normalize by the field max, and upscale smoothly so the
 *  cloud reads as a soft blob, densest at the prediction and fanning out from Now. */
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

  // coarse sampling grid -- kept low so the bilinear upscale blurs it into fog
  const cols = Math.min(96, Math.max(8, Math.round(fanW / 12)));
  const rows = Math.min(140, Math.max(8, Math.round(height / 10)));

  const fan = beliefFan(belief, spot);

  const field = new Float64Array(cols * rows);
  let maxD = 0;
  for (let c = 0; c < cols; c++) {
    const px = x0 + (c + 0.5) * (fanW / cols);
    const ms = msOfX(px, scales, tl);
    const u = nowToExp(ms, tl);
    for (let r = 0; r < rows; r++) {
      const py = (r + 0.5) * (height / rows);
      const price = scales.priceOfY(py);
      const d = fan(price, u);
      field[c * rows + r] = d;
      if (d > maxD) maxD = d;
    }
  }
  if (maxD <= 0) return;

  paintSmoothField(ctx, x0, 0, fanW, height, cols, rows, (c, r) => {
    const norm = field[c * rows + r] / maxD;
    if (norm < 0.01) return null;
    const a = Math.round(255 * MAX_ALPHA * Math.pow(norm, 0.8));
    return [GREEN[0], GREEN[1], GREEN[2], a];
  });
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
