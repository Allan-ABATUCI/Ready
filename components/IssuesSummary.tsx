"use client";

import type { CellIssue, CellIssueCode } from "@/lib/data-plane/types";

const LABELS: Record<CellIssueCode, string> = {
  invalid_email: "Invalid email",
  invalid_phone: "Invalid phone number",
  invalid_date: "Invalid date (expected YYYY-MM-DD)",
  inconsistent_case: "Inconsistent capitalization",
};

const CODE_ORDER: CellIssueCode[] = ["invalid_email", "invalid_phone", "invalid_date", "inconsistent_case"];
const MAX_ROWS_SHOWN = 20;

interface Group {
  code: CellIssueCode;
  col: number;
  issues: CellIssue[];
}

/** Group by (code, column) in a fixed order so the list never reshuffles. */
export function groupIssues(issues: CellIssue[]): Group[] {
  const groups: Group[] = [];
  for (const code of CODE_ORDER) {
    const cols = [...new Set(issues.filter((i) => i.code === code).map((i) => i.col))].sort((a, b) => a - b);
    for (const col of cols) groups.push({ code, col, issues: issues.filter((i) => i.code === code && i.col === col) });
  }
  return groups;
}

export interface IssuesSummaryProps {
  headers: string[];
  rows: string[][];
  issues: CellIssue[];
}

export function IssuesSummary({ headers, rows, issues }: IssuesSummaryProps) {
  const groups = groupIssues(issues);

  return (
    <section aria-labelledby="issues-heading" className="rounded-xl bg-white p-6 shadow-sm" data-testid="issues">
      <h2 id="issues-heading" className="text-lg font-semibold text-slate-900">
        Issues <span className="font-normal text-slate-500">({issues.length})</span>
      </h2>

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
