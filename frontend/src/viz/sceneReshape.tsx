// Reshape interaction (design doc 8.2): click-drag anywhere to reshape ONE smooth
// blob. A large invisible plane on the floor catches pointer events; the r3f event
// carries the world intersection point, which we convert to (price, ms). On
// pointerdown we classify the grab zone from beliefBlobExtents:
//
//   - inside the inner core (price within ~40% of the 68% half-heights of m) -> MOVE:
//       drag sets m to the dragged price.  (Horizontal/time drag is DECORATIVE only
//       in this single-expiration slice -- it never changes engine params.)
//   - grab above center (price > m, outside core) -> widen UPSIDE: sigma_up.
//   - grab below center (price < m, outside core) -> widen DOWNSIDE: sigma_down.
//
// setBelief is rAF-throttled so dragging is smooth; ZERO network. The downstream
// clamp (clampBelief) keeps degenerate params valid.

import { useCallback, useEffect, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import type { BeliefParams } from "../types/contracts";
import { sigmaFromBandPrice } from "../core/belief";
import type { Timeline } from "./scene";
import { beliefBlobExtents } from "./scene";
import { X_SPAN, Z_SPAN, FLOOR_Y, priceOfZ } from "./sceneCoords";

type GrabZone = "move" | "up" | "down";

const CORE_FRAC = 0.4; // inner-core half-height as a fraction of the 68% half-heights

export function SceneReshape({
  belief,
  setBelief,
  tl,
  domain,
}: {
  belief: BeliefParams;
  setBelief: (b: BeliefParams) => void;
  tl: Timeline;
  domain: [number, number];
}): JSX.Element {
  const dragging = useRef(false);
  const zone = useRef<GrabZone>("move");
  // latest pending belief (rAF-throttled flush so we don't setState per pointermove).
  const pending = useRef<BeliefParams | null>(null);
  const raf = useRef<number | null>(null);

  // keep a live ref to the current belief so handlers see fresh widths.
  const beliefRef = useRef(belief);
  beliefRef.current = belief;

  const flush = useCallback(() => {
    raf.current = null;
    if (pending.current) {
      setBelief(pending.current);
      pending.current = null;
    }
  }, [setBelief]);

  const schedule = useCallback(
    (next: BeliefParams) => {
      pending.current = next;
      if (raf.current == null) raf.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  useEffect(() => {
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, []);

  const priceAt = (e: ThreeEvent<PointerEvent>): number =>
    priceOfZ(e.point.z, domain);

  const classify = (price: number): GrabZone => {
    const b = beliefRef.current;
    const ext = beliefBlobExtents(b, tl);
    const ring68 = ext.rings.find((r) => r.k === 1) ?? ext.rings[0];
    const upHalf = Math.abs(ring68.top - ext.centerPrice);
    const downHalf = Math.abs(ext.centerPrice - ring68.bottom);
    const dPrice = price - ext.centerPrice;
    if (dPrice >= 0 && dPrice <= upHalf * CORE_FRAC) return "move";
    if (dPrice < 0 && -dPrice <= downHalf * CORE_FRAC) return "move";
    return dPrice > 0 ? "up" : "down";
  };

  const onDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const price = priceAt(e);
      zone.current = classify(price);
      dragging.current = true;
      (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
      document.body.style.cursor = "grabbing";
    },
    [domain, tl],
  );

  const onMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!dragging.current) return;
      const price = priceAt(e);
      const b = beliefRef.current;
      if (zone.current === "move") {
        // MOVE: slide the whole cloud to the dragged price. (Time drag decorative.)
        schedule({ ...b, m: Math.max(1e-6, price) });
      } else if (zone.current === "up") {
        // fatten the TOP: pulling up grabs price > m and widens sigma_up.
        const su = sigmaFromBandPrice(b.m, Math.max(b.m * 1.0001, price));
        schedule({ ...b, sigma_up: su });
      } else {
        // fatten the BOTTOM: pulling down grabs price < m and widens sigma_down.
        const sd = sigmaFromBandPrice(b.m, Math.min(b.m * 0.9999, Math.max(1e-6, price)));
        schedule({ ...b, sigma_down: sd });
      }
    },
    [schedule],
  );

  const onUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    dragging.current = false;
    (e.target as Element | null)?.releasePointerCapture?.(e.pointerId);
    document.body.style.cursor = "grab";
  }, []);

  const onOver = useCallback(() => {
    if (!dragging.current) document.body.style.cursor = "grab";
  }, []);
  const onOut = useCallback(() => {
    if (!dragging.current) document.body.style.cursor = "auto";
  }, []);

  // a large invisible catcher plane on the floor (laid flat: rotate -90deg about X).
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, FLOOR_Y + 0.005, 0]}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerOver={onOver}
      onPointerOut={onOut}
    >
      <planeGeometry args={[X_SPAN * 2.4, Z_SPAN * 2.4]} />
      <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
    </mesh>
  );
}
