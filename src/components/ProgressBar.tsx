"use client";

import type { Stage } from "@/lib/data-plane/types";

const ORDER: Stage[] = ["parsing", "profiling", "matching", "checking"];

/**
 * Progress through the worker's stages. The bar eases to each stage's share
 * and a soft shimmer shows it is still working within a stage. Stage names
 * only: the worker never reports counts from the file.
 */
export function ProgressBar({ stage }: { stage: Stage | null }) {
  const done = stage ? ORDER.indexOf(stage) : 0;
  const pct = Math.round(((done + 0.5) / ORDER.length) * 100);
  return (
    <div
      role="progressbar"
      aria-label="Processing in your browser"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
      data-testid="progress"
    >
      <div
        className="relative h-full overflow-hidden rounded-full bg-emerald-500 transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%` }}
      >
        <div className="absolute inset-y-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent" />
      </div>
    </div>
  );
}
