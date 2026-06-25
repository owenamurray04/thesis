// Interactive belief handles (design doc 3.3): a center ring at x = m, and two
// band handles at m·exp(±sigma). Dragging the center sets m; dragging a band sets
// the corresponding sigma via sigmaFromBandPrice(m, draggedPrice). A 95% mark is
// drawn at ±2σ for reference (read-only). Drag is rAF-throttled by the parent;
// here we just translate the live pointer x into a new BeliefParams.

import { useCallback, useRef } from "react";
import { sigmaFromBandPrice } from "../core/belief";
import type { BeliefParams } from "../types/contracts";
import type { Geometry } from "./scales";

type HandleKind = "center" | "up" | "down";

interface BeliefHandlesProps {
  belief: BeliefParams;
  geom: Geometry;
  /** rAF-throttled commit from the parent (1:1 cursor tracking, design doc 12.3). */
  onDrag: (next: BeliefParams) => void;
}

export function BeliefHandles({ belief, geom, onDrag }: BeliefHandlesProps) {
  const dragging = useRef<HandleKind | null>(null);

  const upPrice = belief.m * Math.exp(belief.sigma_up);
  const downPrice = belief.m * Math.exp(-belief.sigma_down);
  const up95 = belief.m * Math.exp(2 * belief.sigma_up);
  const down95 = belief.m * Math.exp(-2 * belief.sigma_down);

  const xCenter = geom.x(belief.m);
  const xUp = geom.x(upPrice);
  const xDown = geom.x(downPrice);
  const xUp95 = geom.x(up95);
  const xDown95 = geom.x(down95);

  // a comfortable vertical band the handles live in
  const yTop = geom.innerTop + 6;
  const yBot = geom.cloudBaseY - 4;
  const yMid = (yTop + yBot) / 2;

  const commit = useCallback(
    (kind: HandleKind, clientPrice: number) => {
      const p = Math.max(1e-6, clientPrice);
      if (kind === "center") {
        // horizontal drag -> new m. Vertical drag is a no-op in Slice 1: there is
        // a single expiration, so t_days / belief height carry no extra dof yet.
        onDrag({ ...belief, m: p });
      } else if (kind === "up") {
        if (p <= belief.m) return; // upper band stays above the center
        onDrag({ ...belief, sigma_up: sigmaFromBandPrice(belief.m, p) });
      } else {
        if (p >= belief.m) return; // lower band stays below the center
        onDrag({ ...belief, sigma_down: sigmaFromBandPrice(belief.m, p) });
      }
    },
    [belief, onDrag],
  );

  const onPointerDown = useCallback(
    (kind: HandleKind) => (e: React.PointerEvent<SVGGElement>) => {
      e.preventDefault();
      (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
      dragging.current = kind;
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      if (!dragging.current) return;
      const svg = (e.currentTarget.ownerSVGElement ?? null) as SVGSVGElement | null;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      // viewBox is 1:1 with px (preserveAspectRatio none in the canvas), so the
      // client x maps linearly into viewBox x.
      const vx = ((e.clientX - rect.left) / rect.width) * geom.width;
      commit(dragging.current, geom.x.invert(vx));
    },
    [commit, geom],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<SVGGElement>) => {
    dragging.current = null;
    try {
      (e.currentTarget as SVGGElement).releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be released */
    }
  }, []);

  const HIT = 16; // generous transparent hit width

  return (
    <g className="viz-belief-handles">
      {/* 95% reference ticks (read-only, ±2σ) */}
      {[xUp95, xDown95].map((bx, i) => (
        <g key={`r95-${i}`} aria-hidden>
          <line x1={bx} x2={bx} y1={yMid - 5} y2={yMid + 5} stroke="var(--line-strong)" strokeWidth={1} />
          <text
            x={bx}
            y={yMid - 9}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize={7.5}
            letterSpacing="0.12em"
            fill="var(--text-faint)"
          >
            95%
          </text>
        </g>
      ))}

      {/* band span hairline between the two 68% handles */}
      <line x1={xDown} x2={xUp} y1={yMid} y2={yMid} stroke="var(--line)" strokeWidth={1} />

      {/* upper / lower 68% band handles */}
      {(
        [
          { kind: "up" as const, bx: xUp },
          { kind: "down" as const, bx: xDown },
        ]
      ).map(({ kind, bx }) => (
        <g
          key={kind}
          style={{ cursor: dragging.current === kind ? "grabbing" : "grab" }}
          onPointerDown={onPointerDown(kind)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <rect x={bx - HIT / 2} y={yTop} width={HIT} height={yBot - yTop} fill="transparent" />
          <line
            x1={bx}
            x2={bx}
            y1={yMid - 8}
            y2={yMid + 8}
            stroke={dragging.current === kind ? "var(--accent)" : "var(--text-2)"}
            strokeWidth={1.5}
          />
          <text
            x={bx}
            y={yMid + 20}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize={8}
            letterSpacing="0.14em"
            fill={dragging.current === kind ? "var(--accent)" : "var(--text-3)"}
          >
            68%
          </text>
        </g>
      ))}

      {/* center ring -- drag horizontally to move m */}
      <g
        style={{ cursor: dragging.current === "center" ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown("center")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <rect x={xCenter - HIT / 2} y={yTop} width={HIT} height={yBot - yTop} fill="transparent" />
        <circle
          cx={xCenter}
          cy={yMid}
          r={6}
          fill="none"
          stroke={dragging.current === "center" ? "var(--accent)" : "var(--text-1)"}
          strokeWidth={1.5}
        />
        <circle cx={xCenter} cy={yMid} r={1.5} fill={dragging.current === "center" ? "var(--accent)" : "var(--text-1)"} />
      </g>
    </g>
  );
}

export default BeliefHandles;
