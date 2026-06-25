// Ref-measured container size via ResizeObserver so the SVG viewBox tracks the
// parent exactly (the canvas is full-bleed behind floating UI, design doc 8.2).

import { useEffect, useRef, useState } from "react";

export interface Size {
  width: number;
  height: number;
}

export function useMeasure<T extends HTMLElement>(): [
  React.RefObject<T>,
  Size,
] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        setSize({ width: cr.width, height: cr.height });
      }
    });
    ro.observe(el);
    // seed immediately
    const rect = el.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });
    return () => ro.disconnect();
  }, []);

  return [ref, size];
}
