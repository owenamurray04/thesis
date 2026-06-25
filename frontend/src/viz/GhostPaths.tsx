// Ghost sample paths (design doc 8.5): a restrained, decorative fan of faint
// Brownian-bridge curves that drift from spot (left, "now") toward belief-sampled
// terminal prices near the cloud center, shimmering on a slow loop. In this 2D
// price-on-x view "time" is not an axis, so the ghosts read as a subtle horizontal
// fan converging onto the cloud rather than a literal time series. Purely visual.
// prefers-reduced-motion -> one static path, no animation.

import { useEffect, useMemo, useRef, useState } from "react";
import { line as d3line, curveBasis } from "d3-shape";
import type { BeliefParams } from "../types/contracts";
import type { BundleMeta } from "../types/contracts";
import type { Geometry } from "./scales";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

interface GhostPathsProps {
  belief: BeliefParams;
  meta: BundleMeta;
  geom: Geometry;
}

const N_PATHS = 4;
const N_STEPS = 28;
const LOOP_MS = 5000;

/** A tiny deterministic PRNG so a re-sample is stable within a frame. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sample a terminal price from the two-piece belief by inverse-ish jitter around m. */
function sampleTerminal(b: BeliefParams, u: number, g: () => number): number {
  // gaussian-ish via two uniforms; pick side by u
  const z = Math.sqrt(-2 * Math.log(g() + 1e-9)) * Math.cos(2 * Math.PI * g());
  const sigma = u < 0.5 ? b.sigma_down : b.sigma_up;
  const sign = u < 0.5 ? -1 : 1;
  return b.m * Math.exp(sign * Math.abs(z) * sigma);
}

function buildPath(
  startPrice: number,
  endPrice: number,
  geom: Geometry,
  g: () => number,
): string {
  const ln = d3line<[number, number]>()
    .x((d) => d[0])
    .y((d) => d[1])
    .curve(curveBasis);
  const pts: [number, number][] = [];
  const yBand = geom.innerTop + geom.innerHeight * 0.18;
  for (let s = 0; s <= N_STEPS; s++) {
    const t = s / N_STEPS;
    // brownian bridge in price space: interpolate, add midpoint-tapered jitter
    const base = startPrice + (endPrice - startPrice) * t;
    const taper = Math.sin(Math.PI * t); // 0 at ends, 1 at middle
    const jitter = (g() - 0.5) * (endPrice - startPrice || 1) * 0.12 * taper;
    const sp = base + jitter;
    const x = geom.x(sp);
    // gentle vertical undulation so paths don't overlap as a flat line
    const y = yBand + Math.sin(t * Math.PI * 1.5 + g() * 0.01) * 6 + (g() - 0.5) * 4;
    pts.push([x, y]);
  }
  return ln(pts) ?? "";
}

export function GhostPaths({ belief, meta, geom }: GhostPathsProps) {
  const reduced = usePrefersReducedMotion();
  const [tick, setTick] = useState(0);
  const rafRef = useRef<number | null>(null);

  // animate a slow shimmer loop unless reduced motion
  useEffect(() => {
    if (reduced) return;
    let start = performance.now();
    const step = (now: number) => {
      if (now - start >= LOOP_MS) {
        start = now;
        setTick((k) => k + 1); // re-sample
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [reduced]);

  const paths = useMemo(() => {
    // re-seed on belief change + each loop so the fan shifts with the cloud
    const seedBase =
      Math.floor(belief.m * 7 + belief.sigma_up * 1000 + belief.sigma_down * 1300) +
      (reduced ? 0 : tick * 101);
    const out: string[] = [];
    const count = reduced ? 1 : N_PATHS;
    for (let p = 0; p < count; p++) {
      const g = mulberry32(seedBase + p * 9173);
      const u = (p + 0.5) / count;
      const end = reduced ? belief.m : sampleTerminal(belief, u, g);
      out.push(buildPath(meta.spot, end, geom, g));
    }
    return out;
  }, [belief, meta.spot, geom, tick, reduced]);

  return (
    <g className="viz-ghost-paths" aria-hidden style={{ pointerEvents: "none" }}>
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="var(--g-2)"
          strokeOpacity={reduced ? 0.1 : 0.1 + (i % 3) * 0.03}
          strokeWidth={1}
          style={
            reduced
              ? undefined
              : { transition: "stroke-opacity var(--dur-state) var(--ease-settle)" }
          }
        />
      ))}
    </g>
  );
}

export default GhostPaths;
