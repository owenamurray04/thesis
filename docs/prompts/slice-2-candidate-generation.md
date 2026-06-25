Read `MVP Design Doc.md` §0 (Decision Log), §5 (the strategy universe), and §6.2 (the bounded combinatorial search), then `docs/decisions-open.md`, and skim the existing `backend/src/ose/mathx/` and `backend/src/ose/providers/fixture.py`. The math core, the contracts, and the fixture provider are already built and tested — do not modify or rewrite them.

The website (Slice 1) is built and runs against a mock bundle; now build the real engine behind it. Build **Slice 2 — candidate generation** in `backend/src/ose/engine/generate.py`, implementing the two-stage search from §6.2:

- Stage A — prune the primitive leg pool to ~15–25 belief-relevant legs: strikes within ≈±3σ of the belief on the side(s) it favors, with acceptable liquidity. Use the §5.4 grid as a pruning prior, never a hard gate — structures outside the "expected" cell still compete if their legs survive.
- Stage B — enumerate every valid defined-risk ≤4-leg combination from the pruned pool (D6, D15). No naked or undefined-risk structures anywhere.
- Precompute each candidate's payoff vector on the shared price grid (it is belief-independent, so cache it for the live loop).
- Attach familiar strategy names as labels afterward, and de-duplicate economically-equivalent and near-identical structures.

The named-strategy labeling and de-duplication algorithm is open decision **D24** in `docs/decisions-open.md` and is unresolved. Propose your approach in the plan and stop for approval before implementing it — do not pick one silently.

Honor the locked seams in `CLAUDE.md`: the engine consumes only the belief density on a grid (D5); build and test exclusively against `FixtureProvider`, never a live feed.

Produce a plan first and wait for approval before writing code. The plan should cover: the Stage-A pruning rules, the Stage-B enumeration scheme, the candidate count you expect (validate the §10.8 "few thousand" assumption against the fixture chain and flag it if it is far higher), your D24 proposal, and the golden tests you will add.

Acceptance tests to add against the fixture: over a bullish belief, recognizable bull call spreads and long calls appear among the candidates; every candidate is defined-risk; the candidate count sits in the expected range. Keep `uv run pytest` green and commit when the slice is done.
