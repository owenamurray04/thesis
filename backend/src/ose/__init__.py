"""Options Strategy Engine (OSE) -- backend package.

Turns a drawn probability belief into a ranked menu of optimal option structures.
See the design document at the repo root (``MVP Design Doc.md``) for the full rationale;
every module here cites the section it implements.

Layout:
  ose.mathx      -- verified math core (Section 9): pricing, belief, payoff, scoring, q
  ose.model      -- canonical engine-facing data model (Section 7.2), stdlib dataclasses
  ose.contracts  -- pydantic wire models for the API (Sections 10.3/10.6)
  ose.providers  -- market-data adapters behind one interface (Section 7)
  ose.engine     -- candidate generation + scoring pipeline (Section 6)   [TODO: Claude Code]
  ose.api        -- FastAPI app exposing the bundle endpoint (Section 10)  [TODO: Claude Code]
"""

__version__ = "0.0.1"
