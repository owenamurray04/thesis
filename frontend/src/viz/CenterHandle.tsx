// Center handle (design doc 3.3 / 12.3): a hollow white ring at the cloud's center
// (price = m), co-located with the expiration column. Dragging it UP/DOWN sets the
// predicted price m -- the band and the cloud follow. Horizontal drag is a documented
// NO-OP in Slice 1 (single expiration; the date is fixed). Pointer capture, generous
// hit area, grab/grabbing cursor, 1:1 tracking (the parent rAF-throttles the commit).

import { useCallback, useRef } from "react";
import type { BeliefParams } from "../types/contracts";
import { timeFrac, type Timeline } from "./scene";

interface CenterHandleProps {
  belief: BeliefParams;
  tl: Timeline;
  width: number;
  yOfPrice: (price: number) => number;
  priceOfY: (y: number) => number;
  /** rAF-throttled commit of a new center price m (vertical drag only). */
  onCenterDrag: (m: number) => void;
}

const HIT = 22;

export function CenterHandle(props: CenterHandleProps): JSX.Element {
  const { belief, tl, width, yOfPrice, priceOfY, onCenterDrag } = props;
  const dragging = useRef(false);

  // sit at the expiration column (cloud peak), price = m
  const x = timeFrac(tl.expMs, tl) * width;
  const y = yOfPrice(belief.m);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGGElement>) => {
    e.preventDefault();
    (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
    dragging.current = true;
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      if (!dragging.current) return;
      const svg = (e.currentTarget.ownerSVGElement ?? null) as SVGSVGElement | null;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const vy = ((e.clientY - rect.top) / rect.height) * (svg.viewBox.baseVal.height || rect.height);
      // vertical drag -> m. Horizontal drag intentionally ignored in Slice 1.
      onCenterDrag(priceOfY(vy));
    },
    [onCenterDrag, priceOfY],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<SVGGElement>) => {
    dragging.current = false;
    try {
      (e.currentTarget as SVGGElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  return (
    <g
      className="viz-center-handle"
      style={{ cursor: dragging.current ? "grabbing" : "grab" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <circle cx={x} cy={y} r={HIT / 2} fill="transparent" />
      <circle cx={x} cy={y} r={9} fill="none" stroke="var(--text-1)" strokeWidth={1.75} />
    </g>
  );
}

export default CenterHandle;
