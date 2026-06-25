"""Golden tests for scoring under the belief (design doc 6.4 / 9.7).

The load-bearing test is ``test_ev_linearity``: it proves the per-leg edge decomposition
that powers the bounded combinatorial search equals the direct payoff integral.
"""

import numpy as np
import pytest

from ose.mathx.belief import Belief, belief_on_grid, build_grid
from ose.mathx.payoff import Leg
from ose.mathx.scoring import (
    expected_value,
    expected_value_via_legs,
    prob_of_profit,
    roi,
)


def _belief_and_grid():
    b = Belief(m=100.0, sigma_down=0.25, sigma_up=0.25, T_days=30)
    strikes = np.array([80, 90, 95, 100, 105, 110, 120], dtype=float)
    grid = build_grid(b, n=3000, must_cover=strikes)
    f = belief_on_grid(b, grid)
    return grid, f


def test_ev_linearity_decomposition():
    grid, f = _belief_and_grid()
    legs = [
        Leg(type="call", side=1, strike=100.0, price=5.0),
        Leg(type="call", side=-1, strike=110.0, price=2.0),
        Leg(type="put", side=-1, strike=95.0, price=2.0),
    ]
    direct = expected_value(legs, grid, f)
    via_legs = expected_value_via_legs(legs, grid, f)
    assert direct == pytest.approx(via_legs, abs=1e-9)


def test_pop_in_unit_interval_and_matches_mass():
    grid, f = _belief_and_grid()
    # A long call profits above strike+premium; PoP_f is the belief mass there.
    legs = [Leg(type="call", side=1, strike=100.0, price=5.0)]
    pop = prob_of_profit(legs, grid, f)
    dS = np.gradient(grid)
    mass_above_be = float(np.sum((f * dS)[grid > 105.0]))
    assert 0.0 <= pop <= 1.0
    assert pop == pytest.approx(mass_above_be, abs=2e-3)


def test_roi_is_ev_over_capital():
    grid, f = _belief_and_grid()
    legs = [
        Leg(type="call", side=1, strike=100.0, price=5.0),
        Leg(type="call", side=-1, strike=110.0, price=2.0),
    ]
    capital = 3.0  # net debit = max loss for a debit spread (design doc 6.3)
    assert roi(legs, grid, f, capital) == pytest.approx(
        expected_value(legs, grid, f) / capital, abs=1e-12
    )


def test_zero_edge_when_belief_equals_pricing_measure():
    # If the belief is centered exactly where a single share is fairly priced and the
    # structure is a fair coin, EV should be small. Here we only sanity-check sign logic:
    # a long call far OTM under a tight belief at spot has negative EV (you overpay).
    b = Belief(m=100.0, sigma_down=0.10, sigma_up=0.10, T_days=20)
    grid = build_grid(b, n=3000, must_cover=np.array([100.0, 140.0]))
    f = belief_on_grid(b, grid)
    legs = [Leg(type="call", side=1, strike=140.0, price=3.0)]
    assert expected_value(legs, grid, f) < 0.0
