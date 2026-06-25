// The belief fog/hump (design doc 8.2 / 8.3). A subdivided plane over the FUTURE
// region (Now -> right edge). Per vertex we sample belief2DDensity, normalize by
// the field max, and feed it to a custom ShaderMaterial that:
//
//   - VERTEX: raises position.y by density * AMP  ->  from the side it's a soft hump.
//   - FRAGMENT: outputs cool white-grey with alpha = a smoothstep falloff of density
//               ->  from straight down it reads as a translucent FOG blob, not a sheet.
//
// depthWrite is off + NormalBlending so the fog layers over floor/terrain without a
// hard silhouette. The density attribute is rebuilt whenever the belief changes
// (cheap, NO network -- the locked D5 seam keeps the engine out of this).

import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { BeliefParams } from "../types/contracts";
import type { Timeline } from "./scene";
import { belief2DDensity } from "./scene";
import { X_SPAN, Z_SPAN, FLOOR_Y, xOfMs, priceOfZ, msOfX } from "./sceneCoords";
import { FOG_RGB } from "./sceneColors";

const SEGMENTS = 72; // plane subdivision (~72x72 per the brief)
const AMP = 1.6; // hump elevation at the field max
const SURFACE_Y = FLOOR_Y + 0.04; // sit just above the floor so fog doesn't z-fight

const vertexShader = /* glsl */ `
  attribute float density;
  varying float vDensity;
  void main() {
    vDensity = density;
    vec3 p = position;
    p.y += density * ${AMP.toFixed(3)};
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vDensity;
  void main() {
    // soft falloff: faint at the cloud's edge, denser at the core, never fully opaque.
    float a = smoothstep(0.04, 0.65, vDensity) * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }
`;

export function BeliefSurface({
  belief,
  tl,
  domain,
}: {
  belief: BeliefParams;
  tl: Timeline;
  domain: [number, number];
}): JSX.Element {
  // base geometry: a flat grid over the FUTURE region (Now -> right edge) x full price.
  const geometry = useMemo(() => {
    const nowX = xOfMs(tl.nowMs, tl);
    const x0 = nowX;
    const x1 = X_SPAN;
    const z0 = -Z_SPAN;
    const z1 = Z_SPAN;
    const positions: number[] = [];
    const densAttr: number[] = [];
    const indices: number[] = [];
    const cols = SEGMENTS;
    const rows = SEGMENTS;
    for (let r = 0; r <= rows; r++) {
      const z = z0 + (r / rows) * (z1 - z0);
      for (let c = 0; c <= cols; c++) {
        const x = x0 + (c / cols) * (x1 - x0);
        positions.push(x, SURFACE_Y, z);
        densAttr.push(0);
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
    g.setAttribute("density", new THREE.Float32BufferAttribute(densAttr, 1));
    g.setIndex(indices);
    return g;
  }, [tl]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uColor: { value: new THREE.Color(FOG_RGB[0], FOG_RGB[1], FOG_RGB[2]) },
          uOpacity: { value: 0.92 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
      }),
    [],
  );

  const meshRef = useRef<THREE.Mesh>(null);

  // (re)fill the density attribute whenever the belief (or geometry) changes.
  useMemo(() => {
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const dens = geometry.getAttribute("density") as THREE.BufferAttribute;
    const n = pos.count;
    let max = 1e-12;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const price = priceOfZ(z, domain);
      const ms = msOfX(x, tl);
      const v = belief2DDensity(belief, price, ms, tl);
      raw[i] = v;
      if (v > max) max = v;
    }
    for (let i = 0; i < n; i++) dens.setX(i, raw[i] / max);
    dens.needsUpdate = true;
    geometry.computeVertexNormals?.();
    return null;
  }, [geometry, belief, domain, tl]);

  return <mesh ref={meshRef} geometry={geometry} material={material} renderOrder={2} />;
}

export { AMP as BELIEF_AMP, SURFACE_Y as BELIEF_SURFACE_Y };
