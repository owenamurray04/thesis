// The recommendation rail (design doc 8.4 / 12.5). A slim translucent column
// docked right over the canvas: header, sort bar, the scrolling ranked list with
// a faded tail (D16) and FLIP re-rank (12.3), the pinned long-stock benchmark at
// the foot (D11), and a collapsed Tune panel (12.6).

import "./rail.css";
import type { ScoredRow, SortKey, Weights } from "../core/scoring";
import { Num } from "../ui/Num";
import { MicroLabel } from "../ui/MicroLabel";
import { Row } from "./Row";
import { SortBar } from "./SortBar";
import { TunePanel } from "./TunePanel";
import { useFlip } from "./useFlip";

export interface RailProps {
  ranked: ScoredRow[]; // non-benchmark, ALREADY sorted by sortKey, each has .rank
  benchmark: ScoredRow; // long stock -- pin at the foot (D11)
  selectedId: number;
  setSelectedId: (id: number) => void;
  sortKey: SortKey;
  setSortKey: (k: SortKey) => void;
  symbol: string;
  expiration: string; // ISO date
  riskAppetite: number; // -1..1
  setRiskAppetite: (a: number) => void;
  weights: Weights;
  setWeights: (w: Weights) => void;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** ISO date (2026-08-24) -> "Aug 24". Falls back to the raw string. */
function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1] ?? m[2];
  return `${month} ${Number(m[3])}`;
}

/** Faded tail (D16): opacity steps from 1.0 at the top toward ~0.35 down the
 *  list, sharpening near the top. Nothing is hidden. */
function tailOpacity(index: number): number {
  return Math.max(0.35, 1 - index * 0.07);
}

export function Rail(props: RailProps): JSX.Element {
  const {
    ranked,
    benchmark,
    selectedId,
    setSelectedId,
    sortKey,
    setSortKey,
    symbol,
    expiration,
    riskAppetite,
    setRiskAppetite,
    weights,
    setWeights,
  } = props;

  // FLIP: animate rows gliding to new positions when the order changes. The dep
  // is the current id ordering plus the sort key (design doc 12.3).
  const flipDep = ranked.map((r) => r.candidate.id).join(",") + "|" + sortKey;
  const listRef = useFlip<HTMLDivElement>(flipDep);

  return (
    <aside className="rail" aria-label="Recommended structures">
      <header className="rail-header">
        <MicroLabel className="eyebrow">Recommendations</MicroLabel>
        <div className="rail-header-line">
          <Num className="rail-symbol">{symbol}</Num>
          <Num className="rail-exp">Exp {shortDate(expiration)}</Num>
        </div>
      </header>

      <SortBar sortKey={sortKey} setSortKey={setSortKey} />

      <div className="rail-list">
        <div className="rail-list-inner" ref={listRef}>
          {ranked.map((row, i) => (
            <Row
              key={row.candidate.id}
              row={row}
              sortKey={sortKey}
              selected={row.candidate.id === selectedId}
              onSelect={() => setSelectedId(row.candidate.id)}
              symbol={symbol}
              expiration={expiration}
              opacity={tailOpacity(i)}
            />
          ))}
        </div>
      </div>

      {/* pinned benchmark -- always shown regardless of sort (D11) */}
      <div className="rail-benchmark">
        <MicroLabel className="benchmark-tag">Benchmark</MicroLabel>
        <Row
          row={benchmark}
          sortKey={sortKey}
          selected={benchmark.candidate.id === selectedId}
          onSelect={() => setSelectedId(benchmark.candidate.id)}
          symbol={symbol}
          expiration={expiration}
          benchmark
        />
      </div>

      <TunePanel
        riskAppetite={riskAppetite}
        setRiskAppetite={setRiskAppetite}
        weights={weights}
        setWeights={setWeights}
      />
    </aside>
  );
}

export default Rail;
