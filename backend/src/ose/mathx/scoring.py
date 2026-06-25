"""Scoring a structure under the belief: EV, PoP_f, ROI, and the per-leg edge.

Reference: design doc Section 6.4 / 9.7. This is where the belief enters. The headline
identity (design doc 2.5) is that expected profit under the user's belief equals the
edge between belief ``f`` and the market's implied ``q`` -- but we never reconstruct
``q`` to score, because the market price already encodes it (design doc 6.0):

    EV = E_f[PnL] = sum_i PnL(S_i) * f_i * dS_i = E_f[payoff] - NetCost

EV is linear in the legs, which is what makes the live re-score cheap (design doc 6.2 /
10.3): precompute each leg's edge once, then any combination's EV is a dot product.
PoP, max-loss and ROI are NOT linear and are computed on the assembled PnL curve.
"""

from __future__ import annotations

import numpy as np

from .payoff import Leg, _leg_intrinsic, net_cost, pnl_curve


def _weights(grid: np.ndarray, f: np.ndarray) -> np.ndarray:
    """Belief mass per grid cell: f_i * dS_i (normalized to sum 1 upstream)."""
    return f * np.gradient(grid)


def expected_value(legs: list[Leg], grid: np.ndarray, f: np.ndarray) -> float:
    """EV = sum_i PnL(S_i) * f_i * dS_i  (expected profit under the belief, 9.7)."""
    return float(np.sum(pnl_curve(legs, grid) * _weights(grid, f)))


def prob_of_profit(legs: list[Leg], grid: np.ndarray, f: np.ndarray) -> float:
    """PoP_f = sum_{PnL>0} f_i * dS_i  (probability of profit under the belief, 9.7)."""
    pnl = pnl_curve(legs, grid)
    w = _weights(grid, f)
    return float(np.sum(w[pnl > 0.0]))


def roi(legs: list[Leg], grid: np.ndarray, f: np.ndarray, capital: float) -> float:
    """ROI = EV / capital (design doc 9.7). Capital per design doc 6.3."""
    if capital <= 0:
        return float("nan")
    return expected_value(legs, grid, f) / capital


def leg_edge(leg: Leg, grid: np.ndarray, f: np.ndarray) -> float:
    """Per-leg belief-edge e_l = E_f[intrinsic_l] - price_l  (design doc 9.7).

    Precomputed once per leg; any combination's EV is then sum_l side_l*qty_l*e_l.
    """
    w = _weights(grid, f)
    e_intrinsic = float(np.sum(_leg_intrinsic(leg, grid) * w))
    return e_intrinsic - leg.price


def expected_value_via_legs(legs: list[Leg], grid: np.ndarray, f: np.ndarray) -> float:
    """EV reconstructed from per-leg edges -- must equal ``expected_value`` (9.7).

    This is the linear decomposition that powers the bounded combinatorial search; the
    test suite asserts it matches the direct integral to validate the optimization.
    """
    return float(sum(leg.side * leg.qty * leg_edge(leg, grid, f) for leg in legs))


def belief_variance(legs: list[Leg], grid: np.ndarray, f: np.ndarray) -> float:
    """Var_f[PnL] = sum_i (PnL_i - EV)^2 * f_i * dS_i (design doc 9.7, risk term)."""
    pnl = pnl_curve(legs, grid)
    w = _weights(grid, f)
    ev = float(np.sum(pnl * w))
    return float(np.sum((pnl - ev) ** 2 * w))


def merit_score(
    pop_f: float,
    roi_norm: float,
    ev_norm: float,
    *,
    w_pop: float = 0.40,
    w_roi: float = 0.40,
    w_ev: float = 0.20,
) -> float:
    """Weighted merit score (design doc 6.4). Weights are user-facing (D14).

    ``roi_norm`` / ``ev_norm`` are min-max/rank-normalized across surviving candidates
    so the weighted sum mixes comparable [0,1] quantities. Multiply by ExecutionQuality
    (computed in the engine, not here) to get the final Score.
    """
    return w_pop * pop_f + w_roi * roi_norm + w_ev * ev_norm
