"""Golden tests for payoff, breakevens, and extremes (design doc 5.1 / 9.6)."""

import numpy as np
import pytest

from ose.mathx.payoff import (
    Leg,
    breakevens,
    extremes,
    net_cost,
    pnl_curve,
    value_at_expiry,
)

GRID = np.linspace(50.0, 150.0, 4001)


def test_long_call_payoff_breakeven_and_loss():
    legs = [Leg(type="call", side=1, strike=100.0, price=5.0)]
    pnl = pnl_curve(legs, GRID)
    assert pnl[np.argmin(np.abs(GRID - 110))] == pytest.approx(5.0, abs=1e-2)  # 10 intrinsic - 5
    assert breakevens(legs, GRID)[0] == pytest.approx(105.0, abs=2e-2)
    assert extremes(legs, GRID)["max_loss"] == pytest.approx(-5.0, abs=1e-6)


def test_bull_call_spread_max_gain_is_width_minus_debit():
    # +call100 @5, -call110 @2  -> net debit 3, max gain (110-100)-3 = 7, max loss -3
    legs = [
        Leg(type="call", side=1, strike=100.0, price=5.0),
        Leg(type="call", side=-1, strike=110.0, price=2.0),
    ]
    assert net_cost(legs) == pytest.approx(3.0, abs=1e-9)
    ex = extremes(legs, GRID)
    assert ex["max_gain"] == pytest.approx(7.0, abs=1e-6)
    assert ex["max_loss"] == pytest.approx(-3.0, abs=1e-6)


def test_iron_condor_is_defined_risk_with_two_breakevens():
    # short put95/long put90 + short call105/long call110, net credit
    legs = [
        Leg(type="put", side=-1, strike=95.0, price=2.0),
        Leg(type="put", side=1, strike=90.0, price=1.0),
        Leg(type="call", side=-1, strike=105.0, price=2.0),
        Leg(type="call", side=1, strike=110.0, price=1.0),
    ]
    assert net_cost(legs) == pytest.approx(-2.0, abs=1e-9)  # net credit of 2
    bes = breakevens(legs, GRID)
    assert len(bes) == 2
    ex = extremes(legs, GRID)
    assert ex["max_gain"] == pytest.approx(2.0, abs=1e-6)            # keep the credit
    assert ex["max_loss"] == pytest.approx(-(5.0 - 2.0), abs=1e-6)   # width 5 - credit 2


def test_stock_leg_is_linear():
    legs = [Leg(type="stock", side=1, price=100.0)]
    pnl = pnl_curve(legs, GRID)
    assert pnl[np.argmin(np.abs(GRID - 110))] == pytest.approx(10.0, abs=1e-2)
    assert pnl[np.argmin(np.abs(GRID - 90))] == pytest.approx(-10.0, abs=1e-2)


def test_value_at_expiry_matches_manual():
    legs = [Leg(type="call", side=1, strike=100.0, price=0.0)]
    v = value_at_expiry(legs, np.array([90.0, 100.0, 130.0]))
    assert list(v) == [0.0, 0.0, 30.0]
