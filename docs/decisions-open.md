# Open decisions — human-owned

These are the questions the design doc leaves open or that surfaced while scaffolding.
**Claude Code must not silently resolve any of these.** Each has a recommendation and a
"why it matters." When you decide, record the choice in the design doc's Decision Log (§0)
and delete or update the entry here. The scaffold deliberately does **not** hard-code any
of them — code is written so either choice is a small, localized change.

---

## D21 — What measure is the belief in? (`f` vs `q`) — the deep one

**The question.** The whole thesis (§2.5) is: *expected profit under your belief* =
`E_f[payoff] − price`, and since `price = E_q[payoff]` (discounted), that equals
`∫ payoff·(f − q)` — the edge between your belief `f` and the market's implied density `q`.
That subtraction only means "edge" if `f` and `q` are the **same kind of probability**.
They may not be:

- **`q` is risk-neutral** — the market's *pricing* measure. Its mean sits at the forward
  `S·e^{(r−q_div)τ}` (the stock "drifts" only at the risk-free rate under `q`), and its
  tails are fattened by risk aversion, not by real probability.
- **A real-world belief `p`** is what you actually think will happen. Under the real-world
  measure stocks drift up faster than `r` (the equity risk premium, historically ~4–6%/yr),
  and the downside is less fat than `q` implies.

**The consequence.** Even someone with *zero informational edge* — who knows the true
real-world distribution exactly — has `E_p[payoff] − price ≠ 0` systematically: buying
stock or calls has positive expected return purely from the risk premium. So if the tool
interprets the drawn cloud as an honest real-world forecast, it will tell almost everyone
to **buy / go long**, and will report risk premium *as if it were edge*.

**What the scaffold/doc currently do (§3.4).** The default cloud is seeded at the
risk-neutral forward with `σ = ATM_IV·√τ` — i.e. the default belief ≈ `q`. So "I haven't
moved the cloud" = "I agree with the market" = "zero edge." Clean UX, but it means the user
is implicitly expressing their view **as a deviation from the market's risk-neutral
distribution**, not as their P50 price forecast.

**The options.**

- **A — Risk-neutral-relative (recommended for MVP).** Keep seeding at `q`. Frame the input
  as "your view *relative to what the market is pricing*," and label the headline number
  **"edge vs. market"**, not "expected profit." Internally consistent, needs no risk-premium
  estimate, and is arguably what an options bettor wants (you're betting against the option's
  price, a risk-neutral object). Cost: the headline is not "expected real-world profit" in
  the strict sense; it's profit under a risk-neutral reading of your belief. Honesty is a
  wording problem, not a math problem.
- **B — Real-world measure.** Treat the cloud as the true real-world forecast `p` and convert
  to compare against price (model a risk premium / real-world drift to get the fair
  baseline). More faithful to "this is where I think it'll be," but you must pick an
  unobservable risk-premium parameter, and even the default "agree with market" cloud would
  sit *above* the forward — a stranger UX and a modeling liability.

**Recommendation.** Ship **A**, make the framing explicit in copy, and revisit later if
needed. The engine code is identical either way; only (a) where the default is seeded and
(b) the label on the headline number change. `mathx/belief.py::seed_from_market` already
carries a note pointing here.

**Why it matters concretely.** Under A, a user who drags the cloud to their genuine bullish
forecast sees large "edge" — part of which is just the risk premium they earn for bearing
risk, not mispricing. If "profit" is taken literally they'll be systematically overconfident.
Mitigation (either choice): surface PoP and edge-vs-market prominently and be careful with
the word "profit."

---

## D22 — The center handle is the *mode*, not the *median*

The doc (§3.1/3.3) calls the center `m` "the median (50% of mass each side)." For a split
lognormal that's only true when `σ_up = σ_down`. In general the center is the **mode**, and
mass below it is `σ_down/(σ_down+σ_up)` (proven in `tests/test_belief.py`). Decide one:
(a) relabel `m` as the mode/most-likely price in the UI (simplest, recommended); (b)
reparameterize so the handle truly tracks the median (more math, changes `belief.py`).
Either way the 68/95 band labels remain approximate for skewed clouds — say so in copy.

---

## D23 — The ×100 contract multiplier

`mathx/` works per share (correct and testable). Equity options deliver 100 shares, so
every **dollar** figure — net cost, capital, max loss, tier thresholds (§6.3) — must
multiply option legs by 100 (and stock legs by share count). Decision: apply the multiplier
**once, at the structure/engine level** (Slice 1–2), never inside `mathx`. Add a test that a
1-lot bull spread's capital is `100 × per-share debit`. Flagged so it isn't silently dropped
— a missing ×100 makes every price look 100× too cheap.

---

## D24 — Combination → familiar-strategy labeling & de-dup algorithm

D13 says "attach familiar names afterward" and §6.2 says "de-duplicate economically
equivalent" structures, but neither gives an algorithm. This is real work: canonicalize a
leg set (sort by type/strike/side, normalize quantities) → match against a template library
→ collapse near-identical curves. Decide the approach (template-matching on canonical form
vs. shape-clustering on the payoff vector) before Slice 1. Recommendation: canonical-form
template match for names + payoff-curve hashing for de-dup.

---

## D25 — The math lives in two languages (Python + TypeScript)

D18 runs the live scoring loop client-side, so payoff assembly + EV + PoP exist in **both**
Python (bundle build, tests) and TS (hot loop). They must agree to the penny or the screen
won't match the tested values. Decision: add a **parity test** (Slice 4) that runs both over
a shared fixture vector and asserts equality within 1e-6. Alternative (heavier): compile the
core to WASM from one source. Recommend the parity test for the MVP.

---

## D26 — 3D terrain scope (the likely timeline-killer)

§8.2's terrain "interior" (mark-to-market value back toward *now*) needs Black-Scholes
valuation through time — exactly the path/time-value modeling deferred in §4. D17 puts 3D in
the MVP. Decision: ship the **held-to-expiration ridge** (terminal payoff as a surface,
Plotly) first; treat the full Three.js topographic terrain with the smooth interior as a
separate follow-on. Don't let it block the core loop (Slices 1–5).

---

## D27 — User capital / risk budget input & position sizing

The MVP journey (§8.1) never asks how much the user wants to spend or risk, yet laddering
"allocates capital ∝ wₖ" (§4.4) and tiers promise "fits your financial situation." Today
candidates are implicitly 1-lot. Decide: (a) keep everything per-1-lot and just *bucket* by
capital tier (simplest, recommended for MVP); or (b) add a budget input and size/round
contracts to it. If (a), say "per 1 contract" in the UI so the dollar figures aren't
misread.

---

## D28 — Legal / disclaimer / "not financial advice" posture

Deferred throughout the doc and **human-owned**. Claude Code must not write disclaimer or
compliance copy. The product's safety properties (defined-risk only, menu-not-directive,
PoP-under-your-own-belief) are built in, but the actual legal language and any terms are for
you (and, if this ever goes public, a lawyer). Leave a placeholder, not invented text.

---

## D29 — American early-exercise is not modeled (acknowledged limitation)

All pricing/PoP is European terminal-payoff math on American equity options. Defined-risk
spreads are largely fine, but short ITM legs can be assigned early (esp. around ex-div,
§11.3). MVP treats this as a badged risk, not a modeled one. Confirm that's acceptable for
launch (recommended yes) and keep the ex-div/earnings flags.
