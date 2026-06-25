// Expiration confidence band (design doc 3.3): a vertical marker at the chosen
// expiration drawn in the accent. A thick segment spans the 68% interval, thin
// whiskers reach out to the 95% interval with end caps, a filled dot sits at the
// center (= m), and "95%" / "68%" / "Exp {Mon Day}" labels sit in the accent.
//
// The 68% endpoints are DRAGGABLE: dragging the top sets sigma_up, the bottom sets
// sigma_down (via sigmaFromBandPrice in the parent). Generous transparent hit areas,
// ns-resize cursor. Vertical price <-> y comes from the parent's scale.

import { useCallback, useRef } from "react";
import type { BeliefParams } from "../types/contracts";
import { beliefBand, timeFrac, type Timeline } from "./scene";

type BandEdge = "up" | "down";

interface ExpirationBandProps {
  belief: BeliefParams;
  expirationLabel: string; // "Mon Day", e.g. "Aug 21"
  tl: Timeline;
  width: number;
  yOfPrice: (price: number) => number;
  priceOfY: (y: number) => number;
  /** Commit a dragged band edge -> new price for that 68% endpoint. */
  onBandDrag: (edge: BandEdge, price: number) => void;
}

const HIT = 18;

export function ExpirationBand(props: ExpirationBandProps): JSX.Element {
  const { belief, expirationLabel, tl, width, yOfPrice, priceOfY, onBandDrag } = props;
  const dragging = useRef<BandEdge | null>(null);

  const band = beliefBand(belief);
  const x = timeFrac(tl.expMs, tl) * width;

  const yCenter = yOfPrice(band.center);
  const y68lo = yOfPrice(band.p68[0]);
  const y68hi = yOfPrice(band.p68[1]);
  const y95lo = yOfPrice(band.p95[0]);
  const y95hi = yOfPrice(band.p95[1]);

  const onPointerDown = useCallback(
    (edge: BandEdge) => (e: React.PointerEvent<SVGGElement>) => {
      e.preventDefault();
      (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
      dragging.current = edge;
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      if (!dragging.current) return;
      const svg = (e.currentTarget.ownerSVGElement ?? null) as SVGSVGElement | null;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const vy = ((e.clientY - rect.top) / rect.height) * (svg.viewBox.baseVal.height || rect.height);
      onBandDrag(dragging.current, priceOfY(vy));
    },
    [onBandDrag, priceOfY],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<SVGGElement>) => {
    dragging.current = null;
    try {
      (e.currentTarget as SVGGElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  return (
    <g className="viz-exp-band">
      {/* faint full-height expiration line */}
      <line x1={x} x2={x} y1={0} y2={yOfPrice(0)} stroke="var(--accent)" strokeWidth={1} opacity={0.18} />

      {/* 95% whiskers with end caps */}
      <line x1={x} x2={x} y1={y95hi} y2={y68hi} stroke="var(--accent)" strokeWidth={1} opacity={0.55} />
      <line x1={x} x2={x} y1={y68lo} y2={y95lo} stroke="var(--accent)" strokeWidth={1} opacity={0.55} />
      <line x1={x - 4} x2={x + 4} y1={y95hi} y2={y95hi} stroke="var(--accent)" strokeWidth={1} />
      <line x1={x - 4} x2={x + 4} y1={y95lo} y2={y95lo} stroke="var(--accent)" strokeWidth={1} />

      {/* thick 68% segment */}
      <line x1={x} x2={x} y1={y68hi} y2={y68lo} stroke="var(--accent)" strokeWidth={4} strokeLinecap="round" />

      {/* center dot (= m) */}
      <circle cx={x} cy={yCenter} r={2.5} fill="var(--accent)" />

      {/* labels */}
      <text x={x + 8} y={y95hi + 3} fontFamily="var(--font-mono)" fontSize={8} fill="var(--accent)" opacity={0.8}>
        95%
      </text>
      <text x={x + 8} y={y68hi + 3} fontFamily="var(--font-mono)" fontSize={8} fill="var(--accent)">
        68%
      </text>
      <text x={x} y={Math.max(10, y95hi - 8)} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fill="var(--accent)">
        Exp {expirationLabel}
      </text>

      {/* draggable 68% endpoints */}
      {(
        [
          { edge: "up" as const, ey: y68hi },
          { edge: "down" as const, ey: y68lo },
        ]
      ).map(({ edge, ey }) => (
        <g
          key={edge}
          style={{ cursor: dragging.current === edge ? "grabbing" : "ns-resize" }}
          onPointerDown={onPointerDown(edge)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <rect x={x - HIT / 2} y={ey - HIT / 2} width={HIT} height={HIT} fill="transparent" />
          <line x1={x - 6} x2={x + 6} y1={ey} y2={ey} stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}

export default ExpirationBand;
