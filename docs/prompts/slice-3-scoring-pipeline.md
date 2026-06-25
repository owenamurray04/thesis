Read `MVP Design Doc.md` §6.0, §6.3, §6.4, §6.7, and §9.7, then `docs/decisions-open.md`. The website (Slice 1) and candidate generation (Slice 2) are complete; the math core in `backend/src/ose/mathx/` is built and tested — use it, don't rewrite it.

Build **Slice 3 — pricing, validation & scoring** in `backend/src/ose/engine/score.py`:

- Executable round-trip pricing (pay the ask on longs, receive the bid on shorts — §6.7 Layer 1). Rank on the conservative figure; `mid` is for display only. Score against real executable prices, never a modeled Black-Scholes "fair value" (§6.0).
- Data-hygiene gates (§6.7 Layer 2): reject crossed/locked/one-sided quotes, enforce OI/volume floors, cap relative spread, special-case sub-$0.10 legs, and use the worst-leg rule (a structure's liquidity is the minimum across its legs).
- Surface denoising (§6.7 Layer 3): fit the IV smile and price suspect legs off the fitted surface; flag legs whose raw price deviates beyond a threshold. `fit_smile` already exists in `mathx/riskneutral.py`.
- Capital and capital tier (§6.3), then EV / PoP_f / ROI via `mathx.scoring`, the merit score × execution quality (§6.4), the belief-independent uncertainty `u` and the shrinkage lower bound `EV − λu` (§6.7 Layer 4 / §10.4), plus the perturbation and edge-concentration checks.

The ×100 contract multiplier is open decision **D23**: apply it once at the structure level (never inside `mathx`), and add a test that a 1-lot spread's capital equals 100 × the per-share debit. The default factor weights are user-facing (D14); expose them as parameters with the §6.4 defaults.

Produce a plan first and wait for approval. Acceptance tests to add against the fixture: a known bull spread gets the EV/PoP you compute by hand; an artificially crossed or penny leg is gated out; ranking by `EV − λu` is stable under price jitter within the bid/ask (the perturbation test). Keep `uv run pytest` green and commit when done.
