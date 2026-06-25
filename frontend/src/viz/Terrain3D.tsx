// The PRICE x TIME 3D terrain (design doc 8.2-3D / 3.3). The SAME scene as the 2D
// price x time chart, tilted into perspective:
//
//   world X = time   (timeFrac across the canvas)
//   world Z = price  (priceDomain)
//   world Y = elevation
//
// On the floor: a grid plane, the historical close line, a faint dashed "Now" line,
// and $ / month tick labels in mono. Rising off the floor: the BELIEF HUMP -- the
// green gaussian mountain peaked over the predicted (date, price), the 2D cloud as
// 3D elevation. A white ring marks its summit and a cool-blue 68/95% confidence bar
// stands at the expiration. When a strategy is selected (showPnl), the PAYOFF becomes
// TERRAIN: a green mountain where the trade profits, a red valley where it loses, with
// the belief hump floating above so you can read whether the cloud blankets the green
// high ground or slumps into the red valley.
//
// The locked D5 seam holds: this is a *rendering* of the belief, never an engine input.

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line, OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";

import type { BeliefParams, BundleMeta, HistoryBar } from "../types/contracts";
import type { ScoredRow } from "../core/scoring";
import { buildTimeline, priceDomain, timeFrac, type Timeline } from "./scene";
import {
  beliefSummit,
  buildBeliefHump,
  buildHistoryLine,
  buildPayoffTerrain,
  fracToX,
  priceToZ,
  X_SPAN,
  Z_SPAN,
  FLOOR_Y,
  BELIEF_AMP,
} from "./terrainGeometry";

// ---- color tokens (mirror src/styles/tokens.css; WebGL materials need numeric
//      colors so the hex is hardcoded here, design doc 12.1). ----
const GREEN = "#34d399"; // --g-2 (profit primary)
const GREEN_EDGE = "#065f46"; // --g-edge
const ACCENT = "#7dd3fc"; // --accent (prediction band/handle)
const GREY = "#9aa0a8"; // --text-2 (history line)
const GREY_FAINT = "#6b7079"; // --text-3 (floor grid / axes)
const WHITE = "#eceef1"; // --text-1 (summit ring)

const GREEN_RGB: [number, number, number] = [0x34 / 255, 0xd3 / 255, 0x99 / 255];
const RED_RGB: [number, number, number] = [0xf2 / 255, 0x70 / 255, 0x6f / 255];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// =====================================================================
// Floor: a subtle grid plane spanning the time x price extent, plus tick
// labels ($ on the left edge, month names along the front). Design doc 3.3.
// =====================================================================
function Floor({ tl, domain }: { tl: Timeline; domain: [number, number] }) {
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

  // $ price ticks on the left edge (z spans the price domain).
  const priceTicks = useMemo(() => {
    const [lo, hi] = domain;
    const step = niceStep((hi - lo) / 4);
    const ticks: { price: number; z: number }[] = [];
    const first = Math.ceil(lo / step) * step;
    for (let p = first; p <= hi; p += step) {
      ticks.push({ price: p, z: priceToZ(p, domain) });
    }
    return ticks;
  }, [domain]);

  // month labels along the front edge (Now/exp window).
  const timeTicks = useMemo(() => {
    const ticks: { label: string; x: number }[] = [];
    const start = new Date(tl.startMs);
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    for (let i = 0; i < 24; i++) {
      const ms = cursor.getTime();
      if (ms > tl.endMs) break;
      if (ms >= tl.startMs) {
        const isNowMonth = ms <= tl.nowMs && new Date(tl.nowMs).getMonth() === cursor.getMonth();
        const label = isNowMonth ? `Now ${MONTHS[cursor.getMonth()]}` : MONTHS[cursor.getMonth()];
        ticks.push({ label, x: fracToX(timeFrac(ms, tl)) });
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return ticks;
  }, [tl]);

  return (
    <group>
      <lineSegments geometry={gridGeom}>
        <lineBasicMaterial color={GREY_FAINT} transparent opacity={0.22} />
      </lineSegments>
      {priceTicks.map((t) => (
        <Text
          key={`p${t.price}`}
          position={[-X_SPAN - 0.5, FLOOR_Y + 0.02, t.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.32}
          color={GREY}
          anchorX="right"
          anchorY="middle"
          font={undefined}
        >
          {`$${Math.round(t.price)}`}
        </Text>
      ))}
      {timeTicks.map((t, i) => (
        <Text
          key={`t${i}`}
          position={[t.x, FLOOR_Y + 0.02, Z_SPAN + 0.5]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.3}
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

/** A "nice" tick step (1/2/5 x 10^k) near the requested magnitude. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const nice = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return nice * pow;
}

// =====================================================================
// History: the grey close line on the floor + a sphere at Now + a faint
// dashed vertical "Now" line. Design doc 3.3.
// =====================================================================
function HistoryLine({
  history,
  tl,
  domain,
}: {
  history: HistoryBar[];
  tl: Timeline;
  domain: [number, number];
}) {
  const { points, nowPoint } = useMemo(
    () => buildHistoryLine(history, tl, domain),
    [history, tl, domain],
  );

  const pts = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i < points.length; i += 3) {
      out.push([points[i], points[i + 1], points[i + 2]]);
    }
    return out;
  }, [points]);

  // faint dashed line standing at Now (full price extent).
  const nowX = fracToX(timeFrac(tl.nowMs, tl));
  const nowLine: [number, number, number][] = [
    [nowX, FLOOR_Y + 0.01, -Z_SPAN],
    [nowX, FLOOR_Y + 0.01, Z_SPAN],
  ];

  return (
    <group>
      {pts.length >= 2 && <Line points={pts} color={GREY} lineWidth={1.5} />}
      <Line points={nowLine} color={GREY_FAINT} lineWidth={1} dashed dashSize={0.18} gapSize={0.14} />
      <mesh position={nowPoint}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial color={GREY} />
      </mesh>
    </group>
  );
}

// =====================================================================
// Belief hump: the green gaussian mountain (the 2D cloud as elevation),
// peaked over the predicted (date, price). Smooth-shaded, translucent so the
// payoff terrain shows through beneath it. Design doc 3.3 / 8.2-3D.
// =====================================================================
function BeliefHump({
  belief,
  spot,
  tl,
  domain,
}: {
  belief: BeliefParams;
  spot: number;
  tl: Timeline;
  domain: [number, number];
}) {
  const geom = useMemo(() => {
    const s = buildBeliefHump(belief, spot, tl, domain);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(s.positions, 3));
    g.setIndex(new THREE.BufferAttribute(s.indices, 1));
    g.computeVertexNormals();
    return g;
  }, [belief, spot, tl, domain]);

  return (
    <mesh geometry={geom}>
      <meshStandardMaterial
        color={GREEN}
        emissive={GREEN_EDGE}
        emissiveIntensity={0.25}
        roughness={0.85}
        metalness={0}
        transparent
        opacity={0.6}
        side={THREE.DoubleSide}
        flatShading={false}
      />
    </mesh>
  );
}

// =====================================================================
// White ring handle at the hump summit. NOTE: dragging the prediction lives
// in the 2D view (BeliefHandles); here the ring is a non-interactive marker
// of the predicted (date, price). Design doc 8.2 staged reveal.
// =====================================================================
function SummitRing({
  belief,
  spot,
  tl,
  domain,
}: {
  belief: BeliefParams;
  spot: number;
  tl: Timeline;
  domain: [number, number];
}) {
  const pos = useMemo(() => beliefSummit(belief, spot, tl, domain), [belief, spot, tl, domain]);
  return (
    <mesh position={pos} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.32, 0.035, 12, 40]} />
      <meshBasicMaterial color={WHITE} />
    </mesh>
  );
}

// =====================================================================
// Confidence bar: a cool-blue vertical span at the expiration covering the
// 95% price band, a thicker portion over the 68% band, a dot at center m, and
// "Exp {Mon Day}", "95%", "68%" labels. Design doc 3.3.
// =====================================================================
function ConfidenceBar({
  belief,
  meta,
  tl,
  domain,
}: {
  belief: BeliefParams;
  meta: BundleMeta;
  tl: Timeline;
  domain: [number, number];
}) {
  const x = fracToX(timeFrac(tl.expMs, tl));
  const center = belief.m;
  const p68: [number, number] = [
    center * Math.exp(-belief.sigma_down),
    center * Math.exp(belief.sigma_up),
  ];
  const p95: [number, number] = [
    center * Math.exp(-2 * belief.sigma_down),
    center * Math.exp(2 * belief.sigma_up),
  ];

  const yTop = FLOOR_Y + BELIEF_AMP * 0.55; // float the bar in the band region
  const z95: [[number, number, number], [number, number, number]] = [
    [x, yTop, priceToZ(p95[0], domain)],
    [x, yTop, priceToZ(p95[1], domain)],
  ];
  const z68: [[number, number, number], [number, number, number]] = [
    [x, yTop, priceToZ(p68[0], domain)],
    [x, yTop, priceToZ(p68[1], domain)],
  ];
  const centerPt: [number, number, number] = [x, yTop, priceToZ(center, domain)];

  const expDate = new Date(meta.expiration + "T00:00:00");
  const expLabel = `Exp ${MONTHS[expDate.getMonth()]} ${expDate.getDate()}`;

  return (
    <group>
      <Line points={z95} color={ACCENT} lineWidth={1.5} transparent opacity={0.7} />
      <Line points={z68} color={ACCENT} lineWidth={4} />
      <mesh position={centerPt}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshBasicMaterial color={ACCENT} />
      </mesh>
      <Text
        position={[x, yTop + 0.5, priceToZ(center, domain)]}
        fontSize={0.32}
        color={ACCENT}
        anchorX="center"
        anchorY="bottom"
      >
        {expLabel}
      </Text>
      <Text
        position={[x + 0.12, yTop, priceToZ(p95[1], domain)]}
        fontSize={0.26}
        color={ACCENT}
        anchorX="left"
        anchorY="middle"
      >
        95%
      </Text>
      <Text
        position={[x + 0.12, yTop, priceToZ(p68[1], domain)]}
        fontSize={0.26}
        color={ACCENT}
        anchorX="left"
        anchorY="middle"
      >
        68%
      </Text>
    </group>
  );
}

// =====================================================================
// Payoff terrain: green profit mountain / red loss valley. Vertex-colored,
// normalized by the 90th percentile of |pnl| (design doc 8.2-3D).
// =====================================================================
function PayoffTerrain({
  grid,
  pnl,
  domain,
}: {
  grid: number[];
  pnl: Float64Array;
  domain: [number, number];
}) {
  const geom = useMemo(() => {
    const s = buildPayoffTerrain(grid, pnl, domain, GREEN_RGB, RED_RGB);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(s.positions, 3));
    if (s.colors) g.setAttribute("color", new THREE.Float32BufferAttribute(s.colors, 3));
    g.setIndex(new THREE.BufferAttribute(s.indices, 1));
    g.computeVertexNormals();
    return g;
  }, [grid, pnl, domain]);

  return (
    <mesh geometry={geom}>
      <meshStandardMaterial
        vertexColors
        roughness={0.7}
        metalness={0}
        side={THREE.DoubleSide}
        transparent
        opacity={0.95}
      />
    </mesh>
  );
}

// =====================================================================
// Scene wiring: gentle auto-rotate, ambient + one soft directional light.
// =====================================================================
function Scene({
  grid,
  belief,
  selected,
  meta,
  history,
  showPnl,
}: Terrain3DProps) {
  const group = useRef<THREE.Group>(null);

  const tl = useMemo(() => buildTimeline(meta, history), [meta, history]);
  const domain = useMemo(
    () => priceDomain(belief, meta.spot, history),
    [belief, meta.spot, history],
  );

  useFrame((_state, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.06;
  });

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[5, 9, 6]} intensity={0.45} />
      <group ref={group}>
        <Floor tl={tl} domain={domain} />
        <HistoryLine history={history} tl={tl} domain={domain} />
        {showPnl && selected.pnl.length > 0 && (
          <PayoffTerrain grid={grid} pnl={selected.pnl} domain={domain} />
        )}
        <BeliefHump belief={belief} spot={meta.spot} tl={tl} domain={domain} />
        <SummitRing belief={belief} spot={meta.spot} tl={tl} domain={domain} />
        <ConfidenceBar belief={belief} meta={meta} tl={tl} domain={domain} />
      </group>
      <OrbitControls
        enablePan={false}
        enableZoom
        enableDamping
        dampingFactor={0.1}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2 - 0.05}
      />
    </>
  );
}

// ---- the frozen contract (PredictionCanvas mounts exactly this) -------------
export interface Terrain3DProps {
  grid: number[];
  belief: BeliefParams;
  selected: ScoredRow;
  meta: BundleMeta;
  history: HistoryBar[];
  showPnl: boolean; // render the payoff mountain/valley terrain
}

export function Terrain3D(props: Terrain3DProps): JSX.Element {
  return (
    <Canvas
      style={{ width: "100%", height: "100%", background: "transparent" }}
      // tilted perspective looking down the time axis at a shallow angle
      camera={{ position: [-7.5, 5.5, 8.5], fov: 40 }}
      gl={{ alpha: true, antialias: true }}
    >
      <Scene {...props} />
    </Canvas>
  );
}

export default Terrain3D;
