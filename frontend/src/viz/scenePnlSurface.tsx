// The P&L terrain (design doc 8.2 / 8.3), shown only when stage !== "predict".
// A subdivided plane over the future region; per-vertex height = signed-normalized
// selected.pnl sampled at that price. Profit -> +Y mountain (green), loss -> -Y
// valley (red). Normalized by the 90th-percentile of |pnl| over the VISIBLE price
// window so a long call's huge tail doesn't flatten everything else.
//
// COLOR MEANS P&L: green where pnl>0 (deeper = more profit), red where pnl<0
// (deeper = more loss). Translucent so the white belief hump above still reads.
// Opacity is driven by uOpacity for the reveal cross-fade.

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import type { Timeline } from "./scene";
import { interpAtPrice } from "./scene";
import { X_SPAN, Z_SPAN, FLOOR_Y, xOfMs, priceOfZ } from "./sceneCoords";
import {
  GREEN_RGB,
  GREEN_DEEP_RGB,
  RED_RGB,
  RED_DEEP_RGB,
} from "./sceneColors";

const SEGMENTS = 72;
const AMP = 1.3; // terrain elevation at the normalization reference
const PNL_Y = FLOOR_Y + 0.02;

function percentile90Abs(grid: number[], pnl: ArrayLike<number>, domain: [number, number]): number {
  const [lo, hi] = domain;
  const vals: number[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] >= lo && grid[i] <= hi) vals.push(Math.abs(pnl[i]));
  }
  if (vals.length === 0) {
    for (let i = 0; i < pnl.length; i++) vals.push(Math.abs(pnl[i]));
  }
  vals.sort((a, b) => a - b);
  const idx = Math.min(vals.length - 1, Math.floor(0.9 * (vals.length - 1)));
  return Math.max(vals[idx], 1e-6);
}

function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function PnlSurface({
  grid,
  pnl,
  tl,
  domain,
  visible,
}: {
  grid: number[];
  pnl: ArrayLike<number>;
  tl: Timeline;
  domain: [number, number];
  visible: boolean;
}): JSX.Element {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  const geometry = useMemo(() => {
    const ref = percentile90Abs(grid, pnl, domain);
    const nowX = xOfMs(tl.nowMs, tl);
    const x0 = nowX;
    const x1 = X_SPAN;
    const z0 = -Z_SPAN;
    const z1 = Z_SPAN;
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const cols = SEGMENTS;
    const rows = SEGMENTS;
    for (let r = 0; r <= rows; r++) {
      const z = z0 + (r / rows) * (z1 - z0);
      const price = priceOfZ(z, domain);
      const v = interpAtPrice(grid, pnl, price); // dollars
      const sn = Math.max(-2, Math.min(2, v / ref)); // signed, clamped
      for (let c = 0; c <= cols; c++) {
        const x = x0 + (c / cols) * (x1 - x0);
        positions.push(x, PNL_Y + sn * AMP, z);
        // depth of color scales with magnitude (cap at the deep token).
        const mag = Math.min(1, Math.abs(sn));
        const col =
          v >= 0 ? lerp3(GREEN_RGB, GREEN_DEEP_RGB, mag) : lerp3(RED_RGB, RED_DEEP_RGB, mag);
        colors.push(col[0], col[1], col[2]);
      }
    }
    const w = cols + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = r * w + c;
        const b = a + 1;
        const d = a + w;
        const e = d + 1;
        indices.push(a, d, b, b, d, e);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [grid, pnl, tl, domain]);

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  // cross-fade opacity toward the visible target (reveal/browse vs predict).
  useFrame((_, dt) => {
    const m = matRef.current;
    if (!m) return;
    const target = visible ? 0.62 : 0;
    const k = 1 - Math.pow(0.001, dt);
    m.opacity += (target - m.opacity) * k;
  });

  return (
    <mesh geometry={geometry} renderOrder={1}>
      <primitive object={material} ref={matRef} attach="material" />
    </mesh>
  );
}
