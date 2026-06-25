Read `MVP Design Doc.md` §10.2 through §10.6, then `backend/src/ose/contracts.py` (the pydantic wire models — they are the locked seam; do not change their shape without flagging it). The website (Slice 1) and the engine — candidate generation (Slice 2) and scoring (Slice 3) — are complete.

Build **Slice 4 — the bundle endpoint** in `backend/src/ose/api/`:

- A FastAPI app exposing the §10.6 contract: `GET /api/bundle/{ticker}?expiration=YYYY-MM-DD` (the core call), `GET /api/expirations/{ticker}`, `GET /api/history/{ticker}`, `GET /api/quote/{ticker}`.
- `/bundle` runs candidate generation + scoring once per (ticker, expiration), assembles a `ScoringBundle` (§10.3) from the engine, and caches it behind a TTL interface that can swap to Redis later (§10.7). Ship belief-independent fields only — EV/PoP/ROI are recomputed client-side.
- Stateless, REST only — no WebSocket (the live loop never calls the server, D18). Provider tokens come from env and never reach the response (§10.7).
- Use `FixtureProvider` as the data source for this slice (provider selection by config; real adapters arrive in Slice 5).

Then point the website at the live API: replace the mock data source from Slice 1 (the `loadBundle()` module) with a fetch of `GET /api/bundle/{ticker}?expiration=…`. The UI must not otherwise change — that swap is the whole point of the locked contract. Keep the mock as a dev/offline fallback.

Honor the four locked seams in `CLAUDE.md`. Produce a plan first and wait for approval.

Acceptance tests to add: the assembled bundle validates against `contracts.py`; a schema-parity test compares `contracts.py` (`model_json_schema()`) against `frontend/src/types/contracts.ts` and fails if they drift; the fixture bundle serializes to a few hundred KB (§10.3); the website renders the live bundle identically to the mock. Keep `uv run pytest` green and commit when done.
