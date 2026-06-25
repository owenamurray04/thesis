"""Golden tests for Black-Scholes pricing, Greeks, and IV inversion (design doc 9.2-9.4)."""

import math

import pytest

from ose.mathx.blackscholes import bs_greeks, bs_price, implied_vol


def test_atm_call_golden_value():
    # The canonical textbook value: S=K=100, tau=1, r=5%, q=0, sigma=20%.
    c = float(bs_price(100, 100, 1.0, 0.05, 0.0, 0.20, "call"))
    assert c == pytest.approx(10.4506, abs=1e-4)


def test_put_call_parity():
    S, K, tau, r, q = 100, 105, 0.75, 0.03, 0.01
    sigma = 0.28
    c = float(bs_price(S, K, tau, r, q, sigma, "call"))
    p = float(bs_price(S, K, tau, r, q, sigma, "put"))
    lhs = c - p
    rhs = S * math.exp(-q * tau) - K * math.exp(-r * tau)
    assert lhs == pytest.approx(rhs, abs=1e-9)


def test_iv_round_trips():
    S, K, tau, r, q = 100, 110, 0.5, 0.04, 0.0
    for true_sigma in (0.10, 0.20, 0.55, 1.20):
        price = float(bs_price(S, K, tau, r, q, true_sigma, "call"))
        recovered = implied_vol(price, S, K, tau, r, q, "call")
        assert recovered == pytest.approx(true_sigma, abs=1e-5)


def test_iv_rejects_arbitrage_violating_price():
    # A price above the call's upper bound (S e^{-q tau}) is a data artifact (6.7).
    with pytest.raises(ValueError):
        implied_vol(150.0, 100, 100, 1.0, 0.05, 0.0, "call")


def test_atm_call_delta():
    g = bs_greeks(100, 100, 1.0, 0.05, 0.0, 0.20, "call")
    # d1 = (0 + (0.05 + 0.02)*1)/0.2 = 0.35 -> N(0.35) ~= 0.6368
    assert g["delta"] == pytest.approx(0.6368, abs=1e-3)
    assert g["gamma"] > 0
    assert g["vega"] > 0


def test_call_put_delta_relationship():
    # call delta - put delta = e^{-q tau}
    c = bs_greeks(100, 100, 1.0, 0.05, 0.02, 0.20, "call")["delta"]
    p = bs_greeks(100, 100, 1.0, 0.05, 0.02, 0.20, "put")["delta"]
    assert (c - p) == pytest.approx(math.exp(-0.02 * 1.0), abs=1e-9)
