// FLIP re-rank transition (design doc 12.3). When `ranked` re-orders on a belief
// or sort change, rows GLIDE to their new positions instead of jumping. We key
// children by candidate id, record their previous box, then on the next layout
// animate the vertical delta away with a decelerating transform.
//
// Respects prefers-reduced-motion: when set, no transform animation is applied.

import { useLayoutEffect, useRef } from "react";
import { usePrefersReducedMotion } from "../viz/usePrefersReducedMotion";

/** Attach the returned ref to the list container. Each animated child must carry
 *  a `data-flip-key` attribute (stable per row, e.g. the candidate id). */
export function useFlip<T extends HTMLElement>(deps: unknown): React.RefObject<T> {
  const ref = useRef<T>(null);
  const prev = useRef<Map<string, number>>(new Map());
  const reduced = usePrefersReducedMotion();

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;

    const children = Array.from(
      container.querySelectorAll<HTMLElement>("[data-flip-key]"),
    );

    if (reduced) {
      // record positions so a later non-reduced run has a baseline, but do not animate
      const next = new Map<string, number>();
      for (const el of children) {
        const key = el.dataset.flipKey;
        if (key != null) next.set(key, el.getBoundingClientRect().top);
      }
      prev.current = next;
      return;
    }

    const next = new Map<string, number>();
    for (const el of children) {
      const key = el.dataset.flipKey;
      if (key == null) continue;
      const top = el.getBoundingClientRect().top;
      next.set(key, top);

      const before = prev.current.get(key);
      if (before === undefined) continue;
      const dy = before - top;
      if (Math.abs(dy) < 0.5) continue;

      // INVERT: place the element back where it was, then PLAY to identity.
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
    }

    // force reflow so the inverted transform is committed before we play it out
    void container.getBoundingClientRect();

    for (const el of children) {
      const key = el.dataset.flipKey;
      if (key == null) continue;
      if (!el.style.transform || el.style.transform === "none") continue;
      el.style.transition =
        "transform var(--dur-standard) var(--ease-settle)";
      el.style.transform = "";
    }

    prev.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps, reduced]);

  return ref;
}
