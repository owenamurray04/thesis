"""Canonical engine-facing data model (design doc Section 7.2).

These are plain stdlib dataclasses -- the in-memory types the engine and providers pass
around. They are deliberately separate from the pydantic *wire* models in
``contracts.py`` (the JSON the API speaks): the engine should not depend on the
serialization layer, and keeping them split means the math core runs with zero web deps.

Adapters map each vendor's quirks onto this shape (design doc 7.1/7.3) so the engine
never sees a vendor API directly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Literal, Optional

OptionType = Literal["call", "put"]


@dataclass(frozen=True)
class Underlying:
    symbol: str
    spot: float
    quote_time: Optional[datetime] = None
    bid: Optional[float] = None
    ask: Optional[float] = None


@dataclass(frozen=True)
class OptionQuote:
    """One contract (design doc 7.2). Prices per share; multiplier (x100) applied by the
    engine when computing capital/cost in dollars."""

    type: OptionType
    strike: float
    expiration: date
    bid: float
    ask: float
    last: float
    volume: int
    open_interest: int
    implied_vol: Optional[float] = None      # provider-supplied OR computed by us (7.5)
    quote_time: Optional[datetime] = None    # freshness gate (6.7 L2); may be absent on free feeds
    delta: Optional[float] = None
    gamma: Optional[float] = None
    theta: Optional[float] = None
    vega: Optional[float] = None
    is_standard: bool = True                 # non-standard/adjusted contracts excluded (11.3)

    @property
    def mid(self) -> float:
        if self.bid > 0 and self.ask > 0:
            return 0.5 * (self.bid + self.ask)
        return self.last


@dataclass(frozen=True)
class OptionChain:
    symbol: str
    expiration: date
    contracts: list[OptionQuote]


@dataclass(frozen=True)
class Carry:
    """Rates & dividends (design doc 7.2). r by tenor in practice; one rate is fine MVP."""

    r: float            # continuously-compounded risk-free rate
    q_div: float        # continuous dividend yield


@dataclass(frozen=True)
class PriceBar:
    d: date
    open: float
    high: float
    low: float
    close: float


@dataclass(frozen=True)
class ChainSnapshot:
    """Everything one (symbol, expiration) view needs, as returned by a provider."""

    underlying: Underlying
    chain: OptionChain
    carry: Carry
    fetched_at: datetime
    delayed: bool = True
    history: list[PriceBar] = field(default_factory=list)
