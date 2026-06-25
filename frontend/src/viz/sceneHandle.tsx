// The center handle (design doc 8.2): a thin white ring at the blob's center,
// marking where a grab will MOVE the cloud. Decorative -- the whole blob is
// draggable; this is just an affordance. Cool white (never colored).

import { useMemo } from "react";

import type { BeliefParams } from "../types/contracts";
import type { Timeline } from "./scene";
import { beliefBlobExtents } from "./scene";
import { xOfMs, zOfPrice } from "./sceneCoords";
import { BELIEF_SURFACE_Y } from "./sceneBeliefSurface";
import { WHITE } from "./sceneColors";

export function BeliefHandle({
  belief,
  tl,
  domain,
}: {
  belief: BeliefParams;
  tl: Timeline;
  domain: [number, number];
}): JSX.Element {
  const { x, z } = useMemo(() => {
    const ext = beliefBlobExtents(belief, tl);
    return { x: xOfMs(ext.centerMs, tl), z: zOfPrice(ext.centerPrice, domain) };
  }, [belief, tl, domain]);

  return (
    <mesh position={[x, BELIEF_SURFACE_Y + 0.12, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.18, 0.018, 12, 32]} />
      <meshBasicMaterial color={WHITE} transparent opacity={0.85} />
    </mesh>
  );
}
