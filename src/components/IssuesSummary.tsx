"use client";

import { useState } from "react";
import type { DateOrder } from "@/lib/data-plane/dates";
import { rowOrigin } from "@/lib/data-plane/sources";
import type { CellIssue, CellIssueCode, RowSources } from "@/lib/data-plane/types";
import { groupBy } from "@/lib/group";
import { CountUp } from "./CountUp";
import { DateOrderSelect } from "./DateOrderSelect";

const LABELS: Record<CellIssueCode, string> = {
  invalid_email: "Invalid email",
  email_typo: "Possible typo in email domain",
  invalid_phone: "Invalid phone number",
  invalid_date: "Invalid date",
  ambiguous_date: "Date could be day/month or month/day",
  inconsistent_case: "Inconsistent capitalization",
};

const CODE_ORDER: CellIssueCode[] = [
  "invalid_email",
  "email_typo",
  "invalid_phone",
  "invalid_date",
  "ambiguous_date",
  "inconsistent_case",
];
const MAX_ROWS_SHOWN = 20;

interface Group {
  code: CellIssueCode;
  col: number;
  issues: CellIssue[];
}

/** Group by (code, column), ordered by CODE_ORDER then column, so the list never reshuffles. */
export function groupIssues(issues: CellIssue[]): Group[] {
  const rank = (i: CellIssue) => CODE_ORDER.indexOf(i.code);
  const sorted = [...issues].sort((x, y) => rank(x) - rank(y) || x.col - y.col || x.row - y.row);
  return groupBy(sorted, (i) => `${i.code}:${i.col}`).map(({ items }) => ({
    code: items[0]!.code,
    col: items[0]!.col,
    issues: items,
  }));
}

interface CellEditorProps {
  value: string;
  label: string;
  suggestion?: string;
  onSave: (value: string) => void;
  disabled: boolean;
}

/** Edit one flagged cell. Keyed by its value by the caller, so the draft resets when the value changes. */
function CellEditor({ value, label, suggestion, onSave, disabled }: CellEditorProps) {
  const [draft, setDraft] = useState(value);
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <input
        aria-label={label}
        className="rounded border px-1 py-0.5"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button
        type="submit"
        className="rounded border px-2 py-0.5 disabled:opacity-40"
        disabled={disabled || draft === value}
      >
        Save
      </button>
      {suggestion !== undefined && (
        <button
          type="button"
          className="rounded border px-2 py-0.5 disabled:opacity-40"
          disabled={disabled}
          onClick={() => onSave(suggestion)}
        >
          Use suggestion
        </button>
      )}
    </form>
  );
}

/** "12", or "3 of webinar.xlsx" for a row of a combined list. */
function rowNumber(sources: RowSources | undefined, row: number): string {
  const { line, file } = rowOrigin(sources, row);
  return file === null ? String(line) : `${line} of ${file}`;
}

export interface IssuesSummaryProps {
  /** For combined files: rows are numbered within the file they came from. */
  sources?: RowSources;
  headers: string[];
  rows: string[][];
  issues: CellIssue[];
  /** Offered next to ambiguous dates, since choosing an order is how they're resolved. */
  onDateOrder?: (order: DateOrder | null) => void;
  /** Fix a flagged cell in place. Without it the list is read-only. */
  onEdit?: (row: number, col: number, value: string) => void;
  busy?: boolean;
}

export function IssuesSummary({
  sources,
  headers,
  rows,
  issues,
  onDateOrder,
  onEdit,
  busy = false,
}: IssuesSummaryProps) {
  const groups = groupIssues(issues);
  // Ambiguous dates only exist while the order is "not sure", so the picker starts there.
  const hasAmbiguousDates = issues.some((i) => i.code === "ambiguous_date");

  return (
    <section aria-labelledby="issues-heading" className="rounded-xl bg-white p-6 shadow-sm" data-testid="issues">
      <h2 id="issues-heading" className="text-lg font-semibold text-slate-900">
        Issues{" "}
        <span className="font-normal text-slate-500">
          (<CountUp value={issues.length} />)
        </span>
      </h2>

      {onDateOrder && hasAmbiguousDates && (
        <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" data-testid="ambiguous-dates">
          <p>Some dates could be read either way, like 03/04/2024 (3 April or 4 March). How are dates written?</p>
          <div className="mt-2">
            <DateOrderSelect value={null} onChange={onDateOrder} disabled={busy} />
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">No formatting issues found.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {groups.map((g) => {
            const hasSuggestions = g.issues.some((i) => i.suggestion !== undefined);
            const column = headers[g.col] || "(blank column)";
            return (
              <li key={`${g.code}:${g.col}`}>
                <details>
                  <summary className="cursor-pointer">
                    <span className="font-medium text-slate-800">{LABELS[g.code]}</span> in{" "}
                    <span className="font-medium">{column}</span>
                    <span className="text-slate-500"> · {g.issues.length}</span>
                  </summary>
                  <table className="mt-2 ml-4 text-left">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="pr-4 font-medium">Row</th>
                        <th className="pr-4 font-medium">Value</th>
                        {hasSuggestions && <th className="pr-4 font-medium">Suggested</th>}
                        {onEdit && <th className="font-medium">Fix</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {g.issues.slice(0, MAX_ROWS_SHOWN).map((i) => {
                        const value = rows[i.row]?.[i.col] ?? "";
                        return (
                          <tr key={i.row}>
                            <td className="pr-4">{rowNumber(sources, i.row)}</td>
                            <td className="pr-4 break-words">{value}</td>
                            {hasSuggestions && <td className="pr-4">{i.suggestion}</td>}
                            {onEdit && (
                              <td>
                                <CellEditor
                                  key={value}
                                  value={value}
                                  label={`Fix row ${rowNumber(sources, i.row)}, ${column}`}
                                  suggestion={i.suggestion}
                                  onSave={(v) => onEdit(i.row, i.col, v)}
                                  disabled={busy}
                                />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {g.issues.length > MAX_ROWS_SHOWN && (
                    <p className="ml-4 text-slate-500">…and {g.issues.length - MAX_ROWS_SHOWN} more</p>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
