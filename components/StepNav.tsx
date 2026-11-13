"use client";

import { CountUp } from "./CountUp";

export interface StepItem<S extends string> {
  id: S;
  label: string;
  /** A count shown beside the label (issues, duplicates…); omitted when null. */
  count?: number | null;
  disabled?: boolean;
}

export interface StepNavProps<S extends string> {
  steps: StepItem<S>[];
  current: S;
  onStep: (step: S) => void;
}

/**
 * The guided flow's step bar. The active marker slides between steps
 * (transform only, so it stays smooth); finished steps get a check.
 */
export function StepNav<S extends string>({ steps, current, onStep }: StepNavProps<S>) {
  const index = Math.max(
    0,
    steps.findIndex((s) => s.id === current),
  );

  return (
    <nav aria-label="Steps" className="relative">
      <ol className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, i) => {
          const done = i < index;
          const active = i === index;
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={step.disabled}
                aria-current={active ? "step" : undefined}
                onClick={() => onStep(step.id)}
                className={`group flex w-full items-center gap-2 px-2 pt-1 pb-3 text-left text-sm transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
                  active ? "font-semibold text-emerald-700" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs transition-colors duration-200 ${
                    active ? "bg-emerald-600 text-white" : done ? "bg-emerald-100 text-emerald-700" : "bg-slate-200"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className="truncate">{step.label}</span>
                {step.count != null && (
                  <span className="rounded-full bg-slate-100 px-1.5 text-xs font-normal text-slate-600">
                    <CountUp value={step.count} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <div aria-hidden="true" className="h-0.5 w-full rounded bg-slate-200">
        <div
          data-testid="step-marker"
          className="h-full rounded bg-emerald-600 transition-transform duration-300 ease-out"
          style={{ width: `${100 / steps.length}%`, transform: `translateX(${index * 100}%)` }}
        />
      </div>
    </nav>
  );
}
