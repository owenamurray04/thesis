// The bottom strategy panel (design doc 8.4 / 12.5, restructured from the right
// rail into a horizontal panel docked to the bottom of the graph). A translucent
// --surface-1 bar with a hairline top border: a sort bar, a horizontally-
// scrollable track of ranked strategy CARDS with a horizontal faded tail (D16)
// and x-axis FLIP re-rank (12.3), the pinned long-stock benchmark held at the
// left (D11), and a Tune affordance (12.6).

import "./rail.css";
import "./bottomRail.css";
import type { ScoredRow, SortKey, Weights } from "../core/scoring";
import { MicroLabel } from "../ui/MicroLabel";
import { Card } from "./Card";
import { SortBar } from "./SortBar";
import { TunePanel } from "./TunePanel";
import { useFlipX } from "./useFlipX";

export interface BottomRailProps {
  ranked: ScoredRow[]; // non-benchmark, ALREADY sorted by sortKey, each has .rank
  benchmark: ScoredRow; // long stock -- pinned at the left (D11)
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

/** Horizontal faded tail (D16): cards sharpen toward the left/front and fade as
 *  they recede to the right. Opacity steps from 1.0 toward ~0.4. Nothing hidden. */
function tailOpacity(index: number): number {
  return Math.max(0.4, 1 - index * 0.06);
}

export function BottomRail(props: BottomRailProps): JSX.Element {
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

  // x-axis FLIP: animate cards gliding to new positions when the order changes.
  // The dep is the current id ordering plus the sort key (design doc 12.3).
  const flipDep = ranked.map((r) => r.candidate.id).join(",") + "|" + sortKey;
  const trackRef = useFlipX<HTMLDivElement>(flipDep);

  return (
    <section className="brail" aria-label="Recommended structures">
      <div className="brail-bar">
        <MicroLabel className="brail-eyebrow">Recommendations</MicroLabel>
        <SortBar sortKey={sortKey} setSortKey={setSortKey} />
        <div className="brail-bar-spacer" />
        <TunePanel
          riskAppetite={riskAppetite}
          setRiskAppetite={setRiskAppetite}
          weights={weights}
          setWeights={setWeights}
        />
      </div>

      <div className="brail-track-wrap">
        {/* pinned benchmark -- always shown regardless of sort, held at the left (D11) */}
        <div className="brail-benchmark">
          <MicroLabel className="benchmark-tag">Benchmark</MicroLabel>
          <Card
            row={benchmark}
            sortKey={sortKey}
            selected={benchmark.candidate.id === selectedId}
            onSelect={() => setSelectedId(benchmark.candidate.id)}
            symbol={symbol}
            expiration={expiration}
            benchmark
          />
        </div>

        <div className="brail-track" ref={trackRef}>
          {ranked.map((row, i) => (
            <Card
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
    </section>
  );
}

export default BottomRail;
