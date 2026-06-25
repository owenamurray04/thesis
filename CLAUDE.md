# CLAUDE.md — working agreement for this repo

This is the **Options Strategy Engine (OSE)**: it turns a *drawn probability belief* about
where a stock lands at expiration into a *ranked menu of optimal option structures*.

**The full specification is `MVP Design Doc.md` at the repo root. It is the source of
truth. Consult it; do not re-derive its decisions.** Every code module cites the section
it implements (e.g. "design doc 9.4"). When code and doc disagree, the doc wins unless an
entry in `docs/decisions-open.md` says otherwise.

Read these before starting work:
1. `MVP Design Doc.md` — the spec. At minimum the Decision Log (§0) and the section you're touching.
2. `docs/build-plan.md` — the ordered, vertical-slice build sequence. **Build in this order.**
3. `docs/decisions-open.md` — questions the human still owns. **Do not silently resolve these.**

## What already exists (done + tested — don't rewrite it)

- `backend/src/ose/mathx/` — the verified math core (§9): Black-Scholes pricing/Greeks/IV,
  the two-piece lognormal belief, payoff/breakevens/extremes, scoring integrals
  (EV/PoP/ROI + the per-leg edge decomposition), Breeden–Litzenberger `q`. **26 golden
  tests pass.** Treat these signatures as stable; extend, don't replace.
- `backend/src/ose/model.py` — canonical engine-facing dataclasses (§7.2).
- `backend/src/ose/contracts.py` — pydantic wire models: `ScoringBundle` (§10.3) and API
  responses (§10.6). The locked seam between server and client.
- `backend/src/ose/providers/` — the provider Protocol (§7.3) and `FixtureProvider`, a
  deterministic offline chain. **Build and test everything against the fixture first.**
- `frontend/src/types/contracts.ts` — the TS mirror of `contracts.py`. Keep in lockstep.

## What to build (in `docs/build-plan.md` order)

`backend/src/ose/engine/` (candidate generation + scoring, §6) → `backend/src/ose/api/`
(FastAPI `/bundle`, §10) → the React client (§8, §12) → real providers (§7).

## The four locked seams — never break these

1. **Engine input (D5):** the engine consumes only the belief density `{(S_i, f_i)}` on a
   grid. UI expressiveness must never leak into engine code.
2. **ScoringBundle (§10.3):** one payload per (ticker, expiration); the client is then
   self-sufficient. Ship belief-*independent* fields only; EV/PoP/ROI recompute client-side.
3. **Provider interface (§7.3):** engine/UI never call a vendor API directly.
4. **REST API (§10.6):** stateless, no WebSocket (the live loop never calls the server).

## Commands

Backend (Python, `uv`):
```bash
cd backend
uv venv && source .venv/bin/activate
uv pip install -e ".[dev,fallback]"
uv run pytest            # golden tests — keep them green
uv run ruff check . && uv run mypy src
```
Frontend (Node):
```bash
cd frontend
npm install
npm run dev              # Vite dev server
npm run typecheck && npm run test
```

## Conventions

- **Python 3.11+, numpy-first.** The math core kernels stay numpy + stdlib; `scipy` is used
  only where it's the right tool (smile spline, IV root-find). Don't pull heavy deps into
  the hot path. Type-hint everything; `mypy --strict` must pass.
- **Money math uses the ×100 contract multiplier.** Per-share math lives in `mathx`; apply
  the multiplier when computing dollar cost/capital at the structure/engine level. See
  `docs/decisions-open.md` D23 — don't let a per-share number reach a dollar field.
- **Defined risk only.** No naked short options anywhere in candidate generation (§5, D6).
- **Test-first for anything numeric.** New math gets a golden test with a hand-checked value
  before it's wired in. The fixture provider makes this offline and deterministic.
- **The doc's `q` is for explanation, never ranking (§6.0).** Score against real executable
  prices, not modeled fair value.
- **Small, reviewable commits**, one vertical slice at a time. Run the relevant tests before
  marking a slice done.

## Don'ts

- Don't add naked/undefined-risk structures, a second accent color, gradients/glows/emoji in
  the UI (§12 anti-brief), or a stock component-library theme.
- Don't write disclaimer/legal copy — it's deferred and human-owned (`docs/decisions-open.md`).
- Don't make the live loop call the server. Don't put secrets in client code.
- Don't resolve anything in `docs/decisions-open.md` without checking with the human.
