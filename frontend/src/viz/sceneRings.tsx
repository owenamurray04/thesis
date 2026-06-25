// The 68% / 95% egg rings (design doc 3.3 / 8.2). From beliefBlobExtents we have,
// per ring, four extent points: top (centerMs, top price), right (rightMs, center
// price), bottom (centerMs, bottom price), left (leftMs, center price). Because the
// belief is two-piece (asymmetric up/down sigma), top != bottom -> the loop is an
// EGG, not a circle.
//
// We trace a smooth closed curve by angle-parameterizing radii: at angle theta the
// price radius interpolates between the up-radius (theta near +pi/2) and the
// down-radius (theta near -pi/2), and the time radius between left/right. cos/sin
// give an ellipse per-quadrant; the asymmetric radii bend it into the egg. The loop
// hugs the blob, so top-down it reads as the rings and from the side it drapes the
// hump. Cool white/grey only -- never colored (color means P&L).

import { useMemo } from "react";
import { Line } from "@react-three/drei";

import type { BeliefParams } from "../types/contracts";
import type { Timeline } from "./scene";
import { beliefBlobExtents } from "./scene";
import { xOfMs, zOfPrice } from "./sceneCoords";
import { BELIEF_SURFACE_Y, BELIEF_AMP } from "./sceneBeliefSurface";
import { WHITE, GREY } from "./sceneColors";

const STEPS = 96; // samples around the loop
const RING_LIFT = 0.06; // sit a touch above the fog surface

export function BeliefRings({
  belief,
  tl,
  domain,
}: {
  belief: BeliefParams;
  tl: Timeline;
  domain: [number, number];
}): JSX.Element {
  const loops = useMemo(() => {
    const ext = beliefBlobExtents(belief, tl);
    const cx = xOfMs(ext.centerMs, tl);
    const cz = zOfPrice(ext.centerPrice, domain);

    return ext.rings.map((ring) => {
      // world radii (asymmetric in z because top != bottom -> egg).
      const zTop = zOfPrice(ring.top, domain); // higher price -> more negative z
      const zBottom = zOfPrice(ring.bottom, domain);
      const rUp = Math.abs(cz - zTop); // half-height toward higher price
      const rDown = Math.abs(zBottom - cz); // half-height toward lower price
      const rLeft = Math.abs(cx - xOfMs(ring.leftMs, tl));
      const rRight = Math.abs(xOfMs(ring.rightMs, tl) - cx);

      const pts: [number, number, number][] = [];
      for (let i = 0; i <= STEPS; i++) {
        const th = (i / STEPS) * Math.PI * 2;
        const ct = Math.cos(th);
        const st = Math.sin(th);
        // pick the radius for the half we're in (smoothly via sign of sin/cos).
        const rx = ct >= 0 ? rRight : rLeft;
        // in world, more-negative z = higher price; sin>0 -> toward higher price (up).
        const rz = st >= 0 ? rUp : rDown;
        const x = cx + rx * ct;
        const z = cz - rz * st; // subtract: positive st pushes toward -z (higher price)
        pts.push([x, BELIEF_SURFACE_Y + RING_LIFT, z]);
      }
      return { k: ring.k, pts };
    });
  }, [belief, tl, domain]);

  return (
    <group renderOrder={3}>
      {loops.map((loop) => (
        <Line
          key={loop.k}
          points={loop.pts}
          color={loop.k === 1 ? WHITE : GREY}
          lineWidth={loop.k === 1 ? 1.6 : 1.2}
          transparent
          opacity={loop.k === 1 ? 0.9 : 0.55}
        />
      ))}
    </group>
  );
}

// re-export so Scene can keep amplitudes consistent if needed later.
export { BELIEF_AMP };
