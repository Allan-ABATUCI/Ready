"use client";

import type { DateOrder } from "@/lib/data-plane/dates";

const LABELS: Record<DateOrder, string> = {
  dmy: "Day/Month/Year",
  mdy: "Month/Day/Year",
  ymd: "Year/Month/Day",
};

export interface DateOrderSelectProps {
  /** null shows "Not sure". */
  value: DateOrder | null;
  onChange: (order: DateOrder | null) => void;
  disabled?: boolean;
}

/** "Dates are written as" picker. Shared by the column summary and the issues list. */
export function DateOrderSelect({ value, onChange, disabled = false }: DateOrderSelectProps) {
  return (
    <label className="flex items-center gap-2 text-sm">
      Dates are written as
      <select
        className="rounded border px-1 py-0.5"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange((e.target.value || null) as DateOrder | null)}
      >
        {(Object.keys(LABELS) as DateOrder[]).map((o) => (
          <option key={o} value={o}>
            {LABELS[o]}
          </option>
        ))}
        <option value="">Not sure</option>
      </select>
    </label>
  );
}
