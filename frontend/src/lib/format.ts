// Pure string formatters (design doc 12). Every result is wrapped in <Num> by the
// caller. Money rounds to whole dollars; prices show 2 decimals.

function withSign(n: number, body: string, sign?: boolean): string {
  if (n < 0) return "-" + body;
  if (sign) return "+" + body;
  return body;
}

/** Whole-dollar money, e.g. `$1,234`, `-$190`, `+$50` (sign:true). */
export function usd(n: number, opts?: { sign?: boolean }): string {
  const whole = Math.round(Math.abs(n));
  const body = "$" + whole.toLocaleString("en-US");
  return withSign(n, body, opts?.sign);
}

/** Always-signed dollars, e.g. `+$1,234`, `-$190`. */
export function signedUsd(n: number): string {
  return usd(n, { sign: true });
}

/** Compact dollars for large magnitudes, e.g. `$1.2k`, `$16k`, `-$5.5k`. */
export function compactUsd(n: number): string {
  const abs = Math.abs(n);
  let body: string;
  if (abs >= 1_000_000) body = "$" + (abs / 1_000_000).toFixed(1) + "m";
  else if (abs >= 1_000) body = "$" + (abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1) + "k";
  else body = "$" + Math.round(abs).toLocaleString("en-US");
  return withSign(n, body);
}

/** Price with 2 decimals, e.g. `100.01`. */
export function price(n: number): string {
  return n.toFixed(2);
}

/** Percent from a fraction. PoP-style values -> whole %; small magnitudes keep
 *  one decimal; large (ROI) magnitudes stay whole. Signed for non-trivial deltas. */
export function pct(n: number, opts?: { sign?: boolean }): string {
  const p = n * 100;
  const abs = Math.abs(p);
  let digits: number;
  if (abs >= 100) digits = 0;
  else if (abs < 10) digits = 1;
  else digits = 0;
  const body = abs.toFixed(digits) + "%";
  return withSign(p, body, opts?.sign);
}
