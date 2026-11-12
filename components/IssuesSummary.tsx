"use client";

import type { DateOrder } from "@/lib/data-plane/dates";
import type { CellIssue, CellIssueCode } from "@/lib/data-plane/types";
import { groupBy } from "@/lib/group";
import { DateOrderSelect } from "./DateOrderSelect";

const LABELS: Record<CellIssueCode, string> = {
  invalid_email: "Invalid email",
  invalid_phone: "Invalid phone number",
  invalid_date: "Invalid date",
  ambiguous_date: "Date could be day/month or month/day",
  inconsistent_case: "Inconsistent capitalization",
};

const CODE_ORDER: CellIssueCode[] = [
  "invalid_email",
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

export interface IssuesSummaryProps {
  headers: string[];
  rows: string[][];
  issues: CellIssue[];
  /** Offered next to ambiguous dates, since choosing an order is how they're resolved. */
  onDateOrder?: (order: DateOrder | null) => void;
  busy?: boolean;
}

export function IssuesSummary({ headers, rows, issues, onDateOrder, busy = false }: IssuesSummaryProps) {
  const groups = groupIssues(issues);
  // Ambiguous dates only exist while the order is "not sure", so the picker starts there.
  const hasAmbiguousDates = issues.some((i) => i.code === "ambiguous_date");

  return (
    <section aria-labelledby="issues-heading" className="rounded-xl bg-white p-6 shadow-sm" data-testid="issues">
      <h2 id="issues-heading" className="text-lg font-semibold text-slate-900">
        Issues <span className="font-normal text-slate-500">({issues.length})</span>
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
          {groups.map((g) => (
            <li key={`${g.code}:${g.col}`}>
              <details>
                <summary className="cursor-pointer">
                  <span className="font-medium text-slate-800">{LABELS[g.code]}</span> in{" "}
                  <span className="font-medium">{headers[g.col] || "(blank column)"}</span>
                  <span className="text-slate-500"> · {g.issues.length}</span>
                </summary>
                <table className="mt-2 ml-4 text-left">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="pr-4 font-medium">Row</th>
                      <th className="pr-4 font-medium">Value</th>
                      {g.code === "inconsistent_case" && <th className="font-medium">Suggested</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {g.issues.slice(0, MAX_ROWS_SHOWN).map((i) => (
                      <tr key={i.row}>
                        <td className="pr-4">{i.row + 1}</td>
                        <td className="pr-4 break-words">{rows[i.row]?.[i.col] ?? ""}</td>
                        {g.code === "inconsistent_case" && <td>{i.suggestion}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {g.issues.length > MAX_ROWS_SHOWN && (
                  <p className="ml-4 text-slate-500">…and {g.issues.length - MAX_ROWS_SHOWN} more</p>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
