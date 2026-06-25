"""The fixture provider must be internally self-consistent (design doc 7.1).

If the synthetic chain is priced from a known IV, then inverting Black-Scholes on the
mid must recover that IV. This guards the engine's test bench against drift.
"""

import math

import pytest

from ose.mathx.blackscholes import implied_vol
from ose.providers.base import MarketDataProvider
from ose.providers.fixture import FixtureProvider


def test_fixture_satisfies_provider_protocol():
    prov = FixtureProvider()
    assert isinstance(prov, MarketDataProvider)


def test_mid_inverts_back_to_input_iv():
    prov = FixtureProvider(spot=100.0, r=0.04, q_div=0.0, base_vol=0.25, skew=-0.10)
    expiry = prov.get_expirations("TEST")[3]
    chain = prov.get_option_chain("TEST", expiry)
    tau = (expiry - prov._today).days / 365.0
    # check a handful of near-the-money contracts
    near = [c for c in chain.contracts if 90 <= c.strike <= 110 and c.type == "call"]
    assert near
    for c in near:
        recovered = implied_vol(c.mid, prov.spot, c.strike, tau, prov.carry.r, prov.carry.q_div, "call")
        assert recovered == pytest.approx(c.implied_vol, abs=1e-3)


def test_snapshot_is_complete():
    prov = FixtureProvider()
    snap = prov.get_snapshot("TEST", prov.get_expirations("TEST")[0])
    assert snap.underlying.spot > 0
    assert len(snap.chain.contracts) > 0
    assert len(snap.history) > 0
    assert snap.carry.r >= 0
