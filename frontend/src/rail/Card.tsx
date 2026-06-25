// One strategy CARD in the bottom panel (design doc 8.4 / 12.5, restructured from
// the right-rail Row into a horizontal-panel card). Name + plain-english summary
// in Inter, the active sort's headline metric as a prominent mono number, a
// secondary mono stat line, a payoff sparkline (the only colored element), and a
// muted neutral capital-tier badge. Color means P&L only -- the rest is greyscale
// + the single accent.

import type { ScoredRow, SortKey } from "../core/scoring";
import type { CapitalTier } from "../types/contracts";
import { Num } from "../ui/Num";
import { Sparkline } from "./Sparkline";
import { plainEnglish } from "../lib/summary";
import { usd, signedUsd, price, pct } from "../lib/format";

export interface CardProps {
  row: ScoredRow;
  sortKey: SortKey;
  selected: boolean;
  onSelect: () => void;
  symbol: string;
  expiration: string;
  opacity?: number; // horizontal faded tail (D16): recede to the right
  benchmark?: boolean;
}

const TIER_LABEL: Record<CapitalTier, string> = {
  low: "LOW",
  medium: "MED",
  high: "HIGH",
};

const HEADLINE_CAP: Record<SortKey, string> = {
  capital: "capital",
  prob: "prob",
  return: "return",
  risk: "rwd:risk",
  edge: "edge",
};

/** The active sort's headline metric (design doc 8.4). Mono. */
function headline(row: ScoredRow, key: SortKey): string {
  const c = row.candidate;
  switch (key) {
    case "capital":
      return usd(c.capital);
    case "prob":
      return pct(row.popF); // whole %
    case "return":
      return pct(row.roi, { sign: true }); // ROI, can be large
    case "risk": {
      const r2r =
        c.max_loss !== 0 ? c.max_gain / Math.abs(c.max_loss) : Infinity;
      return isFinite(r2r) ? `${r2r.toFixed(1)}×` : "∞";
    }
    case "edge":
      return row.score.toFixed(2); // engine belief-fit score
  }
}

export function Card({
  row,
  sortKey,
  selected,
  onSelect,
  symbol,
  expiration,
  opacity = 1,
  benchmark = false,
}: CardProps): JSX.Element {
  const c = row.candidate;
  const summary = plainEnglish(c, symbol, expiration);
  const bes =
    c.breakevens.length > 0 ? c.breakevens.map(price).join(" / ") : "—";

  return (
    <button
      type="button"
      className={
        "scard" +
        (selected ? " is-selected" : "") +
        (benchmark ? " is-benchmark" : "")
      }
      style={{ opacity }}
      onClick={onSelect}
      aria-pressed={selected}
      data-flip-key={benchmark ? undefined : String(c.id)}
    >
      <div className="scard-head">
        <span className="scard-name">{c.name}</span>
        <span className="tier-badge">{TIER_LABEL[c.capital_tier]}</span>
      </div>

      <span className="scard-summary">{summary}</span>

      <div className="scard-headline">
        <span className="row-headline-cap">{HEADLINE_CAP[sortKey]}</span>
        <Num className="row-headline">{headline(row, sortKey)}</Num>
      </div>

      <div className="scard-foot">
        <div className="scard-stats">
          <span>
            <span className="row-stat-label">risk</span>
            <Num>{signedUsd(c.max_loss)}</Num>
          </span>
          <span>
            <span className="row-stat-label">max</span>
            <Num>{signedUsd(c.max_gain)}</Num>
          </span>
          <span>
            <span className="row-stat-label">be</span>
            <Num>{bes}</Num>
          </span>
        </div>
        <Sparkline pnl={row.pnl} />
      </div>
    </button>
  );
}

export default Card;
