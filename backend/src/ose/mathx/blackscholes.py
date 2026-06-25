"""Black-Scholes-Merton pricing, Greeks, and implied-vol inversion.

Reference: design doc Section 9.2-9.4. All formulas use continuous compounding and a
continuous dividend yield ``q_div``. Time ``tau`` is in years. ``kind`` is "call" or
"put" throughout.

This module is Black-Scholes as *machinery* (price<->IV conversion, Greeks, smile and
q-extraction inputs), NOT as an arbiter of whether a trade is good (design doc 6.3).
"""

from __future__ import annotations

import math
from typing import Literal

import numpy as np

from .normal import norm_cdf, norm_pdf

Kind = Literal["call", "put"]

# Numerical floors so tau->0 / sigma->0 degrade gracefully (design doc 11.2, 11.5).
_TAU_FLOOR = 1e-6
_SIGMA_FLOOR = 1e-6


def _d1_d2(S, K, tau, r, q_div, sigma):
    S = np.asarray(S, dtype=float)
    K = np.asarray(K, dtype=float)
    tau = np.maximum(np.asarray(tau, dtype=float), _TAU_FLOOR)
    sigma = np.maximum(np.asarray(sigma, dtype=float), _SIGMA_FLOOR)
    vol = sigma * np.sqrt(tau)
    d1 = (np.log(S / K) + (r - q_div + 0.5 * sigma * sigma) * tau) / vol
    d2 = d1 - vol
    return d1, d2


def bs_price(S, K, tau, r, q_div, sigma, kind: Kind):
    """Black-Scholes-Merton price of a European call or put (design doc 9.2)."""
    d1, d2 = _d1_d2(S, K, tau, r, q_div, sigma)
    S = np.asarray(S, dtype=float)
    K = np.asarray(K, dtype=float)
    tau = np.maximum(np.asarray(tau, dtype=float), _TAU_FLOOR)
    disc_r = np.exp(-r * tau)
    disc_q = np.exp(-q_div * tau)
    if kind == "call":
        return S * disc_q * norm_cdf(d1) - K * disc_r * norm_cdf(d2)
    if kind == "put":
        return K * disc_r * norm_cdf(-d2) - S * disc_q * norm_cdf(-d1)
    raise ValueError(f"kind must be 'call' or 'put', got {kind!r}")


def bs_greeks(S, K, tau, r, q_div, sigma, kind: Kind) -> dict[str, float]:
    """Delta, gamma, vega, theta, rho (design doc 9.3).

    Vega is per 1.00 of vol (divide by 100 for per-1%). Theta is per year
    (divide by 365 for per calendar day).
    """
    d1, d2 = _d1_d2(S, K, tau, r, q_div, sigma)
    S = float(np.asarray(S, dtype=float))
    K = float(np.asarray(K, dtype=float))
    tau = max(float(tau), _TAU_FLOOR)
    sigma = max(float(sigma), _SIGMA_FLOOR)
    disc_r = math.exp(-r * tau)
    disc_q = math.exp(-q_div * tau)
    pdf_d1 = float(norm_pdf(d1))
    sqrt_tau = math.sqrt(tau)

    gamma = disc_q * pdf_d1 / (S * sigma * sqrt_tau)
    vega = S * disc_q * pdf_d1 * sqrt_tau
    if kind == "call":
        delta = disc_q * float(norm_cdf(d1))
        theta = (
            -(S * disc_q * pdf_d1 * sigma) / (2.0 * sqrt_tau)
            - r * K * disc_r * float(norm_cdf(d2))
            + q_div * S * disc_q * float(norm_cdf(d1))
        )
        rho = K * tau * disc_r * float(norm_cdf(d2))
    else:
        delta = -disc_q * float(norm_cdf(-d1))
        theta = (
            -(S * disc_q * pdf_d1 * sigma) / (2.0 * sqrt_tau)
            + r * K * disc_r * float(norm_cdf(-d2))
            - q_div * S * disc_q * float(norm_cdf(-d1))
        )
        rho = -K * tau * disc_r * float(norm_cdf(-d2))
    return {"delta": delta, "gamma": gamma, "vega": vega, "theta": theta, "rho": rho}


def _intrinsic(S, K, tau, r, q_div, kind: Kind) -> float:
    """Discounted intrinsic / lower no-arb bound, used to validate prices (9.4)."""
    fwd = S * math.exp((r - q_div) * tau)
    disc_r = math.exp(-r * tau)
    if kind == "call":
        return max(disc_r * (fwd - K), 0.0)
    return max(disc_r * (K - fwd), 0.0)


def implied_vol(
    price: float,
    S: float,
    K: float,
    tau: float,
    r: float,
    q_div: float,
    kind: Kind,
    *,
    tol: float = 1e-8,
    max_iter: int = 100,
) -> float:
    """Invert Black-Scholes for sigma given a market price (design doc 9.4).

    Newton-Raphson seeded with the Brenner-Subrahmanyam ATM guess, falling back to
    bisection when Newton misbehaves (deep ITM/OTM, tiny vega). Raises ``ValueError``
    when the price violates no-arbitrage bounds (a data artifact -> design doc 6.7).
    """
    tau = max(float(tau), _TAU_FLOOR)
    lower = _intrinsic(S, K, tau, r, q_div, kind)
    upper = S * math.exp(-q_div * tau) if kind == "call" else K * math.exp(-r * tau)
    if not (lower - 1e-9 <= price <= upper + 1e-9):
        raise ValueError(
            f"price {price} outside no-arb bounds [{lower:.6f}, {upper:.6f}] for {kind}"
        )

    # Brenner-Subrahmanyam ATM seed.
    sigma = max(math.sqrt(2.0 * math.pi / tau) * (price / S), 1e-3)
    for _ in range(max_iter):
        diff = float(bs_price(S, K, tau, r, q_div, sigma, kind)) - price
        if abs(diff) < tol:
            return sigma
        vega = bs_greeks(S, K, tau, r, q_div, sigma, kind)["vega"]
        if vega < 1e-8:
            break  # tiny vega -> Newton unreliable, hand off to bisection
        step = diff / vega
        sigma_next = sigma - step
        if sigma_next <= 0 or sigma_next > 5.0 or not math.isfinite(sigma_next):
            break
        sigma = sigma_next

    # Robust fallback on a wide bracket: scipy's Brent when available, else bisection.
    def _obj(s: float) -> float:
        return float(bs_price(S, K, tau, r, q_div, s, kind)) - price

    lo, hi = 1e-4, 5.0
    try:
        from scipy.optimize import brentq

        return float(brentq(_obj, lo, hi, xtol=tol, maxiter=200))
    except ImportError:
        for _ in range(200):
            mid = 0.5 * (lo + hi)
            if abs(_obj(mid)) < tol:
                return mid
            if _obj(mid) > 0:
                hi = mid
            else:
                lo = mid
        return 0.5 * (lo + hi)
