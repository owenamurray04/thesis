"""Deterministic fixture provider -- the engine's test bench (design doc 7.1 abstraction).

Generates a synthetic, fully self-consistent option chain from a *known* Black-Scholes
world (a chosen spot, rate, dividend, and volatility smile). Because the chain is priced
from a known model, tests can:

  * build and score the entire engine offline with NO network and NO flaky live feed,
  * round-trip the risk-neutral density (generate from a known q, recover q via
    Breeden-Litzenberger, assert they match) -- the synthetic-chain validation the
    design review called for.

This is the FIRST thing to build against (build-plan slice 0). Real adapters
(yfinance, Tradier) implement the same Protocol later; nothing downstream changes.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

import numpy as np

from ..mathx.blackscholes import bs_greeks, bs_price
from ..model import (
    Carry,
    ChainSnapshot,
    OptionChain,
    OptionQuote,
    PriceBar,
    Underlying,
)
from .base import ProviderError


class FixtureProvider:
    """A known-world provider. ``name`` and the Protocol methods make it a drop-in."""

    name = "fixture"

    def __init__(
        self,
        *,
        spot: float = 100.0,
        r: float = 0.04,
        q_div: float = 0.0,
        base_vol: float = 0.25,
        skew: float = -0.10,        # vol slope in log-moneyness (equity smile: puts richer)
        half_spread_frac: float = 0.01,  # bid/ask half-width as a fraction of mid
        seed: int = 0,
    ) -> None:
        self.spot = spot
        self.carry = Carry(r=r, q_div=q_div)
        self.base_vol = base_vol
        self.skew = skew
        self.half_spread_frac = half_spread_frac
        self._rng = np.random.default_rng(seed)
        self._today = date(2026, 6, 25)

    # --- the volatility model the synthetic world is priced from ---------------
    def _iv(self, strike: float, forward: float) -> float:
        k = np.log(strike / forward)
        return float(max(self.base_vol + self.skew * k, 0.05))

    def _expirations(self) -> list[date]:
        return [self._today + timedelta(days=d) for d in (14, 30, 60, 90, 180)]

    # --- Protocol surface ------------------------------------------------------
    def get_quote(self, symbol: str) -> Underlying:
        return Underlying(
            symbol=symbol,
            spot=self.spot,
            quote_time=datetime(2026, 6, 25, 15, 45),
            bid=self.spot - 0.01,
            ask=self.spot + 0.01,
        )

    def get_expirations(self, symbol: str) -> list[date]:
        return self._expirations()

    def get_option_chain(self, symbol: str, expiry: date) -> OptionChain:
        if expiry not in self._expirations():
            raise ProviderError(f"fixture has no expiration {expiry} for {symbol}")
        tau = (expiry - self._today).days / 365.0
        forward = self.spot * np.exp((self.carry.r - self.carry.q_div) * tau)
        strikes = np.round(np.arange(0.6, 1.45, 0.05) * self.spot, 2)
        contracts: list[OptionQuote] = []
        for K in strikes:
            iv = self._iv(float(K), float(forward))
            for kind in ("call", "put"):
                mid = float(bs_price(self.spot, float(K), tau, self.carry.r, self.carry.q_div, iv, kind))
                mid = max(mid, 0.0)
                hw = self.half_spread_frac * max(mid, 0.05)
                g = bs_greeks(self.spot, float(K), tau, self.carry.r, self.carry.q_div, iv, kind)
                contracts.append(
                    OptionQuote(
                        type=kind,
                        strike=float(K),
                        expiration=expiry,
                        bid=round(max(mid - hw, 0.0), 4),
                        ask=round(mid + hw, 4),
                        last=round(mid, 4),
                        volume=int(self._rng.integers(50, 5000)),
                        open_interest=int(self._rng.integers(100, 20000)),
                        implied_vol=iv,
                        quote_time=datetime(2026, 6, 25, 15, 45),
                        delta=g["delta"],
                        gamma=g["gamma"],
                        theta=g["theta"] / 365.0,
                        vega=g["vega"] / 100.0,
                        is_standard=True,
                    )
                )
        return OptionChain(symbol=symbol, expiration=expiry, contracts=contracts)

    def get_history(self, symbol: str, lookback: str = "6mo") -> list[PriceBar]:
        n = 126
        rets = self._rng.normal(0.0003, self.base_vol / np.sqrt(252), n)
        prices = self.spot * np.exp(np.cumsum(rets) - np.sum(rets))  # end at spot
        bars: list[PriceBar] = []
        for i, p in enumerate(prices):
            d = self._today - timedelta(days=(n - i))
            bars.append(PriceBar(d=d, open=float(p), high=float(p) * 1.01,
                                 low=float(p) * 0.99, close=float(p)))
        return bars

    def get_snapshot(self, symbol: str, expiry: date) -> ChainSnapshot:
        return ChainSnapshot(
            underlying=self.get_quote(symbol),
            chain=self.get_option_chain(symbol, expiry),
            carry=self.carry,
            fetched_at=datetime(2026, 6, 25, 15, 45),
            delayed=False,
            history=self.get_history(symbol),
        )
