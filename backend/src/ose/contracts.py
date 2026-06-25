"""Wire contracts -- the locked API/serialization seam (design doc 10.3 / 10.6).

These pydantic v2 models are the JSON the FastAPI server speaks and the client consumes.
They are the single source of truth for the client-side hot loop (D18): the browser gets
ONE ``ScoringBundle`` per (ticker, expiration) and is then self-sufficient, reconstructing
payoffs from leg indices and re-scoring locally on every drag (design doc 6.6 / 10.3).

Keep ``frontend/src/types/contracts.ts`` in lockstep with this file -- a parity test
(build-plan slice 3) asserts the two agree. The internal engine types live in
``ose.model`` (dataclasses); these are deliberately separate so the engine never depends
on the serialization layer.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

OptionType = Literal["call", "put"]
LegKind = Literal["call", "put", "stock"]  # bundle legs include the long-stock benchmark (D11)
LegSide = Literal[1, -1]


# --- request side -------------------------------------------------------------
class BeliefParams(BaseModel):
    """What the sculpting UI sends if it asks the server to evaluate (usually it does
    this locally; included for the optional server-side scoring fallback, design doc 10.6)."""

    m: float = Field(..., gt=0, description="center / mode price")
    sigma_down: float = Field(..., gt=0, description="downside log-width")
    sigma_up: float = Field(..., gt=0, description="upside log-width")
    t_days: float = Field(..., gt=0, description="calendar days to chosen expiration")


# --- the scoring bundle (design doc 10.3) -------------------------------------
class BundleMeta(BaseModel):
    symbol: str
    expiration: date
    spot: float
    forward: float
    r: float
    q_div: float
    fetched_at: datetime
    delayed: bool


class BundleLeg(BaseModel):
    """One pruned primitive leg (~15-25 per bundle, design doc 6.2 Stage A / 10.3).

    ``payoff_vector`` is side-agnostic intrinsic on the shared grid; the client applies
    side/qty. The per-leg belief-edge is intentionally NOT shipped (it is belief-
    dependent and recomputed client-side); only belief-independent fields live here.
    """

    id: int
    type: LegKind                         # call/put, or "stock" for the benchmark leg (D11)
    strike: float                         # ignored for stock legs
    payoff_vector: list[float]            # per-share value on the shared grid (length N);
                                          # intrinsic for options, S itself for a stock leg
    bid: float
    ask: float
    mid: float
    half_spread: float                    # uncertainty unit (design doc 10.4)
    delta: float
    gamma: float
    theta: float
    vega: float
    volume: int
    open_interest: int
    freshness_ts: Optional[datetime] = None
    confidence: float = Field(..., ge=0, le=1)


class BundleCandidateLeg(BaseModel):
    leg_id: int
    side: LegSide
    qty: float = 1.0


class BundleCandidate(BaseModel):
    """A structure as indices into ``legs`` -- tiny (design doc 10.3). Belief-independent
    metrics are precomputed server-side; EV/PoP/ROI are computed on the client per drag."""

    id: int
    legs: list[BundleCandidateLeg]
    name: str                              # familiar label attached afterward (D13)
    net_cost: float                        # conservative executable (design doc 6.7 L1)
    capital: float
    capital_tier: Literal["low", "medium", "high"]
    max_loss: float
    max_gain: float
    breakevens: list[float]
    exec_quality: float = Field(..., ge=0, le=1)   # design doc 6.7
    uncertainty: float                     # u = sum|side*qty*half_spread| (design doc 10.4)
    is_benchmark: bool = False             # long stock is pinned (D11)


class ScoringBundle(BaseModel):
    """The one payload that matters (design doc 10.3). A few hundred KB, fetched once per
    chain; the client runs the live loop against it with no further server calls."""

    meta: BundleMeta
    grid: list[float]                      # shared price grid S_1..S_N (design doc 9.9)
    legs: list[BundleLeg]
    candidates: list[BundleCandidate]
    market_q: Optional[list[float]] = None  # q on the grid, for the overlay (design doc 6.8/D17)


# --- API responses (design doc 10.6) ------------------------------------------
class ExpirationsResponse(BaseModel):
    symbol: str
    expirations: list[date]


class HistoryBar(BaseModel):
    d: date
    open: float
    high: float
    low: float
    close: float


class HistoryResponse(BaseModel):
    symbol: str
    bars: list[HistoryBar]


class QuoteResponse(BaseModel):
    symbol: str
    spot: float
    quote_time: Optional[datetime] = None
    delayed: bool = True
