// Bottom price axis + the $0 PnL baseline (design doc 8.2). Restraint: ~6 mono
// price ticks and one faint hairline zero line labeled `$0`. No gridlines, no
// second axis -- the belief cloud carries the vertical density read.

import { priceTicks } from "./scales";
import type { Geometry } from "./scales";
import { price } from "../lib/format";

interface AxesProps {
  geom: Geometry;
}

export function Axes({ geom }: AxesProps) {
  const ticks = priceTicks(geom.x, 6);

  return (
    <g className="viz-axes" aria-hidden>
      {/* $0 PnL baseline */}
      <line
        x1={geom.innerLeft}
        x2={geom.innerRight}
        y1={geom.zeroY}
        y2={geom.zeroY}
        stroke="var(--line-strong)"
        strokeWidth={1}
      />
      <text
        x={geom.innerLeft}
        y={geom.zeroY - 4}
        textAnchor="start"
        fontFamily="var(--font-mono)"
        fontSize={9}
        fill="var(--text-3)"
      >
        $0
      </text>

      {/* bottom price ticks */}
      {ticks.map((t) => {
        const x = geom.x(t);
        return (
          <g key={t}>
            <line
              x1={x}
              x2={x}
              y1={geom.innerBottom}
              y2={geom.innerBottom + 4}
              stroke="var(--line)"
              strokeWidth={1}
            />
            <text
              x={x}
              y={geom.innerBottom + 16}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize={9}
              fill="var(--text-3)"
            >
              {price(t)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export default Axes;
