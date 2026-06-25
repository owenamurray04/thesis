// "Now" marker (design doc 12.4): a subtle dashed vertical line at the present,
// separating the historical line (left) from the belief/P&L future (right).

import { timeFrac, type Timeline } from "./scene";

interface NowMarkerProps {
  tl: Timeline;
  width: number;
  height: number;
}

export function NowMarker(props: NowMarkerProps): JSX.Element {
  const { tl, width, height } = props;
  const x = timeFrac(tl.nowMs, tl) * width;
  return (
    <line
      className="viz-now"
      x1={x}
      x2={x}
      y1={0}
      y2={height}
      stroke="var(--line-strong)"
      strokeWidth={1}
      strokeDasharray="3 4"
      aria-hidden
    />
  );
}

export default NowMarker;
