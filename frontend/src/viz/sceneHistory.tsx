// The historical close line on the floor + a small sphere at "Now"
// (design doc 3.3). Neutral grey.

import { useMemo } from "react";
import { Line } from "@react-three/drei";

import type { HistoryBar } from "../types/contracts";
import type { Timeline } from "./scene";
import { FLOOR_Y, xOfMs, zOfPrice } from "./sceneCoords";
import { GREY } from "./sceneColors";

const LINE_Y = FLOOR_Y + 0.02;

export function SceneHistory({
  history,
  tl,
  domain,
}: {
  history: HistoryBar[];
  tl: Timeline;
  domain: [number, number];
}): JSX.Element | null {
  const { pts, nowPoint } = useMemo(() => {
    const out: [number, number, number][] = [];
    for (const bar of history) {
      const ms = new Date(bar.d).getTime();
      out.push([xOfMs(ms, tl), LINE_Y, zOfPrice(bar.close, domain)]);
    }
    const last = out.length ? out[out.length - 1] : null;
    return { pts: out, nowPoint: last };
  }, [history, tl, domain]);

  if (pts.length < 2) return null;

  return (
    <group>
      <Line points={pts} color={GREY} lineWidth={1.5} transparent opacity={0.7} />
      {nowPoint && (
        <mesh position={nowPoint}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshBasicMaterial color={GREY} />
        </mesh>
      )}
    </group>
  );
}
