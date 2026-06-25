// Floor, grid, axis ticks, and the "Now" line for the single scene
// (design doc 3.3 / 8.2). Neutral grey only -- color is reserved for P&L.

import { useMemo } from "react";
import { Line, Text } from "@react-three/drei";
import * as THREE from "three";

import type { Timeline } from "./scene";
import { X_SPAN, Z_SPAN, FLOOR_Y, xOfMs, zOfPrice } from "./sceneCoords";
import { GREY, GREY_FAINT } from "./sceneColors";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** A "nice" tick step (1/2/5 x 10^k) near the requested magnitude. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const nice = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return nice * pow;
}

export function SceneFloor({
  tl,
  domain,
}: {
  tl: Timeline;
  domain: [number, number];
}): JSX.Element {
  // subtle grid plane spanning the full time x price extent.
  const gridGeom = useMemo(() => {
    const lines: number[] = [];
    const COLS = 8;
    const ROWS = 8;
    for (let c = 0; c <= COLS; c++) {
      const x = -X_SPAN + (c / COLS) * 2 * X_SPAN;
      lines.push(x, FLOOR_Y, -Z_SPAN, x, FLOOR_Y, Z_SPAN);
    }
    for (let r = 0; r <= ROWS; r++) {
      const z = -Z_SPAN + (r / ROWS) * 2 * Z_SPAN;
      lines.push(-X_SPAN, FLOOR_Y, z, X_SPAN, FLOOR_Y, z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    return g;
  }, []);

  // $ ticks along the left edge (z spans the price domain).
  const priceTicks = useMemo(() => {
    const [lo, hi] = domain;
    const step = niceStep((hi - lo) / 4);
    const ticks: { price: number; z: number }[] = [];
    const first = Math.ceil(lo / step) * step;
    for (let p = first; p <= hi; p += step) {
      ticks.push({ price: p, z: zOfPrice(p, domain) });
    }
    return ticks;
  }, [domain]);

  // month labels along the front edge.
  const timeTicks = useMemo(() => {
    const ticks: { label: string; x: number }[] = [];
    const start = new Date(tl.startMs);
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    for (let i = 0; i < 24; i++) {
      const ms = cursor.getTime();
      if (ms > tl.endMs) break;
      if (ms >= tl.startMs) {
        ticks.push({ label: MONTHS[cursor.getMonth()], x: xOfMs(ms, tl) });
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return ticks;
  }, [tl]);

  // the dashed "Now" line + its label.
  const nowX = xOfMs(tl.nowMs, tl);
  const nowLine: [number, number, number][] = [
    [nowX, FLOOR_Y + 0.01, Z_SPAN],
    [nowX, FLOOR_Y + 0.01, -Z_SPAN],
  ];

  return (
    <group>
      <lineSegments geometry={gridGeom}>
        <lineBasicMaterial color={GREY_FAINT} transparent opacity={0.18} />
      </lineSegments>

      <Line points={nowLine} color={GREY} lineWidth={1} dashed dashSize={0.16} gapSize={0.12} transparent opacity={0.5} />
      <Text
        position={[nowX, FLOOR_Y + 0.02, Z_SPAN + 0.55]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.3}
        color={GREY}
        anchorX="center"
        anchorY="middle"
      >
        Now
      </Text>

      {priceTicks.map((t) => (
        <Text
          key={`p${t.price}`}
          position={[-X_SPAN - 0.5, FLOOR_Y + 0.02, t.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.3}
          color={GREY}
          anchorX="right"
          anchorY="middle"
        >
          {`$${Math.round(t.price)}`}
        </Text>
      ))}

      {timeTicks.map((t, i) => (
        <Text
          key={`t${i}`}
          position={[t.x, FLOOR_Y + 0.02, Z_SPAN + 0.55]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.28}
          color={GREY}
          anchorX="center"
          anchorY="middle"
        >
          {t.label}
        </Text>
      ))}
    </group>
  );
}
