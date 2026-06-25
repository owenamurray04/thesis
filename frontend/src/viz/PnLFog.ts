// P&L fog (design doc 6.4 / 12.1): the selected strategy's profit/loss painted by
// price level across the future region. Green where the trade profits, red where it
// loses; alpha scales with |pnl| against a ROBUST max (90th percentile) so a long
// stock's unbounded tail doesn't wash everything out. Intensity ramps up toward the
// expiration edge -- that's where the payoff actually realizes (depth cue, 12.4).
//
// §12.1 explicitly permits shades of green/red within the data viz (deeper = more
// profit/loss). This is the data-driven fog, NOT decorative chrome.

import { interpAtPrice, type Timeline } from "./scene";
import type { FogScales } from "./BeliefFog";

const GREEN = "16, 185, 129"; // --g-3
const RED = "229, 72, 77"; // --r-3
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

  const rows = Math.min(160, Math.max(2, Math.round(height / 4)));
  const cellH = height / rows;
  const cols = Math.min(80, Math.max(2, Math.round(fanW / 8)));
  const cellW = fanW / cols;

  // First pass: sample the P&L at each visible price row, and scale to the visible
  // window so both the bounded loss and the gain are legible in the belief's region.
  const rowVal: number[] = new Array(rows);
  const absVisible: number[] = [];
  for (let r = 0; r < rows; r++) {
    const price = scales.priceOfY((r + 0.5) * cellH);
    const v = interpAtPrice(grid, pnl, price);
    rowVal[r] = v;
    if (v !== 0) absVisible.push(Math.abs(v));
  }
  const scale = robustPnlScale(absVisible);

  for (let r = 0; r < rows; r++) {
    const v = rowVal[r];
    if (v === 0) continue;
    // sqrt compression: small |v| still register against a large gain in-window
    const base = Math.min(1, Math.sqrt(Math.abs(v) / scale));
    if (base < 0.05) continue;
    const rgb = v > 0 ? GREEN : RED;

    for (let c = 0; c < cols; c++) {
      const px = x0 + c * cellW;
      // depth ramp: dim near Now, full at the expiration column and beyond
      const t = expX > x0 ? Math.min(1, (px + cellW * 0.5 - x0) / (expX - x0)) : 1;
      const depth = 0.35 + 0.65 * t;
      const a = MAX_ALPHA * base * depth;
      if (a < 0.01) continue;
      ctx.fillStyle = `rgba(${rgb}, ${a.toFixed(3)})`;
      ctx.fillRect(px, r * cellH, cellW + 1, cellH + 1);
    }
  }
}
