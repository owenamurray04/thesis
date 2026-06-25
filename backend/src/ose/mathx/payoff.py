"""Strategy payoff, P&L, breakevens, and extremes on the shared price grid.

Reference: design doc Section 5.1 / 9.6. A structure is a set of legs; each leg is a
call, put, or share position. Payoff is piecewise-linear with kinks at the strikes, so
breakevens are zero-crossings and extremes live at kinks or the outer asymptotes (always
finite under the defined-risk rule, design doc 5.1).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

LegType = Literal["call", "put", "stock"]
Side = Literal[1, -1]  # +1 long, -1 short


@dataclass(frozen=True)
class Leg:
    """A single primitive leg (design doc 5.1).

    For stock legs ``strike`` is ignored and ``price`` is the per-share entry price S0.
    Prices are per share; the contract multiplier (x100) is applied at the structure
    level, not here (see ``Structure`` and design doc 11.x multiplier handling).
    """

    type: LegType
    side: Side
    qty: float = 1.0
    strike: float = 0.0
    price: float = 0.0  # executable price paid/received per share (ask for long, bid for short)


def _leg_intrinsic(leg: Leg, S: np.ndarray) -> np.ndarray:
    if leg.type == "call":
        return np.maximum(S - leg.strike, 0.0)
    if leg.type == "put":
        return np.maximum(leg.strike - S, 0.0)
    if leg.type == "stock":
        return S  # value of a share at expiry is S; entry cost handled in net_cost
    raise ValueError(f"unknown leg type {leg.type!r}")


def value_at_expiry(legs: list[Leg], S: np.ndarray) -> np.ndarray:
    """Sum_l side_l * qty_l * intrinsic_l(S) (design doc 9.6)."""
    S = np.asarray(S, dtype=float)
    out = np.zeros_like(S)
    for leg in legs:
        out += leg.side * leg.qty * _leg_intrinsic(leg, S)
    return out


def net_cost(legs: list[Leg]) -> float:
    """Net debit (>0) or credit (<0): Sum_l side_l * qty_l * price_l (design doc 9.6).

    Longs cost (pay), shorts credit. For stock, ``price`` is S0 (debit to go long).
    """
    return float(sum(leg.side * leg.qty * leg.price for leg in legs))


def pnl_curve(legs: list[Leg], S: np.ndarray) -> np.ndarray:
    """PnL(S) = ValueAtExpiry(S) - NetCost (per share / per unit)."""
    return value_at_expiry(legs, S) - net_cost(legs)


def _kink_strikes(legs: list[Leg]) -> np.ndarray:
    ks = sorted({leg.strike for leg in legs if leg.type in ("call", "put")})
    return np.array(ks, dtype=float)


def breakevens(legs: list[Leg], S: np.ndarray) -> list[float]:
    """Zero-crossings of PnL, found by scanning adjacent grid points (design doc 9.6).

    Linear interpolation of the crossing point on each segment. Uses the supplied grid;
    it should span all strikes (design doc 11.5) for the crossings to be complete.
    """
    S = np.asarray(S, dtype=float)
    pnl = pnl_curve(legs, S)
    out: list[float] = []
    sign = np.sign(pnl)
    for i in range(len(S) - 1):
        a, b = pnl[i], pnl[i + 1]
        if a == 0.0:
            out.append(float(S[i]))
        elif sign[i] != sign[i + 1] and sign[i + 1] != 0:
            # linear interpolation of the zero crossing
            t = a / (a - b)
            out.append(float(S[i] + t * (S[i + 1] - S[i])))
    # de-dup near-identical crossings
    deduped: list[float] = []
    for x in out:
        if not deduped or abs(x - deduped[-1]) > 1e-9:
            deduped.append(x)
    return deduped


def extremes(legs: list[Leg], S: np.ndarray) -> dict[str, float]:
    """Max gain / max loss over kinks and outer grid points (design doc 9.6).

    Evaluating PnL at every strike kink plus the two grid ends captures the extremes of
    a piecewise-linear payoff. Defined-risk structures keep both finite; an unbounded
    stock/long-option leg is bounded here by the grid range and flagged by the caller.
    """
    S = np.asarray(S, dtype=float)
    pts = np.concatenate([[S[0]], _kink_strikes(legs), [S[-1]]])
    pts = pts[(pts >= S[0]) & (pts <= S[-1])]
    vals = pnl_curve(legs, pts)
    return {"max_gain": float(np.max(vals)), "max_loss": float(np.min(vals))}
