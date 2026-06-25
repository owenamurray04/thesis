# OSE backend

Python engine + API for the Options Strategy Engine. See the design doc at the repo root
(`MVP Design Doc.md`) and `../CLAUDE.md` for conventions.

## Setup (uv)

```bash
cd backend
uv venv && source .venv/bin/activate
uv pip install -e ".[dev,fallback]"
```

## Test

```bash
uv run pytest            # all golden tests (Section 9 math, fixture provider, q round-trip)
```

## Layout

- `src/ose/mathx/` — verified math core (Section 9): pricing, belief, payoff, scoring, q.
- `src/ose/model.py` — canonical engine-facing dataclasses (Section 7.2).
- `src/ose/contracts.py` — pydantic wire models for the API (Sections 10.3 / 10.6).
- `src/ose/providers/` — market-data adapters behind one interface (Section 7).
  `fixture.py` is the deterministic offline test bench; build against it first.
- `src/ose/engine/` — candidate generation + scoring pipeline (Section 6). **TODO.**
- `src/ose/api/` — FastAPI app exposing `/bundle` (Section 10). **TODO.**

The `engine/` and `api/` packages are the first build-plan slices for Claude Code; the
math core and contracts they depend on are already implemented and tested.
