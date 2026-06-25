// World <-> data coordinate model for the single react-three-fiber scene
// (design doc 3.3 / 8.2 / 8.3). ONE world holds both the "2D" (top-down) and
// "3D" (tilted) views -- only the camera differs.
//
//   world X = time      (timeFrac(ms) in [0,1]  ->  x in [-X_SPAN, +X_SPAN])
//   world Z = price     (price in priceDomain   ->  z in [+Z_SPAN .. -Z_SPAN])
//   world Y = elevation (up; fog/terrain rise off the floor)
//
// HIGHER price maps to MORE-NEGATIVE z. Looking straight down with the camera's
// up vector toward -z, that puts higher prices upward on screen and time
// increasing rightward -- a normal price chart (design doc 3.3).

import type { Timeline } from "./scene";
import { timeFrac } from "./scene";

/** Half-width of the world in X (time). Full span is [-X_SPAN, +X_SPAN]. */
export const X_SPAN = 6;
/** Half-depth of the world in Z (price). Full span is [-Z_SPAN, +Z_SPAN]. */
export const Z_SPAN = 4;
/** The floor plane's elevation. Everything rises off / drapes around this. */
export const FLOOR_Y = 0;

/** Time (ms) -> world X. */
export function xOfMs(ms: number, tl: Timeline): number {
  return (timeFrac(ms, tl) * 2 - 1) * X_SPAN;
}

/** World X -> time (ms). Inverse of xOfMs. */
export function msOfX(x: number, tl: Timeline): number {
  const frac = (x / X_SPAN + 1) / 2;
  return tl.startMs + frac * (tl.endMs - tl.startMs);
}

/** Price -> world Z. Higher price => more-negative z (reads upward top-down). */
export function zOfPrice(price: number, domain: [number, number]): number {
  const [lo, hi] = domain;
  const frac = hi === lo ? 0.5 : (price - lo) / (hi - lo);
  return (0.5 - frac) * 2 * Z_SPAN; // frac=0 -> +Z_SPAN (low), frac=1 -> -Z_SPAN (high)
}

/** World Z -> price. Inverse of zOfPrice. */
export function priceOfZ(z: number, domain: [number, number]): number {
  const [lo, hi] = domain;
  const frac = 0.5 - z / (2 * Z_SPAN);
  return lo + frac * (hi - lo);
}
