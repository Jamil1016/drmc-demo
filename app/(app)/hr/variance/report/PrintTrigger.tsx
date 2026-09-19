"use client";
import { useEffect } from "react";
export function PrintTrigger({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (enabled) {
      const t = setTimeout(() => window.print(), 400); // let fonts/images settle
      return () => clearTimeout(t);
    }
  }, [enabled]);
  return null;
}
