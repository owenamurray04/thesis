"""The belief model: a two-piece (split) lognormal terminal-price density.

Reference: design doc Section 3.2 / 9.5. The UI produces ``(m, sigma_down, sigma_up, T)``;
the engine consumes only the normalized density ``f(S)`` on a shared price grid (D5).
This module is the *only* place the belief shape lives, so swapping in a richer belief
family later (fat tails, multi-hump) changes only how ``f`` is produced, not consumed.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# Clamp floors/caps so degenerate sculpting stays valid (design doc 3.6 / 11.1).
SIGMA_FLOOR = 1e-3          # near-spike belief -> resolves to a butterfly, not div-by-0
MAX_SKEW_RATIO = 6.0        # cap sigma_up/sigma_down (and inverse) -> no pathological sliver


@dataclass(frozen=True)
class Belief:
    """The four numbers the engine receives from the sculpting UI (design doc 3.3)."""

    m: float            # median / center price (50% mass each side)
    sigma_down: float   # downside log-width
    sigma_up: float     # upside log-width
    T_days: float       # calendar days to the chosen expiration

    def clamped(self) -> "Belief":
        sd = max(self.sigma_down, SIGMA_FLOOR)
        su = max(self.sigma_up, SIGMA_FLOOR)
        # Cap extreme skew in both directions.
        if su / sd > MAX_SKEW_RATIO:
            su = sd * MAX_SKEW_RATIO
        if sd / su > MAX_SKEW_RATIO:
            sd = su * MAX_SKEW_RATIO
        return Belief(max(self.m, 1e-6), sd, su, self.T_days)


def two_piece_lognormal_pdf(S, m: float, sigma_down: float, sigma_up: float):
    """Two-piece lognormal density f(S) (design doc 9.5).

    Works in log-price x = ln S with sigma_down below the center and sigma_up above,
    scaled to join continuously at the peak and integrate to 1:

        g(x) = A * exp(-(x-mu)^2 / (2 sigma_down^2))   for x <= mu
               A * exp(-(x-mu)^2 / (2 sigma_up^2))     for x >  mu
        A    = sqrt(2/pi) / (sigma_down + sigma_up)
        f(S) = g(ln S) / S

    ``sigma_down == sigma_up`` recovers an ordinary lognormal.
    """
    S = np.asarray(S, dtype=float)
    out = np.zeros_like(S)
    pos = S > 0
    x = np.log(S[pos])
    mu = np.log(m)
    A = np.sqrt(2.0 / np.pi) / (sigma_down + sigma_up)
    sigma = np.where(x <= mu, sigma_down, sigma_up)
    g = A * np.exp(-((x - mu) ** 2) / (2.0 * sigma * sigma))
    out[pos] = g / S[pos]
    return out


def build_grid(
    belief: Belief,
    *,
    n: int = 400,
    n_sigma: float = 4.0,
    must_cover: np.ndarray | None = None,
    eps: float = 1e-6,
) -> np.ndarray:
    """Shared price grid spanning the belief support AND all candidate strikes.

    The grid must contain every enumerated strike or payoffs get clipped
    (design doc 11.5). Pass listed strikes via ``must_cover`` to guarantee coverage.
    Uniform in S (simple payoff integration). Range per design doc 9.9.
    """
    sigma_bar = max(belief.sigma_up, belief.sigma_down)
    lo = max(eps, belief.m * np.exp(-n_sigma * sigma_bar))
    hi = belief.m * np.exp(+n_sigma * sigma_bar)
    if must_cover is not None and len(must_cover) > 0:
        pad = 0.05 * (hi - lo)
        lo = min(lo, float(np.min(must_cover)) - pad)
        hi = max(hi, float(np.max(must_cover)) + pad)
        lo = max(lo, eps)
    return np.linspace(lo, hi, n)


def belief_on_grid(belief: Belief, grid: np.ndarray) -> np.ndarray:
    """Evaluate and normalize the belief on a grid so sum(f_i * dS_i) == 1 (9.9)."""
    b = belief.clamped()
    f = two_piece_lognormal_pdf(grid, b.m, b.sigma_down, b.sigma_up)
    dS = np.gradient(grid)
    mass = float(np.sum(f * dS))
    if mass <= 0:
        raise ValueError("belief integrated to non-positive mass; check grid/params")
    return f / mass


def seed_from_market(forward: float, atm_iv: float, tau_years: float, T_days: float) -> Belief:
    """Default 'no edge' cloud = the market's own implied distribution (design doc 3.4).

    Center at the forward, symmetric log-width = atm_iv * sqrt(tau). The user then
    deforms away from the market, which is exactly what the engine measures (f vs q).

    NOTE (open decision D21, see docs/decisions-open.md): seeding at the *risk-neutral*
    forward makes 'no edge' == 'agree with market'. Whether the user's belief is meant
    as a real-world or risk-neutral object is still being decided; this default does not
    foreclose either choice, but the 'expected profit' headline inherits a risk-premium
    bias if the belief is later interpreted as real-world.
    """
    sigma = atm_iv * np.sqrt(tau_years)
    return Belief(m=forward, sigma_down=float(sigma), sigma_up=float(sigma), T_days=T_days)
