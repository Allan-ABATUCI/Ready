import "client-only";
import type { Crm } from "@/lib/rule-packs/types";
import { planColumns, projectRow } from "./crm-mapping";
import type { MergeResult } from "./merge";
import { toE164, type CountryCode } from "./phone";
import type { CsvRow, ProcessResult } from "./types";
import { normalizeEmail } from "./validate";

export interface ExportOptions {
  /** Strip leading/trailing whitespace from every cell. */
  trim: boolean;
  /** Lower-case the email column. */
  lowercaseEmails: boolean;
  /** Apply the capitalization suggestions from the issues pass. */
  fixCase: boolean;
  /** Rewrite the phone column in E.164 ("+33612345678"); values that can't be converted are kept. */
  normalizePhones: boolean;
  /**
   * Country for phone numbers written without "+" or "00". Null by default, and
   * deliberately never inferred from navigator.language: the export must depend
   * only on the file, the rule pack and the user's explicit choices (CLAUDE.md).
   */
  defaultCountry: CountryCode | null;
}

/** The on/off options, which the UI shows as checkboxes. */
export type ExportToggle = {
  [K in keyof ExportOptions]: ExportOptions[K] extends boolean ? K : never;
}[keyof ExportOptions];

export type SetExportOption = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) => void;

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  trim: true,
  lowercaseEmails: true,
  fixCase: true,
  normalizePhones: true,
  defaultCountry: null,
};

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
  const phoneCol = options.normalizePhones ? roles.phone : undefined;

  const clean = (row: CsvRow): CsvRow =>
    row.map((value, col) => {
      let v = value;
      const fix = fixes.get(col)?.get(v.trim().normalize("NFC"));
      if (fix !== undefined) v = fix;
      if (options.trim) v = v.trim();
      if (options.lowercaseEmails && col === emailCol) v = options.trim ? normalizeEmail(v) : v.toLowerCase();
      if (col === phoneCol) v = toE164(v, options.defaultCountry) ?? v;
      return v;
    });

  const columns = planColumns(parsed.headers, crm, roles);
  return { headers: columns.map((c) => c.header), rows: merged.rows.map((r) => projectRow(clean(r), columns)) };
}
