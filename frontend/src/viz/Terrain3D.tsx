// The 3D held-to-expiration ridge (decision D26, simple version). A price×time
// floor plane; the belief as a translucent green curtain at the expiration edge;
// the terminal payoff as a thin extruded ridge along the price axis (green above
// $0 / red below, deeper = larger); one $0 iso-P&L contour on the floor. NO
// mark-to-market interior (deferred). Behind a toggle; 2D is the default view.

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { BeliefParams } from "../types/contracts";
import type { ScoredRow } from "../core/scoring";

interface Terrain3DProps {
  grid: number[];
  f: Float64Array;
  selected: ScoredRow;
  belief: BeliefParams;
}

const SPAN = 10; // world half-extent along the price axis
const DEPTH = 5; // world extent along the (decorative) time axis

/** Map price-grid index -> world x in [-SPAN, SPAN]. */
function gridToX(i: number, n: number): number {
  return (i / Math.max(1, n - 1)) * 2 * SPAN - SPAN;
}

/** Resolve a CSS token to a hex THREE color (reads the live computed value). */
function tokenColor(name: string, fallback: string): THREE.Color {
  if (typeof window === "undefined") return new THREE.Color(fallback);
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v || fallback);
}

/** The payoff ridge: vertex-colored line/strip whose height = pnl, green up/red down. */
function PayoffRidge({ grid, pnl }: { grid: number[]; pnl: Float64Array }) {
  const geom = useMemo(() => {
    const n = Math.min(grid.length, pnl.length);
    let maxAbs = 1;
    for (let i = 0; i < n; i++) maxAbs = Math.max(maxAbs, Math.abs(pnl[i]));
    const yScale = 4 / maxAbs;

    const green = tokenColor("--g-2", "#34d399");
    const red = tokenColor("--r-2", "#f2706f");

    // build a thin double-sided strip (two rows: floor edge + payoff edge)
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const z0 = DEPTH / 2; // ridge sits at the expiration edge of the floor

    for (let i = 0; i < n; i++) {
      const x = gridToX(i, n);
      const y = pnl[i] * yScale;
      // bottom vertex (on floor), top vertex (at payoff height)
      positions.push(x, 0, z0);
      positions.push(x, y, z0);
      const c = pnl[i] >= 0 ? green : red;
      // deeper color with magnitude
      const t = Math.min(1, Math.abs(pnl[i]) / maxAbs);
      const cc = c.clone().multiplyScalar(0.55 + 0.45 * t);
      colors.push(cc.r, cc.g, cc.b);
      colors.push(cc.r, cc.g, cc.b);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c2 = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, b, d, a, d, c2);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [grid, pnl]);

  return (
    <mesh geometry={geom}>
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} transparent opacity={0.92} />
    </mesh>
  );
}

/** Translucent green belief curtain hovering over the floor at the expiration edge. */
function BeliefCurtain({ grid, f }: { grid: number[]; f: Float64Array }) {
  const geom = useMemo(() => {
    const n = Math.min(grid.length, f.length);
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, f[i]);
    const inv = peak > 0 ? 1 / peak : 0;
    const hScale = 3;
    const z0 = DEPTH / 2 + 0.4; // just behind the ridge

    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = gridToX(i, n);
      const h = f[i] * inv * hScale;
      positions.push(x, 0, z0);
      positions.push(x, h, z0);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c2 = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, b, d, a, d, c2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [grid, f]);

  const color = useMemo(() => tokenColor("--g-fill", "#0f2e26"), []);

  return (
    <mesh geometry={geom}>
      <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.4} />
    </mesh>
  );
}

/** Floor plane + the $0 iso-P&L contour line (a straight line on the floor here,
 *  since the terminal ridge is the only surface). */
function Floor() {
  const lineColor = useMemo(() => tokenColor("--line-strong", "#2c333b"), []);
  const isoColor = useMemo(() => tokenColor("--text-3", "#6b7079"), []);

  const isoGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-SPAN, 0.001, DEPTH / 2, SPAN, 0.001, DEPTH / 2], 3),
    );
    return g;
  }, []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[2 * SPAN, DEPTH]} />
        <meshBasicMaterial color={tokenColor("--surface-1", "#0c0e11")} transparent opacity={0.55} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.PlaneGeometry(2 * SPAN, DEPTH)]} />
        <lineBasicMaterial color={lineColor} transparent opacity={0.4} />
      </lineSegments>
      {/* $0 iso-P&L contour */}
      <line>
        <primitive object={isoGeom} attach="geometry" />
        <lineBasicMaterial color={isoColor} />
      </line>
    </group>
  );
}

/** Gentle auto-rotate; OrbitControls lets the user take over. */
function Scene({ grid, f, selected }: { grid: number[]; f: Float64Array; selected: ScoredRow }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_state, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.12;
  });
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 10, 8]} intensity={0.5} />
      <group ref={group}>
        <Floor />
        <BeliefCurtain grid={grid} f={f} />
        {selected.pnl.length > 0 && <PayoffRidge grid={grid} pnl={selected.pnl} />}
      </group>
      <OrbitControls enablePan={false} enableZoom enableDamping dampingFactor={0.1} />
    </>
  );
}

export function Terrain3D({ grid, f, selected }: Terrain3DProps) {
  return (
    <Canvas
      style={{ width: "100%", height: "100%", background: "transparent" }}
      camera={{ position: [0, 6, 16], fov: 42 }}
      gl={{ alpha: true, antialias: true }}
    >
      <Scene grid={grid} f={f} selected={selected} />
    </Canvas>
  );
}

export default Terrain3D;
