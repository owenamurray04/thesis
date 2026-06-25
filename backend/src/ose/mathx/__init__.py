"""Verified math core (design doc Section 9).

Pure numerical kernels with a minimal dependency footprint (numpy + stdlib, with scipy
used only where it is genuinely the right tool: the smile spline and the IV root-find
fallback). Everything here is covered by golden tests in ``backend/tests``.
"""

from .belief import Belief, belief_on_grid, build_grid, seed_from_market, two_piece_lognormal_pdf
from .blackscholes import bs_greeks, bs_price, implied_vol
from .payoff import Leg, breakevens, extremes, net_cost, pnl_curve, value_at_expiry
from .riskneutral import fit_smile, implied_density
from .scoring import (
    belief_variance,
    expected_value,
    expected_value_via_legs,
    leg_edge,
    merit_score,
    prob_of_profit,
    roi,
)

__all__ = [
    "Belief",
    "belief_on_grid",
    "build_grid",
    "seed_from_market",
    "two_piece_lognormal_pdf",
    "bs_greeks",
    "bs_price",
    "implied_vol",
    "Leg",
    "breakevens",
    "extremes",
    "net_cost",
    "pnl_curve",
    "value_at_expiry",
    "fit_smile",
    "implied_density",
    "belief_variance",
    "expected_value",
    "expected_value_via_legs",
    "leg_edge",
    "merit_score",
    "prob_of_profit",
    "roi",
]
