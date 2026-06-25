# Build plan — ordered vertical slices

The design doc is organized by *concept*; this is the order to *build* in. Each slice is
independently runnable and ends with a concrete "done when" test. Build one slice at a
time, commit, run its tests, then move on. Don't start a slice until the one it depends on
is green.

Paste-ready prompts for each slice live in `docs/prompts/` (one file per slice).

Legend: ✅ already done in this scaffold · 🔨 to build · 🧪 its acceptance test.

---

## Slice 0 — Foundation ✅ (done)

Math core (§9), canonical model (§7.2), wire contracts (§10.3/10.6), fixture provider, and
a real mock `ScoringBundle` at `frontend/src/mock/bundle.json` (generated from the fixture).
🧪 `uv run pytest` → 26 passing (pricing, belief, payoff, scoring, q round-trip, fixture).

---

## Slice 1 — The website 🔨 (`frontend/`, §8, §12, §6.6) — `prompts/slice-1-website.md`

Build the UI first, against the **mock bundle**, so progress is visible immediately. Vite +
React + TS. A swappable data source returns the mock now (the real API replaces it in
Slice 4). Belief sculpting → evaluate `{f_i}` client-side → reconstruct each candidate's
payoff from the leg vectors → EV/PoP/ROI and re-rank on every drag, no network (D18). The
2D payoff-over-belief overlay (§8.2), the ranked rail with the faded tail (§8.4 / D16), the
§12 visual language (dark, mono numbers, the anti-brief). This is the core loop made visible.

🧪 `npm run dev`: dragging re-ranks + re-draws smoothly with zero network in the drag loop;
`npm run typecheck` clean; rendered numbers match the mock bundle.

**Slices 2–4 replace the mock with the real engine without changing the UI — that's the
payoff of the locked `ScoringBundle` seam.**

## Slice 2 — Candidate generation 🔨 (`ose/engine/generate.py`, §6.2) — `prompts/slice-2-candidate-generation.md`

The bounded combinatorial search: Stage A prunes the leg pool to ~15–25 belief-relevant,
liquid legs; Stage B enumerates all valid **defined-risk ≤4-leg** combinations. Names are
labels attached afterward (D13); de-duplicate equivalents (§6.2). 5.4 grid is a prior, not a
gate. ⚠️ Labeling + de-dup is a real algorithm — open decision **D24**.

🧪 Over a bullish belief on the fixture, recognizable bull call spreads / long calls appear;
every candidate is defined-risk; the count is in the low thousands (validate §10.8).

## Slice 3 — Pricing, validation & scoring 🔨 (`ose/engine/score.py`, §6.3–6.4, §6.7) — `prompts/slice-3-scoring-pipeline.md`

Executable round-trip pricing (buy@ask/sell@bid, §6.7 L1), liquidity/hygiene gates (L2),
surface denoising (L3), capital + tier (×100 multiplier, **D23**), EV/PoP/ROI via
`mathx.scoring`, merit × execution quality, the uncertainty `u` and the `EV − λu` lower
bound (L4). The §6.7 noise defenses are load-bearing.

🧪 A known spread gets the hand-computed EV/PoP; a crossed/penny leg is gated out; ranking
is stable under price jitter.

## Slice 4 — Bundle endpoint + wire the website 🔨 (`ose/api/`, §10.2–10.6) — `prompts/slice-4-bundle-api.md`

FastAPI `/api/bundle/{ticker}?expiration=…` builds the `ScoringBundle` from Slices 2–3 once
per (ticker, expiration) and caches it; plus `/expirations`, `/history`, `/quote`. Secrets
server-side only. Then swap the website's mock data source for this endpoint — UI unchanged.

🧪 Bundle validates against `contracts.py`; **schema-parity test** between `contracts.py`
(`model_json_schema()`) and `contracts.ts`; fixture bundle is a few hundred KB; the website
renders the live bundle identically to the mock.

## Slice 5 — Real data providers 🔨 (`ose/providers/`, §7.4–7.8) — `prompts/slice-5-real-data.md`

yfinance first (no auth), then Tradier (official, timestamps that make the freshness gate
real). Both behind the existing Protocol; absorb each feed's quirks in the adapter (§7.5,
§7.8). Badge "delayed ~15 min".

🧪 Engine tests pass with the live adapter for a liquid name (e.g. SPY); provider-down
raises the typed error and the UI degrades gracefully (§7.9).

## Slice 6 — The signature extras (D17) 🔨 — `prompts/slice-6-extras.md`

Only after the loop works, in priority order: market-`q` overlay (§6.8), per-trade Greeks
(§9.3), multi-expiration laddering (§4.4), then the 3D terrain — ship the held-to-expiration
ridge first; the mark-to-market interior is open decision **D26** and must not block
anything — and the decorative ghost paths (§8.5).

---

## Cross-cutting, do continuously

- Keep `uv run pytest` and `npm run typecheck` green; add a golden test with every numeric change.
- Keep `contracts.py` ⇄ `contracts.ts` in lockstep (the schema-parity test in Slice 4 enforces it),
  and the client EV/PoP within 1e-6 of Python (the parity test, **D25**).
- Honor the four locked seams (CLAUDE.md). Re-read the relevant doc section before each slice.
- Before any deploy, run a security review of the diff (the engine fetches remote data + holds a token).
