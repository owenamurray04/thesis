Read `MVP Design Doc.md` §6.8, §9.3, §4.4, §8.2, and §8.5, then `docs/decisions-open.md`. The core loop (website + engine + API + real data, Slices 1–5) is complete and working. Build the signature extras (D17) only now, in this priority order, and never let any of them block the core loop.

Build **Slice 6 — the signature extras**:

- Market-`q` overlay (§6.8): wire a toggle that overlays the market-implied density on the belief cloud, showing the user exactly where they disagree with the market. `mathx.riskneutral.implied_density` already computes `q`; the bundle already carries `market_q`. This is presentation only — it must stay decoupled from scoring (§6.0).
- Per-trade Greeks (§9.3): show δ/γ/θ/ν in the expanded row detail, summed across the structure's legs from the bundle's per-leg greeks.
- Multi-expiration laddering (§4.4): when the belief is wide in time, select the nearest 2–3 expirations by time center-of-mass and split the position, weighting each by its share of the belief's time-mass. Frame it in the UI as "spread your timing," not a bet on when the move happens (the honesty note in §4.4).
- 3D terrain (§8.2): ship the held-to-expiration ridge first — the terminal payoff as a surface (Plotly is the fast path). The smooth mark-to-market "interior" needs the time-value modeling deferred in §4 and is open decision **D26**; do not build it without raising D26. Keep the topographic iso-P&L and iso-probability rings as the goal but gate them behind the simpler ridge.
- Probabilistic ghost paths (§8.5): a faint, animated Brownian-bridge fan from spot to a belief-sampled terminal price, re-sampling on a slow loop. Strictly decorative — it is a rendering of the belief, never an input to the engine (D5).

Apply the §12 motion and visual rules throughout (no overshoot, no second accent, color means P&L only). Produce a plan first and wait for approval. Keep `uv run pytest` and `npm run typecheck` green and commit each extra separately.
