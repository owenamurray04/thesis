// Pure grid utilities. `gradient` is the numpy.gradient port used to recover dS
// (the per-point spacing) from the shared price grid (design doc 9.9 / belief.py).

/** numpy.gradient(x) with a 1-D coordinate array: interior central difference,
 *  one-sided at the edges. For a single array argument numpy treats spacing as
 *  uniform unit, i.e. g[i] = (x[i+1]-x[i-1])/2, g[0]=x[1]-x[0], g[-1]=x[-1]-x[-2]. */
export function gradient(x: number[] | Float64Array): Float64Array {
  const n = x.length;
  const g = new Float64Array(n);
  if (n === 0) return g;
  if (n === 1) {
    g[0] = 0;
    return g;
  }
  g[0] = x[1] - x[0];
  g[n - 1] = x[n - 1] - x[n - 2];
  for (let i = 1; i < n - 1; i++) {
    g[i] = (x[i + 1] - x[i - 1]) / 2;
  }
  return g;
}

/** Σ values[i] * f[i] * dS[i] -- discrete ∫ values·f dS. */
export function integrate(
  values: ArrayLike<number>,
  f: ArrayLike<number>,
  dS: ArrayLike<number>,
): number {
  let s = 0;
  const n = values.length;
  for (let i = 0; i < n; i++) s += values[i] * f[i] * dS[i];
  return s;
}

/** Σ f[i] * dS[i] -- total probability mass. */
export function mass(f: ArrayLike<number>, dS: ArrayLike<number>): number {
  let s = 0;
  const n = f.length;
  for (let i = 0; i < n; i++) s += f[i] * dS[i];
  return s;
}
