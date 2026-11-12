import "client-only";
import type { Crm } from "@/lib/rule-packs/types";
import { planColumns, projectRow } from "./crm-mapping";
import type { MergeResult } from "./merge";
import type { CsvRow, ProcessResult } from "./types";
import { normalizeEmail } from "./validate";

export interface ExportOptions {
  /** Strip leading/trailing whitespace from every cell. */
  trim: boolean;
  /** Lower-case the email column. */
  lowercaseEmails: boolean;
  /** Apply the capitalization suggestions from the issues pass. */
  fixCase: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = { trim: true, lowercaseEmails: true, fixCase: true };

export interface ExportTable {
  headers: string[];
  rows: CsvRow[];
}

/** Pure: merged rows + cleaning options + CRM layout ⇒ the table to download. */
export function buildExportTable(
  { parsed, roles, cellIssues }: Pick<ProcessResult, "parsed" | "roles" | "cellIssues">,
  merged: MergeResult,
  crm: Crm,
  options: ExportOptions,
): ExportTable {
  // Case fixes keyed by column, then by the trimmed NFC original value. Keyed by
  // value rather than row so they also apply to values carried over by a merge.
  const fixes = new Map<number, Map<string, string>>();
  if (options.fixCase) {
    for (const i of cellIssues) {
      if (i.code !== "inconsistent_case" || i.suggestion === undefined) continue;
      const original = (parsed.rows[i.row]?.[i.col] ?? "").trim().normalize("NFC");
      let byValue = fixes.get(i.col);
      if (!byValue) fixes.set(i.col, (byValue = new Map()));
      byValue.set(original, i.suggestion);
    }
  }
  const emailCol = roles.email;

  const clean = (row: CsvRow): CsvRow =>
    row.map((value, col) => {
      let v = value;
      const fix = fixes.get(col)?.get(v.trim().normalize("NFC"));
      if (fix !== undefined) v = fix;
      if (options.trim) v = v.trim();
      if (options.lowercaseEmails && col === emailCol) v = options.trim ? normalizeEmail(v) : v.toLowerCase();
      return v;
    });

  const columns = planColumns(parsed.headers, crm, roles);
  return { headers: columns.map((c) => c.header), rows: merged.rows.map((r) => projectRow(clean(r), columns)) };
}
