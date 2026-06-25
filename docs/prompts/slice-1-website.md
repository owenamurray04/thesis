Read `MVP Design Doc.md` §8 (user journey and the signature visualization), §12 (the frontend design specification), §6.6 (the client-side hot loop), and §3 (the belief model), then `frontend/src/types/contracts.ts` (the wire types) and `frontend/src/mock/bundle.json` (a real, correctly-priced `ScoringBundle` to build against). The backend is not needed for this slice.

Build **Slice 1 — the website**, a Vite + React + TypeScript app in `frontend/`, running the full live loop against the mock bundle so it is viewable immediately. Wire the data source behind a single module (e.g. `loadBundle(): Promise<ScoringBundle>`) that returns the mock now and will be swapped for the real API later — the UI must not know which.

Implement the core loop (D18, §6.6), entirely client-side with no network in the drag loop:

- Belief sculpting: a draggable center (price × date) and upper/lower band handles that set `sigma_up` / `sigma_down`, mapping to `(m, sigma_down, sigma_up, T)` per §3.3. Seed the default cloud at the market (§3.4).
- Evaluate the two-piece lognormal density `{f_i}` on the bundle's `grid` in TypeScript (port the formula from `backend/src/ose/mathx/belief.py`; normalize so `sum(f_i·dS_i)=1`).
- For each candidate, reconstruct its payoff from the leg vectors and score it under the belief. The bundle's convention: leg `payoff_vector` is per share; candidate `net_cost`, `capital`, `max_loss`, `max_gain` are already in dollars (×100 applied). So dollar PnL on the grid is `100 · Σ(side·qty·payoff_vector) − net_cost`, then `EV = Σ PnL·f_i·dS_i`, `PoP_f = Σ_{PnL>0} f_i·dS_i`, `ROI = EV/capital` (§9.7). Rank by merit (§6.4) × `exec_quality`, re-ranking on every drag.

Build the signature 2D visualization (§8.2): the belief cloud with the selected candidate's PnL curve overlaid, green above the zero line and red below, the cloud tinted by the payoff sign beneath it, and markers for breakevens, spot, and the belief center. Use a low-level renderer (D3/visx or a custom canvas/SVG) so the curve can morph — not a styled charting library.

Build the ranked rail (§8.4): a sort bar (capital, PoP, return, risk, edge), a scrollable list whose lower rows fade (D16), each row showing the structure name, a one-line plain-English summary, the active sort's headline metric in monospace, max loss/gain, and breakevens. Pin long stock as a benchmark regardless of sort (D11).

Apply the §12 visual language exactly: dark default theme via CSS variables, Inter for prose and **JetBrains Mono for every number, ticker, and price**, and the staged states (landing → predict → reveal → browse). Obey the anti-brief — no gradients, glows, emoji, drop shadows, rounded-card soup, second accent color, or stock component-library theme. Color means P&L only.

The client now owns a second copy of the scoring math (TypeScript); it must match the Python core. Note this as open decision **D25** and structure the density and scoring functions as small pure modules so a parity test can compare them to Python on a shared vector later.

Produce a plan first — your component structure, the data-source seam, the belief-density and scoring modules, the renderer choice, and how you'll hit the §12 look — and wait for approval before writing code.

Acceptance: with `npm run dev`, dragging the belief cloud re-ranks the list and re-draws the payoff overlay smoothly with zero network requests in the drag loop (verify in devtools); `npm run typecheck` is clean; the rendered numbers match the mock bundle.
