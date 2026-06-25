"""Market-data providers behind one interface (design doc Section 7)."""

from .base import MarketDataProvider, ProviderError
from .fixture import FixtureProvider

__all__ = ["MarketDataProvider", "ProviderError", "FixtureProvider"]
