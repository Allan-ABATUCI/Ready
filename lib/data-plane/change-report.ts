import "client-only";
import { CHANGE_KINDS, type ChangeKind, type ExportTable } from "./export-table";
import type { CsvRow } from "./types";

export const CHANGE_LABELS: Record<ChangeKind, string> = {
  case_fixed: "Capitalization fixed",
  email_typo_fixed: "Email typo fixed",
  trimmed: "Extra spaces removed",
  email_lowercased: "Email lower-cased",
  phone_e164: "Phone in international format",
  date_iso: "Date as YYYY-MM-DD",
  phone_unchanged: "Phone left as written (couldn't convert)",
  date_unchanged: "Date left as written (couldn't convert)",
};

export const DETAIL_HEADERS = ["Row in export", "Column in your file", "Change", "Before", "After"];

/**
 * The change report as CSV rows: summary counts, a blank line, then one line
 * per changed or unconverted cell. `table` must be built with `cellRows` covering
 * every row (see `buildExportTable`), or the detail is cut short.
 *
 * PRIVACY: the report quotes file values (before / after). Like the export, it
 * is only ever downloaded as a local blob; it must never be sent anywhere —
 * no upload, telemetry, error report or log (CLAUDE.md). `e2e/privacy.spec.ts`
 * downloads it and checks no request carries it.
 */
export function buildChangeReport(table: ExportTable, fileHeaders: string[]): { headers: string[]; rows: CsvRow[] } {
  const { counts, rowsIn, rowsOut, mergedGroups, excludedRows, cells } = table.changes;
  const summary: CsvRow[] = [
    ["Rows in", String(rowsIn)],
    ["Rows out", String(rowsOut)],
    ["Merged groups", String(mergedGroups)],
    ...(excludedRows > 0 ? [["Already in CRM, left out", String(excludedRows)]] : []),
    ...CHANGE_KINDS.map((k) => [CHANGE_LABELS[k], String(counts[k])]),
  ];
  const detail: CsvRow[] = cells.map((c) => [
    String(c.row + 1),
    fileHeaders[c.col] || `Column ${c.col + 1}`,
    c.kinds.map((k) => CHANGE_LABELS[k]).join("; "),
    c.before,
    c.after,
  ]);
  // Every row is padded to the detail width: `toCsv` cuts rows down to the
  // header's width, and a rectangular file opens cleanly in any spreadsheet.
  const pad = (row: CsvRow): CsvRow => [...row, ...Array<string>(DETAIL_HEADERS.length - row.length).fill("")];
  return { headers: pad(["Summary", "Count"]), rows: [...summary, [], DETAIL_HEADERS, ...detail].map(pad) };
}
