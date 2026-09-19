// components/hr/variance/use-chart-width.ts
"use client";
import { useEffect, useRef, useState } from "react";

/** Measures a container's content width via ResizeObserver so an SVG chart can
 *  use a viewBox width equal to the container's pixel width (scale 1, constant
 *  font sizes) and fill the panel responsively. Returns [ref, width]; width
 *  starts at `fallback` for the first paint / SSR. */
export function useChartWidth(fallback = 640): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}
