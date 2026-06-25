"""Market-implied (risk-neutral) density q via the volatility smile.

Reference: design doc Section 6.8 / 9.8. This powers the market-vs-belief overlay (D17)
and the surface-relative price validation (6.3 / 6.7 Layer 3). It is explicitly
DECOUPLED from scoring (design doc 6.0/6.8): q is for explanation, never for ranking.

Pipeline: fit a smooth IV smile across strikes -> convert to call prices C(K) via BSM ->
q(K) = e^{r tau} * d^2C/dK^2 (Breeden-Litzenberger) -> clip negatives, normalize.
"""

from __future__ import annotations

import numpy as np

from .blackscholes import bs_price


def fit_smile(strikes: np.ndarray, ivs: np.ndarray, forward: float):
    """Smooth IV(K). scipy smoothing spline when available, numpy poly fallback.

    Fits in log-moneyness k = ln(K/F) for stability (design doc 9.8). Returns a callable
    iv(K). MVP uses a lightly-regularized smoother; an arbitrage-aware SVI fit is the
    documented upgrade (design doc 9.8).
    """
    strikes = np.asarray(strikes, dtype=float)
    ivs = np.asarray(ivs, dtype=float)
    k = np.log(strikes / forward)
    order = np.argsort(k)
    k, ivs = k[order], ivs[order]

    try:
        from scipy.interpolate import UnivariateSpline

        spline = UnivariateSpline(k, ivs, k=3, s=len(k) * 1e-4)

        def iv_of_K(K):
            return np.maximum(spline(np.log(np.asarray(K, dtype=float) / forward)), 1e-4)

    except ImportError:
        deg = min(3, len(k) - 1)
        coeffs = np.polyfit(k, ivs, deg)
        poly = np.poly1d(coeffs)

        def iv_of_K(K):
            return np.maximum(poly(np.log(np.asarray(K, dtype=float) / forward)), 1e-4)

    return iv_of_K


def implied_density(
    strikes: np.ndarray,
    ivs: np.ndarray,
    spot: float,
    forward: float,
    tau: float,
    r: float,
    q_div: float,
    *,
    grid: np.ndarray | None = None,
    n: int = 400,
) -> tuple[np.ndarray, np.ndarray]:
    """Breeden-Litzenberger risk-neutral density q on a strike grid (design doc 9.8).

        q(K) ~= e^{r tau} * [C(K+dK) - 2 C(K) + C(K-dK)] / dK^2

    Returns ``(grid, q)`` with q clipped non-negative and normalized so sum(q*dK)=1.
    Sanity check available to callers: E_q[S_T] ~= forward.
    """
    strikes = np.asarray(strikes, dtype=float)
    iv_of_K = fit_smile(strikes, ivs, forward)
    if grid is None:
        grid = np.linspace(strikes.min(), strikes.max(), n)

    iv_grid = iv_of_K(grid)
    calls = bs_price(spot, grid, tau, r, q_div, iv_grid, "call")
    calls = np.asarray(calls, dtype=float)

    dK = np.gradient(grid)
    # second derivative via finite differences on the (possibly non-uniform) grid
    d2C = np.gradient(np.gradient(calls, grid), grid)
    q = np.exp(r * tau) * d2C
    q = np.clip(q, 0.0, None)
    mass = float(np.sum(q * dK))
    if mass > 0:
        q = q / mass
    return grid, q
