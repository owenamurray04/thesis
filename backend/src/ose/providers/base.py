"""The provider seam (design doc Section 7.3).

The engine and UI never call a vendor API directly -- they depend only on this
interface, which returns the canonical model (``ose.model``). Swapping yfinance ->
Tradier -> Polygon is a new adapter + a config change, nothing more (design doc 7.1).
Tokens live server-side only and never reach the client (design doc 10.2/10.7).
"""

from __future__ import annotations

from datetime import date
from typing import Protocol, runtime_checkable

from ..model import ChainSnapshot, OptionChain, PriceBar, Underlying


class ProviderError(Exception):
    """Typed error so the UI can show a clean 'couldn't load X' state (design doc 7.9)."""


@runtime_checkable
class MarketDataProvider(Protocol):
    name: str

    def get_quote(self, symbol: str) -> Underlying: ...

    def get_expirations(self, symbol: str) -> list[date]: ...

    def get_option_chain(self, symbol: str, expiry: date) -> OptionChain: ...

    def get_history(self, symbol: str, lookback: str = "6mo") -> list[PriceBar]: ...

    def get_snapshot(self, symbol: str, expiry: date) -> ChainSnapshot:
        """Convenience: everything the bundle build needs for one (symbol, expiry)."""
        ...
