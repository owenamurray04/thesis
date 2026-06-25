# Handing this to Claude Code

How to drive the build. The repo is scaffolded: the math core is implemented and tested,
the contracts and the fixture provider exist, and `docs/build-plan.md` defines the order.
Your job is to get Claude Code to execute the slices without drifting.

## The golden rules

1. **One slice per session.** Don't say "build the whole app." Point it at one slice in
   `docs/build-plan.md`, let it finish, run the tests, commit, then start the next slice in
   a fresh/compacted context. Long sessions lose coherence.
2. **Plan before code.** Ask for a plan first; review it against the doc; then let it build.
3. **Tests are the contract.** Make it run `uv run pytest` before declaring a slice done.
4. **Decisions are yours.** If it hits anything in `docs/decisions-open.md`, it should stop
   and ask — not guess.

## First prompt (paste this)

> Read `MVP Design Doc.md` (at least §0 the Decision Log, and §6), then `CLAUDE.md`,
> `docs/build-plan.md`, and `docs/decisions-open.md`. The math core, contracts, and fixture
> provider are already built and tested — don't rewrite them.
>
> We're doing **Slice 1 — candidate generation** (`backend/src/ose/engine/generate.py`,
> design doc §6.2). Before writing code, give me a short plan: the Stage-A pruning rules
> you'll use, how you'll enumerate defined-risk ≤4-leg combinations, your approach to the
> named-strategy labeling and de-duplication (this is open decision **D24** — propose an
> approach and flag it for me), and the golden tests you'll add against the fixture
> provider. Wait for my OK before implementing.

Then, per slice, a prompt of the same shape: name the slice, point at the doc section, ask
for a plan + the tests it will add, approve, let it build, run `pytest`, commit.

## Use plan mode

For each slice, start in plan mode (Claude Code: `shift+tab` to planning, or ask "plan
only, don't edit yet"). Review the plan against the design doc and the four locked seams in
`CLAUDE.md`. Approve, then let it implement. This is the single biggest lever against drift.

## Subagents — when they help here

Spawn a subagent only for self-contained, well-specified work; they start cold and re-derive
context, so the architectural spine stays in your main session. Good uses for this project:

- **Math/spec auditor.** After a slice touches scoring or pricing, have a subagent audit the
  implementation against design doc §6/§9 and the golden tests — a second pair of eyes on the
  part you can't eyeball.
- **`/security-review`** on the diff before any deploy — the server fetches remote data and
  holds a provider token.
- **Parallel adapter work.** While the main session builds the engine, a subagent can build
  the yfinance adapter against the locked provider Protocol (§7.3) — it shares the contract,
  so it can't drift far.
- **Research spikes.** "Measure the real candidate count for SPY" (validates §10.8) or
  "prototype the SVI smile fit" — bounded questions with a clear answer.

Don't use a subagent for the core architectural decisions or anything touching the four
locked seams — keep those where context accumulates.

## Verification each slice (build it into the prompt)

- `uv run pytest` green, `uv run ruff check . && uv run mypy src` clean.
- New numeric code ships with a hand-checked golden test.
- `contracts.py` ⇄ `contracts.ts` parity holds (Slice 3 test).
- Client EV/PoP match server within 1e-6 (Slice 4 parity test, D25).
