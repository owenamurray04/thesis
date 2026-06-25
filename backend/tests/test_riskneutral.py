"""Round-trip test for the risk-neutral density (design doc 6.8 / 9.8).

Generate a chain from a KNOWN flat-vol world, recover q via Breeden-Litzenberger, and
assert it matches the known lognormal: E_q[S_T] ~= forward and the peak sits near the
forward. This is the synthetic-chain validation the design review called for.
"""

import math

import numpy as np
import pytest

from ose.mathx.riskneutral import implied_density
from ose.providers.fixture import FixtureProvider


def test_q_recovers_forward_under_flat_vol():
    prov = FixtureProvider(spot=100.0, r=0.04, q_div=0.0, base_vol=0.25, skew=0.0)
    expiry = prov.get_expirations("TEST")[3]  # 90d
    chain = prov.get_option_chain("TEST", expiry)
    tau = (expiry - prov._today).days / 365.0
    forward = prov.spot * math.exp((prov.carry.r - prov.carry.q_div) * tau)

    calls = [c for c in chain.contracts if c.type == "call"]
    strikes = np.array([c.strike for c in calls])
    ivs = np.array([c.implied_vol for c in calls])

    grid, q = implied_density(
        strikes, ivs, prov.spot, forward, tau, prov.carry.r, prov.carry.q_div, n=1200
    )
    dS = np.gradient(grid)
    assert np.sum(q * dS) == pytest.approx(1.0, abs=1e-6)
    mean_q = float(np.sum(grid * q * dS))
    assert mean_q == pytest.approx(forward, rel=0.02)   # E_q[S_T] ~= forward


def test_q_is_nonnegative():
    prov = FixtureProvider(skew=-0.10)  # with skew, still a valid density
    expiry = prov.get_expirations("TEST")[2]
    chain = prov.get_option_chain("TEST", expiry)
    tau = (expiry - prov._today).days / 365.0
    forward = prov.spot * math.exp((prov.carry.r - prov.carry.q_div) * tau)
    calls = [c for c in chain.contracts if c.type == "call"]
    strikes = np.array([c.strike for c in calls])
    ivs = np.array([c.implied_vol for c in calls])
    _, q = implied_density(strikes, ivs, prov.spot, forward, tau, prov.carry.r, prov.carry.q_div)
    assert np.all(q >= 0.0)
