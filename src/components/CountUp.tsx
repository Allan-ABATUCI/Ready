"use client";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 400;

/** True when the browser can animate and the user hasn't asked for less motion. */
export function motionAllowed(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    typeof window.requestAnimationFrame === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * A count that ticks up to `value` once, quickly, when it first appears or
 * changes. Shows `value` straight away when motion is off (or in tests).
 */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(() => (motionAllowed() ? 0 : value));
  const from = useRef(shown);

  useEffect(() => {
    if (!motionAllowed()) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(origin + (value - origin) * eased);
      from.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className="tabular-nums">{shown}</span>;
}
