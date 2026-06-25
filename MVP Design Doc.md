# Options Strategy Engine — MVP Design Document

**Status:** Living document. Complete first draft (Sections 0–11). The legal / disclaimer posture is
intentionally deferred (to be written separately).
**Purpose:** Make every product, modeling, and engineering decision explicit and work out all
the underlying logic *before* any code is written. When we build, there should be no open
conceptual questions left — only implementation.

---

## 0. Decision Log

Decisions that are locked. Everything downstream assumes these. If one changes, the sections
that depend on it are flagged for revision.

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | What the user expresses | A **probability distribution** over where the price lands at a future date — not a single price target | Matches how the prediction UI works (a cloud with a center and confidence bands); it is the natural, complete description of a market view including *uncertainty* |
| D2 | Belief shape | A **skewable, single-peaked distribution** (split/two-piece lognormal) | Captures center, uncertainty, *and* directional lean while always remaining a valid, sane distribution. Lognormal base matches how prices move and how options are priced |
| D3 | Distribution family | **Lognormal everywhere** (no normal-in-price anywhere) | Prices can't go negative; matches Black-Scholes and the market's own implied distribution, so the belief-vs-market comparison is apples-to-apples |
| D4 | Engine objective | Rank strategies by the **edge between the user's belief `f` and the market-implied distribution `q`** | This is what makes a recommendation *optimal* and not just shape-matching: profit comes from where your view differs from the market's. Fully explainable |
| D5 | Engine input contract | The engine consumes **only the terminal price density `f(S_T)`** sampled on a price grid | Decouples the sculpting UI from the engine entirely. The UI can get arbitrarily expressive without touching engine code |
| D6 | Strategy universe | **Directional + neutral** single-asset structures | Covers "up / down / stays in a range / big move either way." Pairs/market-neutral two-asset trades are deferred to v2 |
| D7 | Time dimension (MVP) | **Terminal-only, with expiration chosen from the cloud's time center-of-mass; ladder across 2–3 expirations when the belief is wide in time** | Held-to-expiration payoffs only depend on terminal price, so this is correct and tractable. Laddering covers "unsure when" without path simulation. True timing bets (calendars) remain v2 |
| D8 | Data source | **Tradier free sandbox (15-min-delayed options data) as primary, behind a provider abstraction**; yfinance as a no-auth offline fallback; funded/paid real-time drop-in later | A 15-min delay is acceptable for the MVP, and Tradier's free sandbox provides exactly that with an *official, stable* API plus ORATS greeks/IV and **real quote timestamps** (which enable the 6.7 freshness gate). It is also the production path — going real-time later is the same API. yfinance stays as a zero-setup fallback |
| D9 | Tech stack | **Python (engine/API) + React (UI)** | Python is the right home for the quant math; React for the interactive chart |
| D10 | This phase | **Design only — no build** | The point of this document. Building starts only once the logic here is settled |
| D11 | The underlying as a strategy | **Long stock is a first-class candidate *and* an always-shown benchmark**; stock-option hybrids (covered call, protective put, collar) are in the universe | Every option recommendation must answer "is this better than just buying shares?" Stock is the natural anchor of comparison and a legitimate answer in its own right |
| D12 | Signature visualization | **Payoff overlaid on the belief — 2D, and a 3D payoff *terrain* with profit/loss as elevation (green above, red below), price/time on the floor, and contour rings for iso-P&L and iso-probability** | This single picture *is* the product's thesis made visible: how much of your probability cloud sits over green vs red ground. See Section 8 |
| D13 | Engine approach | **Bounded combinatorial search, not rule-based template selection.** Enumerate all valid defined-risk ≤4-leg combinations over a belief-pruned strike pool; score them all; attach familiar strategy names as *labels* afterward | Robust (nothing is gated out, can't miss the optimum in the relevant region), and it *generalizes to multiple underlyings* — which rule-based if-branching fundamentally cannot. Named templates become labels + pruning priors, not gates |
| D14 | Ranking preferences | **Balanced default (PoP/ROI equal), but the user gets full control** over factor weights and a risk-appetite (conservative↔aggressive) control — **hidden behind expandable "advanced" panels** | Most users want a sensible default out of the box; power users want to tune everything. Progressive disclosure keeps full control from being intimidating |
| D15 | Trade-complexity cap | **≤ 4 legs** (condors/butterflies included); extend only if a genuine need arises | 4 legs already cover the entire directional + neutral universe; more legs add execution and comprehension burden for little gain |
| D16 | Results presentation | **One sortable, scrollable, ranked list** — not a fixed set of three. Sorter bar at the top (capital, PoP, max return/ROI, risk + edge, plus a few prunable extras); lower-ranked items rendered **faded**, sharpening toward the top | The user browses and chooses by *their own* priorities. Still a menu, never a directive (supports the not-financial-advice posture, deferred). Faded tail signals "weaker matches below" without hiding them |
| D17 | MVP feature scope (extras) | **3D terrain view, market-vs-belief (`q`) overlay, per-trade Greeks, and multi-expiration laddering are ALL in the MVP** | The user wants an ambitious, complete first version, and the abstractions (engine seam D5, density grid, smile fit) already support them |
| D18 | Real-time loop location | **Client-side hot loop.** Server builds the scoring bundle once per ticker/expiration; the browser runs the per-drag scoring | Fastest (no network in the drag loop) *and* cheapest (no per-interaction server compute, no WebSocket infra to scale). See Section 10 |
| D19 | Deployment | **Local now, hosted-ready** — runs locally, structured (env config, server-side secrets, stateless server + pluggable cache) so hosting is a small later step | Reach a working MVP fast without taking on auth/scaling now, and without painting into a corner. See Section 10 |
| D20 | Visual design language | **Dark-default (themeable), mono-accented type (Inter for prose, JetBrains Mono for all numbers/tickers), graph-as-interface, smooth "calm-superintelligence" motion, aggressive progressive disclosure.** The aesthetic is restrained and instrument-like — explicitly *not* the generic AI-SaaS look | The product must feel elegant, intuitive, and uncluttered; the interactive graph is the interface, and every dial stays hidden until summoned. The monospaced data is the distinctive signature. See Section 12 |

---

## 1. Vision & Scope

### 1.1 What this is

A tool that turns a *plain-English market opinion* into a *mathematically optimized options
trade*. The user never has to know the name of a single options strategy. They say — by drawing
— "I think this stock will probably be around here by this date, and I'm this sure," and the
engine returns a short, ranked menu of option structures that best express that exact belief,
each with its payoff chart, plain-English summary, capital tier, and key risk numbers.

The product's one-sentence wedge: **every competitor starts from a strategy and describes it;
we start from the user's belief and find the strategy.** "Idea-first," not "strategy-first."

### 1.2 The MVP, concretely

The MVP is a single end-to-end loop:

1. **Pick any ticker.** We fetch a recent quote and the live option chain.
2. **Draw a prediction.** On an interactive price-vs-time chart, the user sculpts a probability
   cloud: where the price will land at a chosen expiration, and how confident they are. They can
   drag the center, widen/narrow the uncertainty, and skew it up or down.
3. **See strategies update live.** As the cloud changes, a ranked list of option strategies
   re-scores and re-orders in real time to match the current belief.
4. **Inspect a recommendation.** Each result shows a payoff chart overlaid on the belief, a
   plain-English summary, a capital tier (Low/Medium/High), max loss, breakevens, and the
   probability of profit *under the user's own belief*.

### 1.3 Explicitly in scope for the MVP

- Any optionable US single-name equity or ETF the data provider covers.
- The skewable-bell belief model (center + uncertainty + skew).
- Directional and neutral single-asset strategies (Section 5).
- The belief-vs-market scoring engine (Section 6).
- One expiration at a time, chosen by the user.
- Live (free-tier) market data behind a swappable provider.

### 1.4 Explicitly out of scope for the MVP (deferred to v2+)

- Pairs / market-neutral two-asset trades ("AAPL outperforms MSFT").
- True path / timing beliefs and calendar/diagonal strategies (see Section 4).
- The "Pro" subscription features: brokerage connection, portfolio-aware recommendations,
  holistic risk dashboard (portfolio Greeks), margin-call simulator.
- Order placement / execution. The MVP recommends; it never trades.
- Free-form (multi-hump, fat-tailed) belief sculpting — the engine seam (D5) is built to accept
  it later, but the MVP ships the constrained skewable bell.

### 1.5 What "done" means for the MVP

A user can open the tool, type a ticker, sculpt a belief, and watch a sensible, correctly-priced,
ranked set of strategies update as they drag — with the math behind every number traceable to
this document. Polish is secondary to the core loop being correct and explainable.

---

## 2. The Core Concept: From a Drawn Belief to an Optimal Trade

This is the heart of the product. Everything else is infrastructure around the idea in this
section.

### 2.1 The user is drawing a probability distribution

The prediction UI is not a price target. The handle the user manipulates describes a full
**probability density over the terminal price `S_T`** at the expiration date `T`:

- The **center** (the circle) is their best guess.
- The **width** (the 68% / 95% bands) is their uncertainty — one and two standard deviations.
- The **skew** (dragging the upper and lower bands independently) is their directional lean.

Call this density `f(S_T)`. It answers: *"For each possible price at expiration, how likely do I
think it is?"* It is a subjective, personal distribution — the user's view of the world.

### 2.2 A strategy is a fixed payoff shape

Every option structure has a deterministic payoff at expiration as a function of the terminal
price — a piecewise-linear curve `Payoff(S_T)`:

- A **long call / put** is a hockey stick.
- A **vertical (debit) spread** is a ramp that flattens — limited cost, limited gain.
- A **long butterfly** is a tent — a sharp peak at one price.
- An **iron condor** is a plateau — profit across a *range*.
- A **long straddle / strangle** is a valley/V — profit from a *big move either way*.

By itself, this curve says nothing about likelihood. It is just a shape.

### 2.3 "Matching" = putting the payoff where the probability is

Overlay the belief `f(S_T)` on the payoff `Payoff(S_T)`. Now the payoff becomes a *random
variable*: its distribution is induced by the user's belief. The intuitive goal — "build a payout
distribution that matches my prediction" — means precisely:

> **Choose the structure whose payoff is large exactly where the user's probability mass sits,
> and whose losses sit where the user thinks the price is unlikely to go.**

This already explains the whole strategy universe from one principle:

| User's belief shape | Where their mass is | Structure whose payoff fits |
|---|---|---|
| Confident it drifts up | A bump above spot | Call **debit spread**, short strike near the center |
| Confident it pins a level | A tight spike | Long **butterfly** centered on that level |
| Thinks it stays in a range | A wide bump around spot | **Iron condor**, short strikes at the band edges |
| Thinks it barely moves | A tall narrow bump at spot | **Iron butterfly** (defined-risk premium sale) |
| Big move, unsure of direction | Mass pushed into both tails | Long **straddle / strangle** |

### 2.4 What makes it *optimal*, not just a shape match: `f` vs `q`

Shape-matching alone is incomplete, because the option prices already reflect *the market's own
belief*. The live chain encodes a **market-implied (risk-neutral) distribution `q(S_T)`** —
recoverable from prices (Section 6 / Section 9 math). If your belief `f` is identical to the
market's `q`, then there is no edge: every structure is, on average, a coin flip after costs.

**The edge — and therefore the right trade — comes from where `f` and `q` disagree.**

- Where you assign **more** probability than the market (`f > q`), you want to be **long** payoff.
- Where you assign **less** probability than the market (`f < q`), you want to be **short** payoff.

This single rule reproduces every recommendation type and, crucially, explains *why*:

- You think the stock will be **calmer** than the market is pricing (your `f` is narrower than
  `q`) → **sell** volatility → iron condor / butterfly / credit spread.
- You think it will be **wilder** (your `f` is fatter than `q`) → **buy** volatility → straddle /
  strangle / debit spread.
- You think it will **drift** a direction the market isn't pricing (your `f` is shifted vs `q`) →
  directional spread.

### 2.5 The formal statement (kept precise, kept simple)

For any candidate structure, define its profit-and-loss at expiration as a function of terminal
price:

```
PnL(S_T) = (intrinsic value of the structure at expiration) − (net cost paid today)
```

The **expected profit under the user's belief** is the average of that curve weighted by the
belief:

```
E_f[PnL] = ∫ PnL(S_T) · f(S_T) dS_T            (a sum over a price grid in practice)
```

Because the *market price* of the structure equals its average payoff under the market's
distribution `q` (that is what "fairly priced" means), the expected profit under your belief is
*exactly* the edge between `f` and `q`:

```
E_f[PnL]  =  ∫ Payoff(S_T) · f(S_T) dS_T  −  price
          =  ∫ Payoff(S_T) · [ f(S_T) − q(S_T) ] dS_T      (≈, ignoring carry/discounting)
```

That second line is the whole thesis in one equation: **your expected profit is the payoff,
integrated against the difference between your belief and the market's.** Where your belief
exceeds the market's, payoff helps you; where it falls short, payoff hurts you. The engine's job
is to find the structures that maximize this — traded off against risk, probability of profit,
and real-world costs (Section 6).

### 2.6 Two probabilities of profit — keep them distinct

There are two different "probability of profit," and we must never conflate them:

- **PoP under the user's belief** (`P_f`): how likely the user thinks the trade wins. This is the
  motivating, user-facing number — "given what *you* believe, this wins ~62% of the time."
- **PoP under the market** (`P_q`): how likely the *market* thinks the trade wins. Useful as a
  reality check and to show the user where they disagree with consensus.

The MVP surfaces `P_f` as the headline and may show `P_q` as a "the market thinks…" comparison.
This is also an important honesty feature (part of the not-financial-advice posture, to be
formalized separately): we are optimizing *for the user's prediction*, and we say so.

---

## 3. The Belief Model

This section pins down the exact mathematical object the UI produces and the engine consumes, and
how each on-screen handle maps to it.

### 3.1 Requirements

The belief model must:

1. Be a **valid probability density** (non-negative, integrates to 1) at all times.
2. Be **single-peaked** (D2 — no multi-hump beliefs in the MVP).
3. Express **center, uncertainty, and skew** with handles that map cleanly to dragging.
4. Be **lognormal-based** (D3) so prices stay positive and the comparison to the market's `q` is
   like-for-like.
5. Produce a clean **terminal density `f(S_T)` on a price grid** (D5) — the only thing the engine
   needs.

### 3.2 The model: a two-piece (split) lognormal

A plain lognormal has a single width parameter and a fixed, mild right-skew — it cannot express
"I lean bullish" vs "I lean bearish." We need adjustable skew while staying single-peaked and
valid. The clean, well-established way to do this is a **two-piece (split) lognormal**: a
lognormal whose width *below* the center differs from its width *above* it. (This is the same
family central banks use for their inflation "fan charts," chosen for exactly this reason —
intuitive, single-peaked, adjustable skew.)

Concretely, work in log-price `x = ln(S_T)`. Let:

- `μ = ln(m)` where **`m` is the center** the user places (the median price — 50% of belief mass
  on each side).
- `σ_down` = the **downside** log-width (controls the lower band).
- `σ_up` = the **upside** log-width (controls the upper band).

The density is a normal in `x` that uses `σ_down` for `x < μ` and `σ_up` for `x > μ`, scaled so
the two halves join continuously at the peak and the whole thing integrates to 1:

```
              ⎧  A · exp( −(x−μ)² / (2 σ_down²) )      for x ≤ μ
g(x)  =       ⎨
              ⎩  A · exp( −(x−μ)² / (2 σ_up²)   )      for x >  μ

with   A = sqrt(2/π) / (σ_down + σ_up)          (normalization)
```

and the terminal price density follows by the change of variables `x = ln S`:

```
f(S_T) = g(ln S_T) / S_T
```

When `σ_down = σ_up` this is exactly an ordinary lognormal. Pull the upper band wider than the
lower and the cloud skews bullish; pull the lower band wider and it skews bearish. It is always a
single peak, always valid.

### 3.3 Mapping UI handles → parameters

Three drag interactions, three parameters — a clean one-to-one mapping:

| Handle | Gesture | Sets |
|---|---|---|
| **Center circle** | Drag up/down (price) and left/right (date) | `m` (median price) and the expiration `T` |
| **Upper band (68% / 95% above)** | Drag the top of the bar | `σ_up` |
| **Lower band (68% / 95% below)** | Drag the bottom of the bar | `σ_down` |

The 68% / 95% labels are the user's anchor for *what the bands mean*: the 68% mark is one log-σ
from the center, the 95% mark is two. So if the user puts the upper 68% mark at price `P_up`:

```
σ_up = ln(P_up / m)          (and the 95% mark sits at  m · exp(2 σ_up))
```

and symmetrically for `σ_down` with the lower mark. Dragging a band *is* setting a standard
deviation; the engine never sees pixels, only `(m, σ_down, σ_up, T)`.

### 3.4 A sensible default cloud

When the user first lands on a ticker, we seed the belief so the screen is never blank and the
default is "I have no edge — I agree with the market." The natural default is the **market's own
implied distribution at the chosen expiration**: center `m` at the forward price, and `σ_up =
σ_down = IV · √τ` (τ = time to expiration in years, Section 9.1) from at-the-money implied volatility. The user then *deforms away from the
market* — which is visually and conceptually perfect, because the engine measures exactly that
deformation (`f` vs `q`). Starting at "no edge" means the recommendations only get interesting as
the user expresses a real opinion.

### 3.5 From parameters to the engine's input

The engine contract (D5) is a normalized density on a price grid. The UI (or a thin server
endpoint) evaluates:

```
grid:   S_1 … S_N   (e.g. a few hundred points spanning ~ ±4σ around m, clipped at 0)
f_i  =  f(S_i)      using the two-piece lognormal above
normalize so that  Σ f_i · ΔS = 1
```

That vector `{(S_i, f_i)}` is the entire interface between "what the user drew" and "what the
engine optimizes." Anything we let the user draw in the future — more skew, fat tails, multiple
humps — just changes how this vector is produced, not how it is consumed.

### 3.6 Edge cases in the belief model

- **Degenerate width (`σ → 0`):** clamp to a small floor so the density stays finite and the grid
  stays meaningful. A near-spike belief should resolve to a butterfly, not a divide-by-zero.
- **Center dragged to/below 0:** impossible by construction (lognormal support is `S > 0`); the
  UI clamps the center to a positive minimum.
- **Extreme skew:** clamp the ratio `σ_up / σ_down` (and its inverse) to a sane maximum so the
  cloud can't become a pathological sliver.
- **Center far from any tradable strike:** allowed — the engine simply finds the best available
  structure near that region and the recommendation quality (liquidity/score) reflects the gap.

---

## 4. The Time Dimension

The user can sculpt the cloud in *time* as well as price ("I think it moves early," "the run-up is
in August, not September"). This section lays out what that can and cannot mean for the MVP, and the
path we chose. **This is decision D7, resolved in 4.4.**

### 4.1 Why time is fundamentally harder than price

An option held to expiration only cares about **one number: the terminal price `S_T` at
expiration.** The *route* the price takes to get there — fast then flat, flat then fast, up-then-
back — does not change the payoff at expiration at all. So a belief about *when* the move happens
has **no effect on a held-to-expiration payoff.** Time-skew only becomes financially meaningful if
we model one of:

1. **Early exit** — the user closes the position before expiration, so the price *path* and the
   option's *value over time* (not just terminal intrinsic value) matter.
2. **Path-dependent / multi-expiration structures** — calendar and diagonal spreads, which
   deliberately trade one expiration against another and live or die on the *timing* of the move.
3. **"Touch" beliefs** — "it'll hit \$400 by mid-August then settle back." Held-to-expiration
   options capture this poorly; it needs path simulation and an exit rule.

Each of these is a real escalation: it pulls in time-value modeling (theta), the full Black-
Scholes surface over time, American early-exercise considerations, and Monte-Carlo path
simulation. That is a different and much larger engine than "integrate a payoff against a terminal
density."

### 4.2 Option A — Terminal-only (recommended for MVP)

The user shapes the cloud in both dimensions for an intuitive, expressive feel, but the time
dimension is used for exactly two concrete jobs:

- **Selecting the expiration `T`.** The horizontal position of the center (and which expiration
  it snaps to among those the chain actually offers) sets the `T` the engine uses.
- **Visual richness.** The cloud rendered across time is a smooth interpolation for feel; only the
  slice *at expiration* feeds the engine.

The engine consumes only `f(S_T)` at the chosen expiration (D5). Time-skew within a single
expiration is acknowledged in the UI but does not change recommendations. This keeps the MVP
honest and tractable, and it is *correct* for the dominant use case (hold to expiration).

**Pros:** Tractable, mathematically clean, matches how the recommended structures are actually
held, no Monte-Carlo. **Cons:** A user who sculpts a strong timing view won't see it reflected;
we must communicate that gracefully (e.g., snap the cloud to the expiration slice so the UI never
implies more than the engine uses).

### 4.3 Option B — Model the path

Treat the time-skew as a genuine belief about the price path. Simulate paths consistent with the
sculpted space-time cloud, apply an exit rule (e.g., hold to expiration, or exit at a target),
value positions through time on the Black-Scholes surface, and let calendar/diagonal structures
into the universe so timing beliefs have something to express themselves through.

**Pros:** Far more powerful and differentiated; unlocks "when" as a real axis and a whole class of
strategies. **Cons:** Substantially more complex — path simulation, time-value modeling, an
explicit exit-behavior assumption, American-exercise care, and a heavier real-time compute budget.
High risk of the MVP bogging down here.

### 4.4 Decision (D7): terminal-only, with center-of-mass expiration selection and laddering

We ship terminal-only, with the seam for path modeling (Option B) preserved. The time dimension
drives expiration selection by these concrete rules:

**Single-expiration case (default).** Compute the **time center-of-mass** of the belief cloud —
the probability-weighted average date `T*`. Snap to the listed expiration nearest `T*`. The engine
then uses the terminal density `f(S_T)` at that expiration.

**Laddered case (belief is wide in time).** If the belief's spread *in time* exceeds a threshold
(the cloud meaningfully overlaps more than one listed expiration), select the nearest **2–3
expirations** and split the position across them, weighting each expiration by the fraction of the
belief's time-mass nearest to it. Each leg is still a held-to-expiration structure; we are simply
laddering entries to cover "I'm not sure exactly *when*."

```
time-mass weight for expiration  T_k :   w_k ∝ (belief time-mass in the window around T_k)
                                          Σ w_k = 1
position sizing across the ladder:        allocate capital ∝ w_k
```

**Important honesty note.** Laddering across expirations is a sound way to express *temporal
uncertainty about entry/holding*, but it is **not** a true bet on *when* the move happens — that
requires calendar/diagonal structures and path modeling, which remain v2 (D7). The UI should frame
a wide-in-time cloud as "spread your timing," not "profit from the timing." To keep the UI honest,
the rendered cloud snaps/aligns to the expiration slice(s) the engine actually uses, so it never
implies timing precision the engine doesn't act on.

---

## 5. The Strategy Universe

This section defines every structure the MVP engine can recommend, with exact payoffs and
parameterization. Two hard rules govern the whole universe:

- **Defined risk only.** No naked short options. Every structure has a known, finite maximum loss.
  Premium-selling (neutral) views are always expressed through *spreads* (iron condor, iron
  butterfly), never bare short calls/puts. This is both a risk-management choice and central to the
  not-financial-advice / safety posture, and it directly implements the spec's
  "safety net" idea as a built-in property rather than an afterthought.
- **Small leg count.** Each structure has 1–4 legs. We are recommending recognizable, executable
  trades — not an arbitrary replicating portfolio.

### 5.1 Notation

A structure is a set of **legs**. Each leg is `(type, K, expiration, side, qty)` where `type ∈
{call, put}`, `side ∈ {long (+1), short (−1)}`. Per-leg intrinsic value at expiration:

```
call intrinsic:  max(S_T − K, 0)
put  intrinsic:  max(K − S_T, 0)
```

For a structure with legs `ℓ`:

```
ValueAtExpiry(S_T) = Σ_ℓ  side_ℓ · qty_ℓ · intrinsic_ℓ(S_T)
NetCost (debit>0)  = Σ_ℓ  side_ℓ · qty_ℓ · premium_ℓ        (longs cost, shorts credit)
PnL(S_T)           = ValueAtExpiry(S_T) − NetCost
```

`PnL` is piecewise-linear with kinks at the strikes; breakevens are its zero-crossings; max
gain/loss are at the kinks or the `±∞` asymptotes (always finite here by the defined-risk rule).

### 5.2 The catalog

**Directional — bullish**

| Structure | Legs | Cost | Max loss | Max gain | Best when |
|---|---|---|---|---|---|
| Long call | +1 call `K` | debit | debit | unlimited | Strong up view, want convexity / fat upside |
| Bull call (debit) spread | +call `K₁`, −call `K₂` (`K₂>K₁`) | debit | debit | `(K₂−K₁)−debit` | Up view to a target near `K₂`; cheaper, defined |
| Bull put (credit) spread | −put `K₂`, +put `K₁` (`K₁<K₂`) | credit | `(K₂−K₁)−credit` | credit | Up/sideways view; collect premium with a floor |

**Directional — bearish** (mirror images)

| Structure | Legs | Cost | Max loss | Max gain | Best when |
|---|---|---|---|---|---|
| Long put | +1 put `K` | debit | debit | `K−debit` | Strong down view, want convexity |
| Bear put (debit) spread | +put `K₂`, −put `K₁` (`K₁<K₂`) | debit | debit | `(K₂−K₁)−debit` | Down view to a target near `K₁` |
| Bear call (credit) spread | −call `K₁`, +call `K₂` (`K₂>K₁`) | credit | `(K₂−K₁)−credit` | credit | Down/sideways view; collect premium with a cap |

**Neutral — expects a range or a pin (sell premium, defined risk)**

| Structure | Legs | Cost | Max loss | Max gain | Best when |
|---|---|---|---|---|---|
| Iron condor | −put `K₂`,+put `K₁`,−call `K₃`,+call `K₄` (`K₁<K₂<K₃<K₄`) | credit | `max(K₂−K₁, K₄−K₃)−credit` | credit | Stays in a **range**; belief narrower than market |
| Iron butterfly | −put `K₀`,−call `K₀`,+put `K₁`,+call `K₄` | credit | `max(K₀−K₁,K₄−K₀)−credit` | credit | **Pins** near `K₀`; belief tight at a level |
| Long call/put butterfly | +`K₁`, −2·`K₂`, +`K₃` (equal spacing) | debit | debit | `(K₂−K₁)−debit` | Pins near `K₂`; cheap, defined pin bet |

**Volatility — expects a big move, direction unsure (buy premium)**

| Structure | Legs | Cost | Max loss | Max gain | Best when |
|---|---|---|---|---|---|
| Long straddle | +call `K₀`, +put `K₀` (ATM) | debit | debit | unlimited | **Big move either way**; belief wider than market |
| Long strangle | +call `K_h`, +put `K_l` (`K_l<K_h`) | debit | debit | unlimited | Big move either way, cheaper than straddle |

### 5.3 The underlying itself: long stock as the benchmark (and stock-option hybrids)

Options earn their place only by doing something stock cannot — leverage, *defined* risk, premium
income, or a precise range bet. So the honest question behind every recommendation is **"is an
option actually better than just buying the shares?"** The underlying must therefore be a
first-class member of the universe: both a candidate that can win on its own merits, and a
**benchmark that is always displayed**, even when it doesn't win, so the user can see exactly what
the leverage or the defined-risk is buying them.

Stock fits the terminal-price engine with no special-casing — a share is just a linear, option-free
leg with payoff slope 1:

| Structure | Position | Cost / capital | Max loss | Max gain | Best when |
|---|---|---|---|---|---|
| **Long stock** | +`N` shares | `S₀·N` | `S₀·N` (to zero) | unlimited | Confident directional **up** view, no special volatility edge, capital available. The baseline |
| Short stock | −`N` shares | margin | **unlimited** (flagged) | `S₀·N` | Bearish baseline only; shown with a risk warning. Defined-risk puts/spreads are the preferred bearish expression |
| Covered call | +stock, −call | `S₀·N − credit` | `S₀·N − credit` | capped at strike + credit | Mildly bullish/neutral, want yield and a small cushion |
| Protective put | +stock, +put | `S₀·N + debit` | defined floor | unlimited | Bullish but want a hard safety net under the position |
| Collar | +stock, +put, −call | `S₀·N + put − call` | defined floor | capped at call | Bullish-but-cautious; protection financed by selling upside |

Payoff (per share) for long stock: `PnL(S_T) = (S_T − S₀)`. The hybrids combine this linear leg
with option legs using the same formulas as 5.1.

**The benchmark rule.** Long stock is always rendered alongside the option recommendations as a
reference — its `PoP_f`, capital, and ROI sit next to the options' so the trade-off is explicit.
It lands in the **High** capital tier, and ROI normalization (Section 6.4) will usually rank
leveraged options above it; that gap *is* the capital-efficiency story, and we surface it rather
than hide it. When the belief is a confident moderate drift with no volatility edge, plain stock
may genuinely score best — and the engine is allowed to say so. That honesty strengthens the
not-financial-advice posture (to be formalized separately).

**Interaction with the filtering grid.** Long stock occupies the "bullish, no volatility edge"
region of the 5.4 grid; covered calls and collars sit in the "bullish but calmer than market"
cells; protective puts in "bullish but want defined downside." They are scored against the option
structures in those same cells.

### 5.4 The belief-shape → structure correspondence

The engine does not pick a structure by rule — combinatorial search and scoring do that (Section 6,
D13). This grid is a **pruning prior and an explanation aid**, not a gate: it tells the search which
regions of the strike pool to favor (so Stage-A pruning keeps the right legs) and gives the UI a
plain-English reason for *why* a winning structure fits the belief. Structures outside the
"expected" cell are never forbidden — if their legs survive on edge and liquidity, they compete. The
two diagnostic quantities:

- **Drift:** belief center `m` vs the forward price `F`. `m > F` → bullish region; `m < F` →
  bearish; `m ≈ F` → neutral.
- **Relative width:** belief width `σ_belief` vs the market's implied width `σ_mkt = IV·√τ`.
  `σ_belief < σ_mkt` → you expect *calmer* than the market → **sell** premium. `σ_belief >
  σ_mkt` → *wilder* → **buy** premium.

```
                         σ_belief  <  σ_mkt        σ_belief  >  σ_mkt
                       (calmer than market)       (wilder than market)
  m > F  (bullish)     bull put credit spread      long call, bull call debit spread
  m ≈ F  (neutral)     iron condor / butterfly     long straddle / strangle
  m < F  (bearish)     bear call credit spread      long put, bear put debit spread
```

This 3×2 grid is the filtering map. Strike selection within each surviving template is anchored to
the belief: short strikes near the band edges (≈ ±1σ), long protective strikes just beyond, debit-
spread short strikes near the center `m`, butterfly peaks at `m`. Scoring then ranks the concrete
instances.

---

## 6. The Recommendation Engine — How the Belief Becomes Recommendations

This is the full transition pipeline: belief in, ranked menu out. Five steps.

### 6.0 The one idea that makes it simple: the market price *is* the comparison to `q`

Section 2 framed the edge as `∫ Payoff·(f − q)`. In practice **we never reconstruct `q` to score a
trade**, because a structure's *real market cost already equals its average payoff under `q`*.
So the expected profit under the user's belief,

```
E_f[PnL]  =  E_f[Payoff]  −  NetCost(market)
          =  ( Σ_i Payoff(S_i) · f_i · ΔS )  −  NetCost
```

is *already* the edge between belief and market — `q` is encoded in `NetCost` and cancels out.
This means the engine's hot path is just **payoff curves (fixed) integrated against the belief
density (changing)** — fast, and the reason live updates are cheap. We reconstruct `q` explicitly
only for the "what the market thinks" overlay — an MVP feature (D17), but still *decoupled from
scoring* (Section 6.8 / Section 9).

### 6.1 Step 1 — Select expiration(s)

Per D7 / Section 4.4: compute the belief's time center-of-mass `T*`, snap to the nearest listed
expiration; if the belief is wide in time, select the nearest 2–3 expirations and ladder, weighting
by time-mass. All subsequent steps run **per selected expiration**; laddered results are combined at
the end with capital allocated by the time-mass weights `w_k`.

### 6.2 Step 2 — Generate candidate structures (bounded combinatorial search)

This is decision **D13**, and it deserves a precise statement because it is the heart of "how the
belief becomes a strategy."

**We do not use a decision tree of if-statements that fills in pre-chosen named strategies.** That
approach gates out anything we didn't hand-code, is brittle, and — decisively — does not generalize
to multiple underlyings (there is no clean rule tree for "AAPL call + MSFT put"). Instead we
**search the space of combinations** and let the good structures *emerge*, then attach familiar
names to them afterward.

**Why this isn't an explosion.** Every option structure is built from a tiny primitive set: long or
short a call or put at some listed strike, plus long or short stock. Once we impose two constraints
— **defined risk only** (D6/5.1) and a **maximum leg count** (≤4 for the MVP) — the set of *valid*
combinations is exactly the familiar library (verticals, condors, butterflies, straddles, …). The
named strategies are not human conventions we choose between; they are the **equivalence classes of
the bounded combination space.** So "enumerate every combination" and "enumerate every template ×
strikes" land on nearly the same set — the difference is that here templates are **labels and
pruning priors, never gates.**

**The two-stage trick that keeps it real-time.** Expected value under the belief is **linear in the
legs**: each leg `ℓ` has a precomputable *belief-edge*

```
e_ℓ  =  E_f[ intrinsic_ℓ(S_T) ]  −  premium_ℓ      (computed once per leg)
```

and any combination's expected value is just `Σ side·qty·e_ℓ`. We exploit this:

- **Stage A — prune the leg pool (cheap, linear).** Compute every primitive leg's edge `e_ℓ` and
  its liquidity/spread quality. Keep only the ~15–25 legs that actually matter for *this* belief:
  strikes within the belief's relevant region (≈ ±3σ), on the side(s) the belief favors, with
  acceptable liquidity. The 5.4 grid acts here as a **pruning prior** — a hint about which regions
  to favor — *not* a hard filter; structures outside the "expected" cell are still allowed through
  if their legs survive on edge and liquidity.
- **Stage B — exhaustive search within the pruned pool.** Enumerate **all** valid defined-risk
  ≤4-leg combinations from those ~15–25 legs. That is now only a few thousand candidates — small
  enough to score *completely* on the nonlinear metrics (PoP, max loss, ROI, breakevens) that do
  *not* decompose linearly. Exhaustive search within a belief-relevant pool gives the robustness we
  want ("we did not miss the optimum where it matters") at millisecond, vectorized-NumPy cost.

Each surviving candidate carries its legs, and we precompute its **payoff curve on the shared price
grid** once (it does not depend on the belief, so it is cached for the live-update loop of 6.6).

**De-duplication.** Many enumerated combinations are economically equivalent (same shape, trivially
different construction) or near-identical (adjacent strikes, near-identical curves). We collapse
these to one representative so the final menu shows genuinely distinct trades, not disguised copies.

**Robustness has a cost — noise-fitting.** The wider we search, the more likely the top raw score is
an *artifact*: an illiquid leg with a stale or crossed quote that looks like free money. This is
precisely why the execution-quality and Black-Scholes fair-value gates (6.3) are load-bearing, not
cosmetic — they must run on every candidate before scoring is trusted. The honest rule: search
broadly, but never trust a score whose legs can't actually be traded at something near the price we
assumed.

**Forward compatibility (multi-asset).** Because candidates are assembled from primitive legs and
scored by integrating payoff against the belief, the framework extends directly to legs drawn from
*several* underlyings over a *joint* belief — the v2 pairs/market-neutral case. Nothing about the
search structure changes; only the belief object (a joint distribution) and the leg pool (multiple
chains) grow. The rule-based alternative would have to be discarded to get there. This is the
decisive reason to build search now.

### 6.3 Step 3 — Price & validate

For each candidate, from the live chain:

- **Net cost** from real quotes. MVP uses leg mid-prices for the headline, and also computes a
  *conservative fill* (pay the ask, sell the bid) to show a realistic worst-case entry. The gap
  between them is the **spread cost**, surfaced as a quality signal.
- **Liquidity gate.** Drop or penalize candidates whose legs have no or thin quotes, zero or tiny
  volume + open interest, or absurd bid-ask widths. A structure is only as liquid as its *worst*
  leg, so we take the min across legs.
- **Price-validation gate (Phase 2 of the original spec), done surface-relative.** Flag legs whose
  raw quote sits far from the price implied by the *fitted vol smile* (its neighboring strikes —
  Layer 3 of 6.7), catching stale quotes and data glitches. **Note — this must be surface-relative,
  not self-relative:** computing a leg's Black-Scholes value from its *own* implied vol returns the
  market price by definition (that is what implied vol means), so it can flag nothing. The reference
  vol must come from the fitted surface, not the leg itself. This is a sanity filter, *not* the edge
  calculation.

> **Why scoring uses the market price, not a modeled "fair value."** The edge is `E_f[payoff] −
> executable price`, measured against the *real* price on purpose — that price already encodes the
> market's distribution `q`, so the comparison to the user's belief is exactly what we want. A
> Black-Scholes fair value adds nothing here and can mislead: from a leg's own IV it is circular
> (it equals the market price), and from a single flat vol it imposes an assumption the market
> rejects (the smile). The spec's real concern — protecting the user from overpaying for expensive
> premium — is handled *automatically*: high IV → high price → smaller/negative edge, so pricey
> premium self-penalizes and the engine steers toward selling it instead. Black-Scholes remains
> essential as *machinery* (price↔IV conversion, smile fitting, `q` extraction in 6.8, Greeks,
> value-through-time for the 3D terrain), never as the arbiter of whether a trade is good.

Survivors carry: payoff curve, net cost (mid + conservative), capital required, max loss, max
gain, breakevens, and an **ExecutionQuality ∈ [0,1]** built from the liquidity and spread signals.

Capital required by structure type:
```
debit structures:   capital = net debit            (= max loss)
credit spreads:     capital = spread width − credit (= max loss; the broker's margin)
```
Capital tier (Low / Medium / High) is bucketed from `capital` (thresholds configurable, e.g.
< $250 / $250–$1000 / > $1000, or scaled to the underlying).

### 6.4 Step 4 — Score each candidate under the belief

This is where the belief enters. With the belief density `{f_i}` on the price grid `{S_i}`:

```
Expected profit:   EV   = Σ_i  PnL(S_i) · f_i · ΔS
Prob. of profit:   PoP_f = Σ_{i : PnL(S_i) > 0}  f_i · ΔS
Return on risk:    ROI  = EV / capital
Downside (belief): the belief-weighted loss, e.g. CVaR_f or simply max loss for defined-risk
```

`PoP_f` and `ROI` are the spec's two headline priorities. We combine them into a **merit score**,
then multiply by **execution quality** so that an illiquid or mispriced "great" trade can never
rank highly:

```
MeritScore   = w_PoP · PoP_f  +  w_ROI · norm(ROI)  +  w_EV · norm(EV)
               with  w_PoP + w_ROI + w_EV = 1     (defaults: 0.40 / 0.40 / 0.20)

Score        = MeritScore · ExecutionQuality
ExecutionQuality = LiquidityFactor · SpreadFactor · ValidityFactor   (each ∈ [0,1])
```

`norm(·)` rescales a metric across the surviving candidates to `[0,1]` (min–max or rank-based) so
the weighted sum mixes comparable quantities. **The weights are user-facing (D14), not just config.**
The default is balanced (0.40 / 0.40 / 0.20); a **risk-appetite control** shifts the mix toward
`PoP` (conservative) or toward `EV`/convexity (aggressive); and an **advanced panel** — hidden
behind an expandable window so it never intimidates the default user — exposes every weight directly
for full control. Re-ranking on a preference change is as cheap as a belief change (6.6): the
per-candidate metrics are unchanged, only their weighted combination is recomputed.

**Why this avoids the "always max leverage" trap.** Maximizing raw expected value alone would
always pick the most convex, highest-leverage bet. Including `PoP_f` (which rewards actually being
right under the user's own belief) and scoring `ROI` on *capital at risk* balances payoff against
the probability and the downside, producing trades a human would recognize as sensible for the
stated view. (A more principled alternative — maximizing expected *utility* under `f` with an
explicit risk-aversion parameter — is noted as a v2 refinement; the weighted score is the MVP.)

### 6.5 Step 5 — Curate & present

Rather than a fixed handful, the result is **one sortable, scrollable, ranked list** the user
browses by their own priorities (D16). We still clean it up first:

- **De-duplicate** economically-equivalent and near-identical candidates (same shape, adjacent
  strikes, near-identical curve) — keep the best representative so the list is genuinely distinct
  trades, not disguised copies.
- **Sort bar at the top.** The user re-orders the whole list by any of several keys. Core sorters:
  **Capital required**, **Probability of profit** (`PoP_f`), **Max return / ROI**, and **Risk +
  edge** (max loss, reward-to-risk, and edge-vs-market). A few more prunable extras we can trial and
  cut later: **breakeven margin of safety** (how far price can move before a loss), **liquidity**,
  **time to expiration**, **net debit vs credit**. Capital can also act as a *bucketing* view
  (Low / Med / High) to serve the spec's "fits your financial situation" framing.
- **Faded tail (D16).** The list is ranked by the current score (under the user's weights, D14);
  lower-ranked rows render progressively **faded**, sharpening toward the top. Nothing is hidden —
  the fade simply signals "weaker matches the further you scroll," and the user can keep scrolling
  as far as they like. This preserves the not-financial-advice posture (to be formalized separately):
  it is a browsable menu ordered by the user's own criteria, never a single directive.

Each row ships with: the **payoff curve overlaid on the belief cloud**, a **plain-English summary**
("You profit if NVDA is between \$X and \$Y on Aug 21; you risk \$Z to make up to \$W"), `PoP_f`, max
loss, max gain, breakevens, capital, **per-trade Greeks** (D17), and the structure's name with a "?"
explainer. **Long stock is pinned as a benchmark** regardless of sort (D11).

### 6.6 Real-time behavior — what recomputes as the user drags

The decomposition makes live updates cheap. While the user sculpts within one expiration, the chain
is fixed, so **Steps 1–3 are cached**: the candidate set, their payoff curves, costs, and execution
quality don't change. Only Step 4's integrals depend on the belief. So each drag triggers:

```
on belief change (same expiration):
    recompute  {f_i}                         (cheap: evaluate the two-piece lognormal on the grid)
    for each candidate:  EV, PoP_f, ROI      (cheap: dot products of fixed curves with {f_i})
    re-score, re-curate, re-render
```

These are vectorized operations over a fixed matrix of payoff curves — milliseconds for thousands
of candidates. A full rebuild (Steps 1–3) happens only on **ticker change** or **expiration
change**, which are rarer and can show a brief loading state. This is the architectural reason the
"strategies update in real time as you drag" requirement is achievable.

### 6.7 Defending against noise artifacts (load-bearing)

The wider the search (D13), the more aggressively it hunts for the highest score — and the more it
is drawn to *errors that look like edge*. This subsection is the explicit defense. It is not
optional polish; without it a combinatorial engine reliably recommends garbage.

**Two distinct failure modes.**

1. **Bad data (per-leg).** Stale quotes (no recent trade), crossed/locked/one-sided quotes, deep-
   OTM legs where a 1-cent tick is a huge percentage move, and fictitious "mid" prices in options
   with very wide bid/ask. These create individual legs that *appear* mispriced.
2. **The optimizer's curse (selection bias).** Ranking thousands of candidates by an *estimate* of
   edge that carries *any* error surfaces disproportionately the candidates whose error was
   favorable: the maximum of many noisy estimates is biased upward, so the search winner is, on
   average, worse than its score claims. The bias scales with however much estimation error remains
   — so it shrinks as we clean data, but it does **not** reach zero, because one source of error is
   always present: **the bid-ask spread.** Even a perfectly current, non-stale quote is not a single
   price — the price we will actually transact at lies somewhere within the bid/ask — so the `price`
   term in every leg's edge is uncertain by up to the spread *no matter how clean the feed is*.
   (Smaller residual sources: the fitted-surface and grid-discretization approximations.) This is
   why data hygiene alone is insufficient and the defense must be layered: hygiene removes
   stale/garbage error, conservative round-trip pricing (Layer 1) attacks the *spread* error head-on
   by refusing to assume a price we don't know, and shrinkage/perturbation (Layer 4) absorb the rest.
   If estimation error were ever exactly zero, picking the maximum would be correct and no defense
   would be needed — but the spread guarantees it never is.

**The governing principle.** *Rank by a conservative, uncertainty-adjusted edge priced at
executable fills — never by the optimistic mid-price point estimate.* The layers below implement it.

**Layer 1 — Executable pricing (the highest-leverage lever).** Score every candidate at realistic
round-trip fills: pay the **ask** on long legs, receive the **bid** on short legs, on both entry and
assumed exit. Mid-pricing is the single largest source of phantom edge; charging the real spread
makes illiquid wide-quote legs self-eliminate, because the "free money" is exactly the spread we
were ignoring. We surface both the optimistic mid estimate and the realistic-fill estimate, and we
**rank on the realistic one.**

**Layer 2 — Data-hygiene gates (per leg, before any score is trusted).**
- Require two-sided, non-zero quotes; reject crossed or locked (`bid ≥ ask`) and one-sided quotes.
- Minimum **open interest** and recent **volume** floors.
- Cap the **relative spread** `(ask − bid)/mid`.
- **Price floor:** drop or special-case legs priced below ~\$0.10, where penny ticks dominate.
- **Worst-leg rule:** a structure's liquidity is the *minimum* across its legs, never the average.
- **Freshness:** where the provider exposes quote timestamps, reject stale legs.

**Layer 3 — Surface denoising.** Fit a smooth implied-vol smile across strikes (spline / SVI). Price
suspect legs off the *fitted* IV rather than their raw quote, so a single stale strike is corrected
by its neighbors; flag any leg whose raw price deviates from the fitted surface beyond a threshold.
(The same fitted surface yields a clean market-`q` for 6.8.)

**Layer 4 — Statistical robustness on the shortlist (the cure for the curse).** Applied only to the
top-K survivors, so it is cheap:
- **Uncertainty-adjusted ranking (shrinkage).** Rank by a *lower confidence bound* on edge, `EV −
  λ·u`, where `u` is the estimate's uncertainty, driven by each leg's spread/illiquidity. This is
  Bayesian shrinkage in practice: noisy (illiquid) estimates are pulled toward zero harder, so they
  stop dominating the ranking — directly counteracting the upward selection bias.
- **Perturbation test.** Monte-Carlo jitter each leg's price within its bid/ask (a few hundred
  draws) and re-score; keep only candidates whose edge *survives the jitter* with high probability.
  Robust trades are stable; artifacts collapse.
- **Edge-concentration cap.** Reject any structure where a single leg contributes more than ~60% of
  the total edge. Real edge is a property of the *structure*, not a bet on one stale quote.

**Layer 5 — Presentation honesty.** Every recommendation carries a liquidity/confidence badge and
shows its realistic-fill range and explicit spread cost. Any candidate whose edge evaporates under
the round-trip haircut is **never shown**. (This ties into the not-financial-advice posture, to be
formalized separately.)

**Where each layer runs in the pipeline.** Layers 1–3 are part of Step 3 (6.3) and Stage-A leg
pruning (6.2) — they shape the leg pool and the prices everything is scored against. Layer 4 runs
between scoring (6.4) and curation (6.5), on the shortlist. Layer 5 is part of presentation (6.5 /
Section 8).

### 6.8 Reconstructing `q` for the market-vs-belief overlay (MVP feature, D17)

An MVP feature, but still *decoupled from scoring* — not needed to rank trades, only to *explain*
them (Section 2.6). From the chain we
can recover the market-implied density via **Breeden–Litzenberger**: fit a smooth implied-vol curve
across strikes, convert to call prices `C(K)`, and take `q(K) = e^{rT} · ∂²C/∂K²` (finite
differences on the strike grid), then normalize. Overlaying `q` against the user's `f` shows them
*exactly where they disagree with the market* — which is the visual story of where their edge comes
from. Full formulas in Section 9. This is a presentation feature, explicitly decoupled from the
scoring path.

---

## 7. Data Layer

Everything upstream of the engine. The guiding decision is D8: a **provider abstraction** so the
MVP runs on free data and a production-grade paid feed drops in later without touching engine or UI
code.

### 7.1 Principle — one interface, swappable providers

The engine and UI never call a vendor API directly. They depend only on an internal
`MarketDataProvider` interface that returns a **canonical data model** (7.2). Each vendor gets a
thin adapter that maps its quirks onto that canonical shape. Swapping yfinance → Tradier → Polygon
is a config change and a new adapter, nothing more. This also lets us **mix** providers (e.g. a
cheap source for historical prices, a better one for the live chain) and **cache** uniformly.

### 7.2 The canonical data model (what the engine consumes)

The complete set of fields the engine and visualization actually need:

```
Underlying:
  symbol, spot price, (bid/ask if available), quote timestamp
Expirations:
  list of available expiration dates for the symbol
OptionChain (per expiration):
  for each contract:
    type (call/put), strike, expiration,
    bid, ask, last, mid,
    volume, open interest,
    implied volatility,            # provider-supplied OR computed by us (7.5)
    quote timestamp,               # for freshness checks (6.7 Layer 2) — may be absent on free feeds
    (greeks: delta/gamma/theta/vega — optional; we can compute)
Rates & carry:
  risk-free rate r (by tenor), dividend yield q_div (or discrete dividend schedule)
History:
  daily (or finer) historical underlying prices — for the chart's historical line (8.1)
```

These map straight onto what each part of the system needs: **bid/ask** for executable pricing
(6.7 Layer 1), **volume/OI** for the liquidity gates, **IV across strikes** for smile fitting and
`q` extraction (6.8), **timestamps** for freshness, **r and q_div** for Black-Scholes, **history**
for the prediction builder's past-price line and the default-cloud seeding (3.4).

### 7.3 The provider interface

```
interface MarketDataProvider:
    get_quote(symbol)                  -> Underlying
    get_expirations(symbol)            -> [date]
    get_option_chain(symbol, expiry)   -> OptionChain
    get_history(symbol, lookback)      -> [ (date, ohlc) ]
    # rates/dividends may come from the same provider or a separate small adapter
```

Adapters normalize units, field names, and missing-data conventions; the rest of the system sees
only the canonical model.

### 7.4 MVP data source — the honest picture

"Free **and** real-time **and** options chains" is the hard corner of the market — the three rarely
coexist. The realistic options:

| Source | Cost | Latency | IV / Greeks | Notes |
|---|---|---|---|---|
| **Tradier (free sandbox)** | Free (free account signup) | 15-min delayed (options are delayed even for account holders without OPRA real-time) | IV + greeks included (via ORATS) | Clean **official** REST API, real quote timestamps, SLA. Same API upgrades to real-time later. **Primary** |
| **yfinance** (Yahoo) | Free | ~15-min delayed | IV + basic greeks included | Unofficial, no SLA, breaks periodically, no real quote timestamps, after-hours `bid=ask=0`. Zero-setup. **Fallback** |
| **Polygon.io** | Free tier (limited/delayed); paid for real-time | Delayed on free tier | Raw chain — **you compute greeks/IV** | Solid infrastructure; more analytics work on us. Alternative paid upgrade |

**Recommendation for the MVP (decision: a ~15-min delay is acceptable for now).** Build on the
**Tradier free sandbox** as the primary source. Because a 15-min delay is fine, the sandbox's delayed
options feed meets our needs *and* gives us what yfinance can't: an official/stable API, ORATS
greeks and IV, and **real per-quote timestamps** that make the 6.7 freshness gate actually
buildable. It is also the production path — funding a brokerage account later flips the same adapter
to real-time, no rewrite (7.7). The only cost is one-time account + token/OAuth setup. **yfinance**
stays as a no-auth, zero-setup **fallback** adapter for offline/local development and for when
Tradier is unreachable; both sit behind 7.3, so this is two thin adapters, not a fork.

**Consequence to carry forward:** delayed data is *stale by construction*, which makes the Section
6.7 defenses **more** important, not less — especially executable round-trip pricing and the
freshness/liquidity gates (now genuinely supportable thanks to Tradier's timestamps). We badge the
UI honestly ("prices delayed ~15 min") so users never expect tick-accurate fills. This is a
deliberate, reversible trade: delayed-but-clean now, live later behind the same interface.

### 7.5 Filling gaps the free feed leaves

Free providers are inconsistent; the adapter layer backfills:

- **Missing/garbled implied vol:** compute it ourselves by inverting Black-Scholes on the mid (or
  executable) price (Section 9). We need a robust solver anyway for the smile fit, so own-computed
  IV is the canonical path; provider IV is a convenience/cross-check.
- **Risk-free rate `r`:** a slow-moving input. Start with a small constant or a short Treasury
  reference refreshed daily; it barely moves on intraday timescales.
- **Dividends `q_div`:** use a trailing dividend yield or the known ex-div schedule; matters mainly
  for pricing and early-exercise edge cases, second-order for the MVP.
- **Quote timestamps:** if absent, treat the whole chain snapshot's fetch time as the timestamp and
  lean harder on liquidity gates (OI/volume/spread) since per-leg freshness can't be checked.

### 7.6 Caching, refresh, and rate limits

This ties directly to the real-time loop (6.6): **the chain does not change while the user sculpts**,
so we fetch a chain once per (symbol, expiration), cache it, and the entire drag-to-recommendations
loop runs against that cache — no network in the hot path. We refetch only on **symbol change**,
**expiration change**, or a periodic **staleness refresh** (e.g. every N seconds/minutes per the
provider's latency, with a visible "refresh" affordance). Rate limits are handled with per-provider
throttling, request coalescing (one chain fetch shared across all candidates), and exponential
backoff on errors. History and rates are cached with much longer TTLs.

### 7.7 Upgrade path to production data

Because of 7.1, going production-grade is additive: write one more adapter and flip config. Paid
tiers (Tradier funded / Polygon real-time / Intrinio / ORATS / ThetaData) buy true real-time
quotes, reliable uptime/SLA, genuine per-quote timestamps, vendor greeks, and deeper history. None
of the engine, scoring, visualization, or UI code changes — they still consume the 7.2 canonical
model. The only engine-visible improvement is that the 6.7 defenses get *easier* (fresher data, real
timestamps) — never harder.

### 7.8 Concretely: how a chain is fetched

**Primary — Tradier (REST, bearer token).** A few authenticated GET calls; the chain endpoint
returns every contract with prices, greeks, IV, and timestamps already attached. Sandbox base URL is
`https://sandbox.tradier.com/v1/`, production `https://api.tradier.com/v1/`; the adapter just swaps
base URL + token to go live.

```
GET /v1/markets/options/expirations?symbol=AAPL
    -> the list of expirations

GET /v1/markets/options/chains?symbol=AAPL&expiration=2026-07-17&greeks=true
    -> options.option[]: each with
       strike, option_type, bid, ask, last, volume, open_interest,
       greeks{ mid_iv, bid_iv, ask_iv, delta, gamma, theta, vega },
       bid_date, ask_date           # real epoch-ms timestamps -> 6.7 freshness gate

GET /v1/markets/quotes?symbols=AAPL          -> underlying spot
GET /v1/markets/history?symbol=AAPL&interval=daily   -> historical line (8.1)

Headers:  Authorization: Bearer <TOKEN>   Accept: application/json
```

The prices we trade off are the **`bid`** and **`ask`** fields: the adapter maps each `option` into
the canonical `OptionChain` (7.2), caches the snapshot, and the engine prices every candidate from
the cache — `ask` to buy a leg, `bid` to sell one (executable round-trip pricing, 6.7 Layer 1).
`mid` is for display only. Tradier's `bid_date`/`ask_date` give us genuine per-leg freshness; ORATS
`mid_iv` seeds the smile fit (but we still keep our own IV solver as canonical, 7.5).

**Fallback — yfinance (no auth, zero setup).** For offline/local dev or when Tradier is unreachable:

```python
import yfinance as yf
t = yf.Ticker("AAPL")
t.options                          # ('2026-07-17', ...)
chain = t.option_chain('2026-07-17')   # chain.calls / chain.puts DataFrames
# columns: strike, lastPrice, bid, ask, volume, openInterest, impliedVolatility, ...
spot, history = t.fast_info["last_price"], t.history(period="6mo")
```

Same canonical mapping. But note yfinance's weaknesses the adapter must absorb: **no real
timestamps** (the freshness gate degrades to "whole-snapshot fetch time"), and **after-hours
`bid = ask = 0`**, where the adapter falls back to `lastPrice` with a synthetic conservative spread
and marks the contract **low-confidence** (6.7 Layer 5). These hacks are *why* yfinance is the
fallback, not the primary — Tradier's feed makes most of them unnecessary.

Either way the engine is at its best during (delayed) market hours, and the 6.7 noise defenses are
not optional on a delayed feed.

### 7.9 Failure modes & graceful degradation

- **Provider down / symbol not found / no chain:** the adapter raises a typed error; the UI shows a
  clear "couldn't load data for X" state and offers the fallback provider.
- **Thin or empty chain (illiquid name):** the engine may legitimately return few or no
  recommendations; we say so plainly rather than surfacing junk (consistent with 6.7 / Section 11),
  and we never fabricate liquidity.
- **Partial chain (some strikes missing):** the smile fit and `q` extraction degrade gracefully to
  the strikes available; pruning (6.2 Stage A) already restricts to the belief-relevant region, so
  missing far-OTM strikes usually don't matter.
- **Clock/again-stale data:** the staleness refresh and freshness badge keep the user informed; the
  defenses assume staleness rather than trusting the feed.

---

## 8. User Journey & the Signature Visualization

### 8.1 The four-step journey (recap, made concrete)

1. **"What's your big idea?"** — pick a ticker. We fetch the quote and chain; the chart seeds the
   default cloud at the market's own implied distribution (Section 3.4), so the user starts at "no
   edge" and sculpts away from it.
2. **"Where's it going?"** — drag the center to the price/date they expect.
3. **"How sure are you?"** — stretch and skew the bands (Section 3.3). This is the whole input.
4. **"Here's how to trade it."** — the ranked, sortable list updates live (Section 6.5 / 6.6).

Steps 2–3 are not separate screens; they are direct manipulation of one object — the cloud — and
the recommendations on the side re-rank continuously as it changes.

### 8.2 The signature visualization: payoff overlaid on belief

This is the centerpiece (D12). It fuses the two things the user otherwise has to hold in their
head — *where I think the price will go* (the belief) and *what this trade pays at each price* (the
payoff) — into one picture. The unifying idea: **expected profit is the payoff weighted by the
belief, so show the payoff as terrain and the belief as the territory the price is likely to
occupy, and let the user see how much of their probable territory sits on profitable high ground
versus in the red.**

**2D form (always available, the workhorse).**
- Horizontal axis: terminal price `S_T`.
- The **belief** `f(S_T)` is drawn as the shaded probability cloud.
- The selected strategy's **`PnL(S_T)`** curve is overlaid. Above the zero line it is **green**
  (profit); below, **red** (loss).
- The belief cloud is tinted by the payoff sign beneath it — **green where the trade profits, red
  where it loses** — so the green-tinted area *is* the probability of profit (`PoP_f`) made
  visible, and the red-tinted area is where the user's own expectations lose money.
- Markers: breakevens (where the curve crosses zero), max profit / max loss, the belief center,
  and the current spot.

**3D form (the hero view).** This generalizes the uploaded mock-ups: price and time on the floor
plane, just like the cloud the user drew.
- **Floor plane:** price (one axis) × time-to-expiration (the other), matching the belief cloud's
  own layout.
- **The belief** remains the green probability cloud hovering over the floor — exactly what the
  user sculpted.
- **The payoff becomes a surface — a terrain.** Elevation above the zero plane = **profit (green,
  brighter = more)**; elevation below = **loss (red, deeper = worse)**. At the expiration edge the
  surface is the sharp piecewise-linear payoff; back toward "now" it can be rendered as the
  smoother mark-to-market value collapsing into that payoff (a held-to-expiration MVP can render
  the terminal payoff as a ridge and keep the interior visually simple).
- **Topographic rings (your "rings that show what price it'll be").** Two families of contour
  lines printed on the terrain:
  - **Iso-P&L contours** — like elevation lines on a topographic map, showing the \$0 (breakeven),
    +\$X, −\$X levels of the payoff terrain.
  - **Iso-probability rings** — the level sets of the belief cloud (the 68% / 95% rings),
    projected onto the terrain, showing *where the price is actually expected to land*.
- **The story the picture tells at a glance:** does the user's probability cloud (and its 68/95
  rings) sit over the green high ground or slump into the red valley? A great recommendation is one
  where the cloud blankets the green plateau. The *volume of the cloud lying over green minus red*
  is, literally, the expected profit the engine computed.

### 8.3 Real-time interaction model

Two complementary modes over the same scene:

- **Sculpt the belief, terrain fixed:** with a recommendation selected, the user reshapes the
  cloud and watches their probable territory slide across the payoff terrain — instantly seeing the
  view for which this trade is good or bad.
- **Flip recommendations, belief fixed:** with the cloud held, the user steps through the ranked
  menu and the terrain re-forms beneath their fixed cloud — instantly comparing which structure
  best fits *their* view.

Both are cheap to render because, per Section 6.6, payoff curves are cached and only the
belief-weighted overlays recompute on a drag.

### 8.4 The recommendation list

Beside the visualization sits the ranked list from Section 6.5: a **sort bar** on top (capital, PoP,
max return/ROI, risk + edge, and the prunable extras) and a **scrollable column** of result rows
below, lower rows **faded** and sharpening toward the top (D16). **Long stock is pinned as a
benchmark row** regardless of the active sort (D11).

Each row: structure name + "?" explainer, a mini payoff-over-belief thumbnail, the headline metric
for the current sort (e.g. `PoP_f`), max loss / max gain, breakevens, capital required, per-trade
Greeks (D17), and a one-line plain-English summary ("You profit if NVDA is between \$X and \$Y on Aug
21; you risk \$Z to make up to \$W"). Selecting a row drives the big visualization (8.2).

**Preference controls (D14).** The ranking weights live behind an **expandable "advanced" panel** so
they never clutter the default experience: a top-level risk-appetite control (conservative ↔
aggressive) for casual users, and, one window deeper, full per-factor weight control (PoP, ROI, cost,
liquidity) for power users. Changing a preference re-ranks the list instantly (6.4 / 6.6).

### 8.5 Prediction-builder flourish: the probabilistic forward path

A small visual treat in the prediction builder, requested for feel. The solid historical price line
stops at "now"; from there, extend it into the future as a faint, **animated probabilistic path** —
a random walk that wiggles forward and lands inside the cloud at the chosen expiration. It reads as
"the future is uncertain, but it drifts toward what I predicted," and it makes the abstract belief
feel like a living forecast.

- **Shape:** a Brownian sample path *pinned* to the belief — drift toward the center `m`, step
  variance scaled so the spread at expiration matches the belief's `σ`, ending at a sample drawn
  from `f(S_T)`. Mathematically a Brownian bridge from spot to a belief-sampled terminal price.
- **Style:** one or several faint "ghost" paths fanning out from now to expiration; re-sample on a
  gentle loop so they shimmer and redraw, reinforcing that each is just *one* possible future.
- **Strictly decorative.** This path is a *rendering* of the belief, never an input to it. The
  engine still consumes only the terminal density `f(S_T)` (D5); the wiggling lines change nothing
  the engine sees. They should visibly update as the user reshapes the cloud (new drift, new
  spread), so the flourish always agrees with the current belief.

### 8.6 Implementation note (non-binding)

2D via a standard charting layer (e.g. D3/Recharts/Plotly); the 3D terrain via a surface renderer
(Plotly 3D surface is the fastest path; Three.js if we want full control over the topographic
rings and lighting). The renderer choice is deferred to Section 10 and does not affect any of the
math above — the visualization consumes the same `{S_i, f_i}` grid and cached payoff curves the
engine already produces.

---

## 9. Math Reference

The self-contained formula appendix the engine implements. Everything earlier in the doc points
here. All formulas use continuous compounding and a continuous dividend yield; conventions in 9.1.

### 9.1 Notation & conventions

```
S        underlying spot price            K       strike
τ        time to expiration, in years     r       risk-free rate (continuous)
q_div    continuous dividend yield        σ       volatility (annualized)
F        forward price = S·e^{(r−q_div)τ}
N(·)     standard normal CDF              φ(·)    standard normal PDF
S_T      terminal price at expiration (random)
f(·)     user belief density over S_T     q(·)    market-implied (risk-neutral) density over S_T
```

Time is measured in calendar years to expiration (`τ = days_to_exp / 365`). All option math is at a
single expiration unless laddering (4.4) combines several, each handled independently.

### 9.2 Black–Scholes–Merton pricing (with dividends)

```
d1 = [ ln(S/K) + (r − q_div + σ²/2)·τ ] / (σ·√τ)
d2 = d1 − σ·√τ

Call  C = S·e^{−q_div·τ}·N(d1) − K·e^{−r·τ}·N(d2)
Put   P = K·e^{−r·τ}·N(−d2) − S·e^{−q_div·τ}·N(−d1)
```

Put–call parity (consistency check): `C − P = S·e^{−q_div·τ} − K·e^{−r·τ}`.

### 9.3 The Greeks (used for risk display, smile work, and the 3D terrain interior)

```
Δ  call:  e^{−q_div·τ}·N(d1)            put:  −e^{−q_div·τ}·N(−d1)
Γ        : e^{−q_div·τ}·φ(d1) / (S·σ·√τ)              (same for call/put)
Vega     : S·e^{−q_div·τ}·φ(d1)·√τ                   (per 1.00 vol; ÷100 for per 1%)
Θ  call  : −[S·e^{−q_div·τ}·φ(d1)·σ /(2√τ)] − r·K·e^{−r·τ}·N(d2)  + q_div·S·e^{−q_div·τ}·N(d1)
   put   : −[S·e^{−q_div·τ}·φ(d1)·σ /(2√τ)] + r·K·e^{−r·τ}·N(−d2) − q_div·S·e^{−q_div·τ}·N(−d1)
                                                     (per year; ÷365 for per calendar day)
ρ  call  : K·τ·e^{−r·τ}·N(d2)           put:  −K·τ·e^{−r·τ}·N(−d2)
```

### 9.4 Implied volatility inversion

Given a market price `P*`, find `σ` such that `BS(σ) = P*`. Since vega `> 0`, BS price is strictly
increasing in `σ`, so the inverse is unique within the no-arbitrage price bounds.

- **Primary:** Newton–Raphson using vega, `σ_{n+1} = σ_n − (BS(σ_n) − P*)/vega(σ_n)`, seeded near
  `σ ≈ √(2π/τ)·(P*/S)` (Brenner–Subrahmanyam ATM guess).
- **Fallback:** Brent/bisection on `σ ∈ [1e-4, 5]` when Newton steps misbehave (deep ITM/OTM, tiny
  vega).
- **Guards:** verify the price respects intrinsic-value and forward bounds first; flag prices that
  imply no real solution (a data artifact — see 6.7). Invert on the **mid** (or executable) price,
  not `last`.

### 9.5 The belief density (two-piece lognormal) — operational form

From 3.2, with `μ = ln(m)` (m = median = the center handle), and log-widths `σ_down`, `σ_up`:

```
let x = ln(S)
g(x) = A·exp(−(x−μ)² / (2σ_down²))   if x ≤ μ
       A·exp(−(x−μ)² / (2σ_up²))     if x >  μ
A    = sqrt(2/π) / (σ_down + σ_up)            (so ∫ g dx = 1)

belief density in price:   f(S) = g(ln S) / S
```

`σ_down = σ_up` recovers a plain lognormal. Band handles set the widths (3.3):
`σ_up = ln(P_up,68 / m)`, `σ_down = ln(m / P_down,68)`. We do **not** rely on closed-form moments;
all belief moments, PoP, and EV are computed numerically on the grid (9.9), consistent with the
engine contract D5.

### 9.6 Strategy payoff, P&L, breakevens, extremes

For a structure with legs `ℓ = (type, K, side∈{+1,−1}, qty)`:

```
intrinsic_call(S,K) = max(S − K, 0)      intrinsic_put(S,K) = max(K − S, 0)

ValueAtExpiry(S) = Σ_ℓ side_ℓ·qty_ℓ·intrinsic_ℓ(S)
NetCost          = Σ_ℓ side_ℓ·qty_ℓ·price_ℓ          (executable: buy@ask, sell@bid — 9.7)
PnL(S)           = ValueAtExpiry(S) − NetCost
```

`PnL(S)` is piecewise-linear with kinks at the strikes. Therefore:
- **Breakevens:** scan adjacent kink points for sign changes in `PnL`; linearly interpolate the
  zero crossing on each segment.
- **Max gain / max loss:** evaluate `PnL` at every kink and at the two outer asymptotes; the
  defined-risk rule (5.1) guarantees both asymptotes are finite (or bounded by stock legs).
- **Long stock leg:** linear, `PnL_share(S) = S − S₀`; combine with option legs identically.

### 9.7 Executable pricing & the scoring integrals

**Executable prices (6.7 Layer 1).** Entry: pay `ask` on longs, receive `bid` on shorts. A
round-trip charge assumes the reverse on exit; the MVP either (a) charges full entry spread and a
modeled exit spread, or (b) applies a single round-trip haircut `h_ℓ ≈ (ask_ℓ − bid_ℓ)` per leg.
Ranking always uses the conservative figure; `mid` is shown for reference only.

**Scoring under the belief**, on the price grid `{S_i}` with weights `f_i` and spacings `ΔS_i`:

```
EV    = Σ_i  PnL(S_i)·f_i·ΔS_i                         expected profit under belief
PoP_f = Σ_{i : PnL(S_i) > 0}  f_i·ΔS_i                 probability of profit under belief
ROI   = EV / capital                                  (capital per 6.3)
```

**Per-leg edge decomposition (why search is cheap — 6.2).** EV is linear in the legs:

```
e_ℓ = ( Σ_i intrinsic_ℓ(S_i)·f_i·ΔS_i )  −  price_ℓ          (precompute once per leg)
EV  = Σ_ℓ side_ℓ·qty_ℓ·e_ℓ
```

so any combination's EV is a dot product of its legs' precomputed edges. PoP, max loss, and ROI are
**not** linear and are computed on the assembled `PnL` curve (Stage B, 6.2).

**Optional risk terms** for ranking/penalties: belief variance
`Var_f[PnL] = Σ_i (PnL(S_i) − EV)²·f_i·ΔS_i`, and CVaR at level α
`CVaR_α = −E_f[ PnL | PnL ≤ VaR_α ]` for a belief-aware downside (used by the shrinkage lower bound
in 6.7 Layer 4).

### 9.8 Market-implied density `q` and the smile (for the overlay, 6.8)

**Breeden–Litzenberger.** The risk-neutral density is the discounted second derivative of call
price in strike:

```
q(K) = e^{r·τ} · ∂²C/∂K²
```

Discretely, on a fine strike grid after smoothing:

```
q(K_i) ≈ e^{r·τ} · [ C(K_{i+1}) − 2·C(K_i) + C(K_{i−1}) ] / (ΔK)²
```

then clip negatives (arbitrage/noise) and normalize so `Σ q(K_i)·ΔK = 1`. Sanity: `E_q[S_T] = F`.

**Smile fitting (prerequisite).** Raw `∂²C/∂K²` on noisy quotes is unusable, so fit a smooth
implied-vol curve first, then convert to `C(K)` via 9.2 before differencing:
- **MVP:** a cubic smoothing spline of IV vs strike (or vs log-moneyness / delta), lightly
  regularized.
- **Upgrade:** an arbitrage-aware parametric fit — **SVI** total variance
  `w(k) = a + b·(ρ·(k−m) + √((k−m)² + s²))`, `k = ln(K/F)` — which guarantees a smoother, more
  stable density. The same fitted curve powers the surface-relative validation in 6.3 / 6.7 Layer 3.

### 9.9 Numerical details (the price grid)

```
range:    [S_lo, S_hi] = [ max(ε, m·e^{−4σ̄}),  m·e^{+4σ̄} ],   σ̄ = max(σ_up, σ_down)
points:   N ≈ 300–600, uniform in S (simple payoff integration) or in ln S (natural for lognormal)
normalize belief on the grid:   f_i ← f_i / ( Σ_j f_j·ΔS_j )     so it sums to 1 exactly
```

All structures, the belief, `q`, EV/PoP integrals, and the visualization share this one grid, so the
overlays line up and the cached payoff matrix (6.6) is just `N × (#candidates)`. `ε` keeps the lower
bound strictly positive (lognormal support). Choose `N` for smooth curves without over-costing the
live loop; 300–600 is ample for option payoffs that are piecewise-linear anyway.

---

## 10. Architecture

How the system is split across machine boundaries, the data that crosses them, and the API. Two
decisions govern it: the **real-time scoring loop runs client-side** (fastest *and* most cost-
efficient — D18), and the MVP is **local now, structured to host later** (D19).

### 10.1 Governing decisions

| | Choice | Why |
|---|---|---|
| Live loop | **Client-side** | No network in the drag loop → instant; server computes once per ticker/expiration and caches → the expensive-per-interaction work runs free in the browser, no WebSocket infra to scale. Fastest and cheapest at once |
| Heavy compute | **Server (Python)** | Data fetch, IV solve, smile fit, `q`, Greeks, candidate generation — done once per chain, where the libraries and the data tokens live |
| Deployment | **Local now, hosted-ready** | Run on the dev machine; structure (env config, server-side secrets, stateless server) so hosting is a small later step |
| Stack | **FastAPI + NumPy/SciPy** server; **React + TypeScript** client | D9. Python owns the quant math; React owns the interactive chart and the hot loop |

### 10.2 What runs where

**Server (Python / FastAPI)** — runs **once per `(ticker, expiration)`**, then caches:
- Data adapters (Tradier primary / yfinance fallback — Section 7); the **provider token never leaves
  the server** (a second reason the fetch must be server-side).
- IV inversion (9.4), smile fit (9.8), market-implied `q` (9.8), per-leg Greeks (9.3).
- Candidate generation: Stage-A leg pruning and Stage-B combinatorial enumeration (6.2).
- Per-leg payoff vectors on the shared grid, executable prices, and the belief-independent
  uncertainty term (see 10.4).
- Emits the **scoring bundle** (10.3).

**Client (React / TypeScript)** — runs **on every drag**, no server call:
- The prediction builder: turn the sculpted cloud into `(m, σ_down, σ_up, T)` and evaluate the
  belief density `{f_i}` on the grid (3.5, 9.5).
- The hot loop: assemble each candidate's payoff from the leg vectors, integrate against `{f_i}` for
  EV / PoP / ROI (9.7), apply the user's weights (6.4 / D14), then de-dup, sort, and fade (6.5 /
  D16).
- The visualization (2D overlay + 3D terrain, 8.2) and the probabilistic-path flourish (8.5).
- Preference panels (D14) and sorter bar (D16) — pure client-side re-rank.

### 10.3 The scoring bundle (the one payload that matters)

The bundle is what makes the client-side loop possible, and the **linearity of EV (9.7) keeps it
small**: the client does *not* need a full `candidates × grid` matrix — it needs the **pruned leg
pool** plus a list of candidates as **combinations of leg indices**, and reconstructs payoffs
locally.

```
ScoringBundle (per ticker + expiration):
  meta:        symbol, expiration, spot, forward, r, q_div, fetched_at, delayed_flag
  grid:        [S_1 … S_N]                       # the shared price grid (9.9)
  legs:        for each pruned leg (~15–25):
                 id, type, strike, side-agnostic payoff_vector[N],
                 bid, ask, mid, edge e_ℓ (9.7),
                 greeks{δ,γ,θ,ν}, half_spread (uncertainty unit),
                 liquidity{volume, OI}, freshness(ts), confidence
  candidates:  for each structure (~few thousand):
                 [ (leg_id, side, qty) … ],       # tiny — indices, not curves
                 net_cost, capital, max_loss, max_gain, breakevens,
                 exec_quality (6.7), uncertainty u (10.4), name/label
  market_q:    q density on the grid              # for the overlay (6.8 / D17)
```

Sizes: leg payoff vectors are `~20 × N` floats (tens of KB); the candidate list is index tuples
(small). The whole bundle is comfortably a few hundred KB — a one-time fetch per chain, then the
browser is self-sufficient.

### 10.4 Noise defense fits the split cleanly

The shrinkage term from 6.7 Layer 4 is **belief-independent**, so it precomputes server-side. EV's
uncertainty from quote noise is `u = Σ |side·qty·half_spread_ℓ|` (price jitter moves `net_cost`
linearly; it does not touch the belief integral). So the server ships `u` per candidate, and the
client simply ranks on the lower bound `EV − λ·u` (6.7) — full robustness, zero extra client cost,
no per-drag Monte-Carlo. (Nonlinear PoP-near-breakeven fragility is likewise flagged server-side into
`exec_quality`.)

### 10.5 Real-time data flow

```
ticker entered ─▶ GET /bundle (server: fetch chain, build + cache bundle) ─▶ client seeds default
                  cloud at q, evaluates list once, renders
drag belief    ─▶ client: recompute {f_i} ─▶ re-score candidates ─▶ re-sort/fade/render   (NO server)
change weights ─▶ client: re-weight + re-sort                                              (NO server)
change expiry  ─▶ GET /bundle?expiration=…   (new bundle)
change ticker  ─▶ GET /bundle                (new bundle)
staleness tick ─▶ re-GET /bundle             (refresh delayed quotes; visible affordance)
```

Only chain-changing actions hit the network; everything the user *feels* while sculpting is local.

### 10.6 API contract (REST, stateless)

```
GET /api/expirations/{ticker}              -> [ dates ]
GET /api/bundle/{ticker}?expiration=YYYY-MM-DD
                                           -> ScoringBundle (10.3)   # the core call
GET /api/history/{ticker}?lookback=6mo     -> [ (date, ohlc) ]       # the historical line (8.1)
GET /api/quote/{ticker}                    -> spot/quote             # lightweight refresh
(optional) POST /api/recommend             -> server-side scoring fallback for non-JS/headless use
```

REST only — no WebSocket, because the live loop never calls the server. Responses are cacheable;
`bundle` carries `fetched_at` + `delayed_flag` for the freshness badge.

### 10.7 Local-now, hosted-ready structure

- **Secrets server-side only.** Provider tokens/base-URLs come from env/config; the browser never
  sees them. (Local: `.env`; hosted: the platform's secret store — no code change.)
- **Stateless server + pluggable cache.** Bundle/chain cache is an in-memory TTL map now, behind an
  interface that swaps to Redis for multi-instance hosting later.
- **One origin in dev, splittable in prod.** Dev runs Vite (React) + Uvicorn (FastAPI) with CORS;
  prod can serve the built static client from FastAPI or a CDN — same API.
- **Containerizable.** The server is a single image; "hosting" is running it behind a domain plus a
  shared cache. No architectural rewrite (this is the payoff of the Section 7 abstraction + stateless
  design).

### 10.8 Performance budget

- **Bundle build:** sub-second target (one chain fetch + vectorized NumPy over a pruned pool).
- **Bundle size:** few hundred KB (10.3).
- **Per-drag re-score (client):** target < 16 ms (60 fps). A few thousand candidates × a few-hundred
  grid is ~1e6 multiply-adds — fine in TypeScript with typed arrays; drag is throttled to animation
  frames; WASM/Rust is a later lever only if profiling demands it.
- **Server cost:** ≈ O(one bundle build per ticker/expiration view), cached and shared — the
  reason the client-side loop is the cost-efficient choice.

---

## 11. Edge Cases

A consolidated checklist of the awkward cases the engine, data layer, and UI must handle. Many are
specified in earlier sections; this gathers them in one place (with pointers) and adds the ones not
yet covered. *(Legal / disclaimer posture intentionally deferred — to be written later.)*

### 11.1 Belief input

| Case | Handling |
|---|---|
| Width → 0 (near-spike "it will pin exactly here") | Clamp `σ` to a small floor (3.6); resolves naturally to a butterfly, not a divide-by-zero |
| Extreme skew (`σ_up/σ_down` huge) | Clamp the ratio to a sane max (3.6) so the cloud can't become a pathological sliver |
| Center dragged to/below 0 | Impossible by construction (lognormal support `S>0`); UI clamps to a positive minimum (3.6) |
| Belief center far from any listed strike | Allowed; engine finds the best structure near that region, and recommendation quality/score reflects the gap (3.6) |
| Belief sits **entirely outside** the available strike range | Few or no option structures can express it; degrade gracefully — surface **long stock** (the benchmark, D11) and say the chain doesn't reach that far |
| Belief far **wider** than the listed strike range | Candidate strikes are capped by what's listed; the tails of `f` beyond the outermost strikes are unreachable — note it rather than fabricate strikes |
| User hasn't moved the cloud (still seeded at `q`) | By design EVs are ≈ 0 — **communicate honestly**: "your view currently matches the market; sculpt it to find an edge." A feature, not a failure (3.4) |

### 11.2 Time / expiration

| Case | Handling |
|---|---|
| Target date between two listed expirations | Snap to the nearest by time center-of-mass (4.4) |
| Belief wide in time but only **one** expiration exists | Laddering (4.4) falls back to a single expiration |
| Very near-dated (`τ → 0`, expires today/tomorrow) | Floor `τ`; BS/IV inversion and Greeks blow up as `τ→0` (huge gamma) — guard numerically and badge "expiring imminently" |
| Very far-dated (LEAPS) | Works, but liquidity is typically thin → the 6.7 gates will down-rank; surface that via the liquidity sorter |

### 11.3 Market data & contracts

| Case | Handling |
|---|---|
| Non-optionable ticker / ticker not found / provider down | Typed adapter error; clear "couldn't load X" UI; offer fallback provider (7.9) |
| Thin or empty chain | Engine legitimately returns few/no trades — say so plainly, never fabricate liquidity (7.9) |
| Partial chain (missing strikes) | Smile fit and `q` degrade gracefully to available strikes; belief-region pruning means missing far-OTM strikes usually don't matter (7.9) |
| After-hours `bid = ask = 0` | Fall back to `last` with a synthetic conservative spread; mark **low-confidence** (7.8) |
| Crossed/locked/zero quotes, zero OI, penny (<$0.10) options | Rejected or penalized by the 6.7 Layer-2 hygiene gates |
| Stale quotes / market closed | Freshness badge + "delayed ~15 min"; defenses assume staleness (7.8) |
| **Earnings/known event before expiration** | IV is elevated (event premium) → market price high → the edge calc auto-handles it, but **flag "earnings before expiry"** so the user understands the IV-crush risk |
| **Ex-dividend before expiration** | Early-exercise risk on short ITM calls (American equity options); flag short legs exposed to assignment around ex-div |
| **Adjusted / non-standard contracts** (post-split, deliverable ≠ 100 shares) | These have nonstandard multipliers and are a real trap — detect and **exclude** non-standard contracts from candidate generation |
| Halted stock / no spot | Block recommendations; show "trading halted / no live price" |

### 11.4 Engine & scoring

| Case | Handling |
|---|---|
| No candidate survives the gates (all illiquid) | Return empty with an explanation + the stock benchmark; do not relax the gates to fill space |
| All candidates have negative/zero edge | Belief agrees with the market — communicate it (see 11.1 last row); don't surface marginal "best of a bad lot" as if it were good |
| Ties / near-identical scores | De-duplicate (6.5) + stable sort so ordering doesn't flicker on tiny score changes |
| Very high- or low-priced underlying | Scale capital-tier thresholds and grid to the underlying, not absolute dollars |
| Wide spread flips debit↔credit sign | Conservative executable pricing (6.7 L1) governs; label by the realistic net cost, not the mid |
| Short legs near the money at expiration | Surface pin/assignment risk in the row detail |

### 11.5 Numerical

| Case | Handling |
|---|---|
| Candidate strike falls **outside** the belief's `±4σ` grid | The grid must span **both** the belief support **and** all candidate strikes — extend `[S_lo, S_hi]` to cover every enumerated strike, or payoffs get clipped (9.9) |
| Belief mass piled at a grid edge | Extend the grid / re-normalize; warn if the belief can't be contained |
| IV solve fails (price outside no-arb bounds) | Flag the leg as a data artifact (9.4 / 6.7); exclude from the pool |
| `q` second-difference goes negative (noise) | Clip negatives and renormalize (9.8) |

### 11.6 UI / interaction

| Case | Handling |
|---|---|
| User drags faster than render | Throttle re-scoring to animation frames (10.8) |
| Ticker/expiration changed mid-drag | Cancel the in-flight bundle fetch; don't apply a stale bundle to the new belief |
| Empty/invalid ticker entry | Inline validation before any fetch |
| Preference/weight change while sculpting | Pure client re-rank, no refetch (10.5) — must stay smooth |

---

## 12. Frontend Design Specification

This section is written to be handed directly to an implementer (e.g. Claude Code). It is
prescriptive: concrete tokens, states, motion, and component behavior. Decision **D20** governs it.

### 12.0 North star & the anti-brief

**North star:** the product should feel like the calm, frictionless surface of something quietly
superintelligent — *incredibly clean, uncluttered, elegant, and intuitive.* The **interactive graph
is the interface**; chrome stays out of the way until summoned. Restraint is the whole aesthetic.

**The anti-brief — what this must NOT look like.** Avoid the generic "AI-SaaS" template at all
costs: no purple/blue hero gradients, no glassmorphism stacks, no emoji, no rounded-card soup, no
gradient-filled buttons, no drop-shadow everything, no neon glow, no default component-library
look, no marketing fluff or skeuomorphic finance clip-art. If a screen could be any AI startup's
landing page, it is wrong. The reference points are a beautifully restrained Bloomberg terminal, a
fine print magazine, and the spare UI of a sci-fi film — not a SaaS dashboard.

**Three rules that enforce it:**
1. **One primary thing per screen.** Each state has a single obvious focus; everything else is one
   gesture away (progressive disclosure, 12.6).
2. **The graph is the canvas.** It is full-bleed; controls float over it as minimal "ink on glass,"
   never boxed in panels that fight it.
3. **Color means P&L, nothing else.** Green = profit, red = loss, in families of shades. The rest of
   the UI is greyscale on the dark canvas, with at most one restrained cool accent for focus.

### 12.1 Color tokens

Default theme is **dark**; light is a mirrored token set (D14/D20 themeable — ship as CSS custom
properties / design tokens so both exist and the default is dark).

**Dark theme (default):**
```
--canvas        #070809   page background (near-black, faintly cool)
--surface-1     #0C0E11   raised layers (rails, sheets)
--surface-2     #131619   higher layers (popovers, active rows)
--line          #1B1F24   hairline borders / dividers (default)
--line-strong   #2C333B   hover / emphasis borders
--text-1        #ECEEF1   primary text
--text-2        #9AA0A8   secondary text
--text-3        #6B7079   muted labels / hints
--text-faint    #454B54   faintest (placeholder, disabled)
```
**P&L green family (profit):**
```
--g-1 #6EE7B7 (light)   --g-2 #34D399 (primary line)   --g-3 #10B981 (strong)
--g-fill #0F2E26 (terrain fill, ~14% over canvas)      --g-edge #065F46
```
**P&L red family (loss):**
```
--r-1 #FCA5A5 (light)   --r-2 #F2706F (primary line)    --r-3 #E5484D (strong)
--r-fill #2E1718 (terrain fill)                          --r-edge #7F2A2A
```
**Accent — used sparingly, never confusable with P&L:** a cool ice tone for focus rings, the active
sort, and selection states only.
```
--accent #7DD3FC   (focus / active)      --accent-dim #38506A
```
Shades of green/red may be used freely *within* the terrain and data viz (deeper = more profit/loss,
per the elevation metaphor, 8.2); "other colors that match can be used occasionally" → restrict that
to the single `--accent` and desaturated neutrals so the palette never gets noisy.

**Light theme (mirror):** `--canvas #FBFBF9` (warm off-white), surfaces `#FFFFFF`/`#F4F4F1`, text
`#16181B`/`#5A5F66`, lines `#E6E6E1`/`#D2D2CC`; the green/red read as ink (`#0F7A5A`, `#C23B3B`) not
neon. Same token names, swapped values.

### 12.2 Typography

The chosen voice is **mono-accented**: a clean neutral sans for everything you *read*, and a
**monospace for everything you *measure*** (tickers, prices, P&L, axes). The monospaced data is the
distinctive signature — it reads like a precise instrument panel and is what makes the product feel
un-generic.

```
Prose / UI:   "Inter", system-ui, sans-serif
Data / mono:  "JetBrains Mono", ui-monospace, monospace   ← ALL numerals, tickers, prices, P&L, axes
Weights:      300 (large display only), 400 (body), 500 (emphasis/labels). Never 600/700.
Case:         sentence case for all prose. UPPERCASE only for tiny eyebrow/micro-labels.
```

**What is mono vs sans:**
- **Mono** (JetBrains Mono): ticker symbols (`NVDA`), every price/strike, P&L, PoP %, ROI, capital,
  breakevens, axis tick numbers, dates on the time axis, contract identifiers. Monospace gives
  natural column alignment — no `tnum` trickery needed, and numbers never reflow as they change.
- **Sans** (Inter): the wordmark, prose, strategy names, plain-English summaries, buttons, and the
  tracked uppercase micro-labels.

**Scale & treatment:**
- Wordmark `thesis.` — 18px / 500 (sans), letter-spacing −0.01em. The period may carry `--g-2`.
- Display ticker / hero number — 40–48px / 400 (mono), letter-spacing −0.01em.
- Section heading — 22px / 500 (sans).
- Body — 15px / 400 (sans), line-height 1.6.
- Data readouts (prices, PoP, P&L) — 14–15px / 500 (mono).
- Micro-label / eyebrow — 11px / 500 (sans), **UPPERCASE**, letter-spacing +0.16em, color
  `--text-3` — sort keys, section eyebrows, axis units.

### 12.3 Motion language ("smooth on the outside")

The feel is effortless, decelerating, and confident — **no bounce, no overshoot, no spring**
(playful elasticity reads wrong for "quietly superintelligent"). Things *settle* into place.

```
Easing (settle, most UI):     cubic-bezier(0.16, 0.84, 0.30, 1)     ← decelerate, no overshoot
Easing (morph, graph/terrain):cubic-bezier(0.65, 0.00, 0.35, 1)     ← smooth in-and-out
Durations:  micro 120ms · standard 300ms · state transition 600–800ms · ambient loops 3–6s
```
**Principles:**
- **Continuous, never snapping.** When the strategy changes, the payoff terrain *interpolates* from
  one shape to the next (morph the curve), it doesn't cut. When the list re-ranks, rows *glide* to
  new positions (FLIP), they don't jump.
- **Choreographed reveals.** State changes stagger their elements in (fade + 8px rise, 40–60ms
  stagger). Nothing all-at-once.
- **1:1 drag with light smoothing.** The belief cloud tracks the cursor exactly, with a tiny
  (~60ms) smoothing on the derived recommendations so the list doesn't jitter frame-to-frame.
- **Ambient life.** The probabilistic ghost paths (8.5) shimmer on a slow 4–6s loop; the input caret
  blinks. Subtle, never distracting.
- **Anticipation.** Hover/focus states pre-brighten the target slightly before action.
- Respect `prefers-reduced-motion`: cross-fade instead of morph/translate, keep durations ≤120ms.

### 12.4 The staged experience (screen states)

The app is a single full-screen canvas that progresses through four states. Each is a deliberate,
near-blank moment that earns the next.

**State 0 — Landing (blank).**
- The entire screen is the dark canvas. *Nothing* on it except: the `thesis.` wordmark (small,
  top-left) and, centered, a single quiet prompt — `Pick a ticker` (11px uppercase eyebrow in
  `--text-3`) above a large, minimal ticker input (a thin underline field, blinking `--accent`
  caret, **monospace**). Optionally a faint horizon hairline.
- No nav, no buttons, no cards, no marketing. The background treatment is TBD (solid near-black is
  the safe default; a barely-there vignette is acceptable — never a gradient hero).
- Typing a valid ticker and pressing enter advances. Autocomplete, if shown, is a minimal floating
  list of monospaced symbols.

**State 1 — Predict (the graph, full-screen, draggable).**
- On confirm, the landing elements fade out and the **prediction graph fills the whole screen**
  (600–800ms choreographed reveal): the historical price line animates in from the left, the
  time axis (Now → expirations) and price axis fade up, and the **belief cloud** appears at the
  default (seeded at the market, 3.4) ready to sculpt.
- The user **drags** to predict: the center circle (price × date), the upper/lower 68/95 band
  handles (skew + width). The shimmering ghost paths (8.5) extend the history into the future.
- Chrome is almost nothing: the wordmark (now tiny, dimmed), the live expiration label (`Exp Aug
  21`), and one quiet confirm affordance (or a return/enter gesture). A one-time `drag to predict`
  hint fades after first interaction.

**State 2 — Reveal (the valley fills).**
- On confirm, **the graph stays exactly put** — the belief cloud does not move — and the **P&L
  terrain of the top-ranked strategy fills in beneath it** (the green/red valley morphing up from
  the zero plane, 8.2), while the recommendation rail (12.5) slides in from the right.
- This is the product's signature moment: the user's prediction is now sitting over profitable green
  ground or red valley, and they can *see* the fit. Motion is the smooth 600–800ms morph.

**State 3 — Browse (pickers change the terrain).**
- The graph remains the full-bleed canvas. As the user changes the **sort** or selects a different
  row in the rail, the terrain **morphs** to that strategy's payoff; as they re-sculpt the belief,
  the rail **re-ranks** live (6.6). Everything is continuous (12.3).
- Advanced controls (preference weights, the `?` explainers, market-`q` overlay toggle, Greeks) are
  all hidden behind quiet affordances until summoned (12.6).

### 12.5 Layout & key components

**The canvas (all states ≥1).** The graph is full-bleed behind everything. 2D overlay by default
(8.2); a discreet toggle lifts it into the 3D terrain. Controls float over it with no opaque panels
— translucent `--surface-1` at ~70% with a subtle backdrop blur, separated by hairlines, never hard
cards.

**Ticker input (State 0).** Underline-only field, large **monospace** text (the ticker is data),
`--accent` caret, no border box, no button — enter to confirm.

**Belief handles (States 1–3).** Center = a thin-ring circle (`--text-1` stroke); band handles =
small horizontal ticks with `68%` / `95%` micro-labels in tracked uppercase; the cloud is a soft
green wash (the belief, distinct from the P&L terrain). Hit areas generous; cursor `grab`/`grabbing`.

**Recommendation rail (States 2–3).** A slim column docked right (~340px), translucent over the
canvas, collapsible to a hairline. Top: a **sort bar** — a row of 11px uppercase tracked labels
(`capital · prob · return · risk · edge`), the active one in `--text-1` with a 1px `--accent`
underline, the rest `--text-3`. Below: a **scrollable, borderless list** of rows separated by
hairlines. Each row: structure name (15/500, sans), a 1-line plain-English summary (`--text-2`,
sans), the sort's headline metric as a **mono** number, and a tiny inline payoff sparkline. **Lower rows fade**
progressively (D16) — opacity steps from 1.0 at top toward ~0.35 down the scroll, sharpening as they
near the top. The active row sits on `--surface-2`. **Long stock is pinned** at the rail's foot as a
labeled benchmark (D11).

**Preference panel (progressive disclosure).** A single small control at the rail's foot (a slider
glyph, label `Tune`). Tapping it slides up a quiet sheet: first a **risk-appetite dial**
(conservative ↔ aggressive), and behind a `Advanced` reveal, the full per-factor weight sliders
(D14). Closes to nothing.

**Explainers.** A small `?` on each strategy name and each jargon term opens an inline popover (one
calm paragraph, sentence case) — never a modal, never always-on.

**Badges.** Capital tier and liquidity/confidence are tiny tracked-uppercase tags using a single
muted neutral fill (text from the same neutral family, per the on-colored-bg rule) — not colored
pills, to keep green/red exclusive to P&L.

### 12.6 Progressive disclosure (how it stays uncluttered)

The dials exist but are *earned*, never defaulted-on:
- **Default view** shows only: the graph, the belief handles, the ranked rail, and the sort bar.
- **One layer in:** preference risk dial, the 2D⇄3D toggle, the market-`q` overlay toggle, per-row
  Greeks (expand a row).
- **Two layers in:** full custom weight sliders; advanced sort keys; raw contract details.
- Nothing that belongs at layer 1 or 2 is ever shown at layer 0. The screen at rest is calm.

### 12.7 Implementation notes (for the build)

- **Stack:** React + TypeScript (D9). Styling via CSS variables for the token sets (12.1) so
  light/dark are a single attribute swap; a utility layer (Tailwind configured to the tokens, or
  vanilla CSS modules) is fine — but do **not** ship a stock component-library theme; bespoke,
  minimal components only.
- **Fonts:** self-host or Google-Fonts `Inter` (prose/UI) and `JetBrains Mono` (all numerals,
  tickers, prices, axes). Route every number/ticker/price through the mono family — make it a shared
  `<Num>`/`.mono` primitive so nothing numeric slips into the sans by accident.
- **The graph:** 2D via a custom canvas/SVG renderer or a low-level lib (D3/visx) — not a styled
  charting library, which won't give the morphing terrain or the bespoke look. 3D terrain via Three.js
  (full control over the topographic rings, 8.2) or Plotly-surface as a faster first pass (8.6).
  Curve morphing = interpolate the payoff vector between strategies and re-draw per frame.
- **The hot loop** (per drag) is client-side (D18): recompute `{f_i}`, re-score the cached candidate
  bundle (10.3), re-rank with FLIP transitions; throttle to `requestAnimationFrame`.
- **Motion:** a small spring/tween util (e.g. Framer Motion) is acceptable *if* configured to the
  no-overshoot easings in 12.3 — disable bounce. Prefer transform/opacity for 60fps.
- **Accessibility:** honor `prefers-reduced-motion`; the belief handles and rail must be keyboard-
  operable; maintain contrast (`--text-2` on `--canvas` passes AA).
- **Don't:** add gradients, glows, emoji, shadows beyond a hairline focus ring, or any second accent
  color. When in doubt, remove it.
