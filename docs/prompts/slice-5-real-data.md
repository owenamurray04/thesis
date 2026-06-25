Read `MVP Design Doc.md` §7.4 through §7.9, then `backend/src/ose/providers/base.py` (the provider Protocol — the locked seam) and `backend/src/ose/providers/fixture.py` (the reference implementation). The website, engine, and bundle API are complete and run on the fixture provider.

Build **Slice 5 — real market-data providers**, behind the existing Protocol so nothing downstream changes (§7.1/7.3):

- First `backend/src/ose/providers/yfinance_.py` — no-auth, ~15-min delayed, zero setup (§7.8). Get off the fixture with the least friction. Absorb its quirks in the adapter: no real per-quote timestamps (freshness degrades to the snapshot fetch time), after-hours `bid = ask = 0` (fall back to `last` with a synthetic conservative spread, mark the contract low-confidence), and missing/garbled IV (compute it via `mathx.implied_vol`, §7.5).
- Then `backend/src/ose/providers/tradier.py` — the official primary (§7.8): authenticated REST, real `bid_date`/`ask_date` timestamps that make the §6.7 freshness gate real, ORATS greeks/IV. Sandbox base URL + token from env; the same adapter flips to real-time when funded. The token is server-side only and never reaches the client.
- Provider selection by config (`OSE_PROVIDER` in `.env`). Badge data "delayed ~15 min" in the UI (§7.4).
- Exclude adjusted / non-standard contracts (deliverable ≠ 100 shares) from the chain (§11.3).

Produce a plan first and wait for approval.

Acceptance tests: the existing engine tests pass with the live adapter swapped in for a liquid name (e.g. SPY); a provider outage raises the typed `ProviderError` and the UI shows a clean "couldn't load X" state with the fallback offered (§7.9); a thin/empty chain returns few-or-no candidates honestly rather than fabricated liquidity. Keep `uv run pytest` green and commit when done.
