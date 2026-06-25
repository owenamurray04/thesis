// Historical price line (design doc 12.4): a solid grey polyline of history closes
// rising into "Now", capped with a filled dot at the last (present) point. Each bar
// maps date -> x via the timeline, close -> y via the price scale.

import { useMemo } from "react";
import type { HistoryBar } from "../types/contracts";
import { timeFrac, type Timeline } from "./scene";

interface HistoryLineProps {
  history: HistoryBar[];
  tl: Timeline;
  width: number;
  yOfPrice: (price: number) => number;
}

export function HistoryLine(props: HistoryLineProps): JSX.Element | null {
  const { history, tl, width, yOfPrice } = props;

  const pts = useMemo(() => {
    return history.map((bar) => {
      const ms = new Date(bar.d + "T00:00:00").getTime();
      return { x: timeFrac(ms, tl) * width, y: yOfPrice(bar.close) };
    });
  }, [history, tl, width, yOfPrice]);

  if (pts.length === 0) return null;

  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const last = pts[pts.length - 1];

  return (
    <g className="viz-history" aria-hidden>
      <path d={d} fill="none" stroke="var(--text-2)" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={3.5} fill="var(--text-1)" />
    </g>
  );
}

export default HistoryLine;
