// P&L fog (design doc 6.4 / 12.1): the selected strategy's profit/loss painted by
// price level across the future region. Green where the trade profits, red where it
// loses; alpha scales with |pnl| against a ROBUST max (90th percentile) so a long
// stock's unbounded tail doesn't wash everything out. Intensity ramps up toward the
// expiration edge -- that's where the payoff actually realizes (depth cue, 12.4).
//
// §12.1 explicitly permits shades of green/red within the data viz (deeper = more
// profit/loss). This is the data-driven fog, NOT decorative chrome.

import { interpAtPrice, type Timeline } from "./scene";
import { paintSmoothField, type FogScales } from "./BeliefFog";

const GREEN: [number, number, number] = [16, 185, 129]; // --g-3
const RED: [number, number, number] = [229, 72, 77]; // --r-3
const MAX_ALPHA = 0.5;

/** Robust scale for |pnl|: a high percentile of the supplied magnitudes, floored to
 *  a small value so a flat profile still reads. Pass the values actually drawn (the
 *  visible price window) so a bounded loss isn't crushed by an unbounded upside tail
 *  far off-screen -- the defined-risk loss must read as vividly as the gain. */
export function robustPnlScale(absValues: number[], pct = 0.85): number {
  const n = absValues.length;
  if (n === 0) return 1;
  const sorted = absValues.slice().sort((a, b) => a - b);
  const idx = Math.min(n - 1, Math.floor(pct * (n - 1)));
  return Math.max(sorted[idx], 1e-6);
}

/** Paint the P&L fog into `ctx`. For each price row sample the dollar P&L, choose
 *  green/red by sign, and spread it across the future region with alpha rising both
 *  with |pnl| and with proximity to the expiration column. The intensity scale is
 *  computed over the VISIBLE rows (not the whole grid) with a sqrt compression so
 *  small defined-risk losses and large gains both read clearly. */
export function drawPnLFog(
  ctx: CanvasRenderingContext2D,
  grid: number[],
  pnl: Float64Array,
  tl: Timeline,
  scales: FogScales,
): void {
  const { width, height } = scales;
  if (width <= 0 || height <= 0 || grid.length < 2 || pnl.length < 2) return;

  const nowX = scales.xOfMs(tl.nowMs);
  const expX = scales.xOfMs(tl.expMs);
  const x0 = Math.max(0, nowX);
  const fanW = width - x0;
  if (fanW <= 0) return;

  const rows = Math.min(140, Math.max(8, Math.round(height / 10)));
  const cols = Math.min(96, Math.max(8, Math.round(fanW / 12)));

  // Sample the P&L at each visible price row, scaling to the visible window so both
  // the bounded loss and the gain are legible in the belief's region.
  const rowVal: number[] = new Array(rows);
  const absVisible: number[] = [];
  for (let r = 0; r < rows; r++) {
    const price = scales.priceOfY((r + 0.5) * (height / rows));
    const v = interpAtPrice(grid, pnl, price);
    rowVal[r] = v;
    if (v !== 0) absVisible.push(Math.abs(v));
  }
  const scale = robustPnlScale(absVisible);

  // Smooth upscale (shared with the belief fog): green where the trade profits, red
  // where it loses; alpha rises with sqrt(|pnl|) and with proximity to expiration.
  paintSmoothField(ctx, x0, 0, fanW, height, cols, rows, (c, r) => {
    const v = rowVal[r];
    if (v === 0) return null;
    const base = Math.min(1, Math.sqrt(Math.abs(v) / scale));
    if (base < 0.05) return null;
    const px = x0 + (c + 0.5) * (fanW / cols);
    const t = expX > x0 ? Math.min(1, (px - x0) / (expX - x0)) : 1;
    const depth = 0.4 + 0.6 * t;
    const a = Math.round(255 * MAX_ALPHA * base * depth);
    if (a < 3) return null;
    const rgb = v > 0 ? GREEN : RED;
    return [rgb[0], rgb[1], rgb[2], a];
  });
}
