import "client-only";
import type { Crm } from "@/lib/rule-packs/types";
import { planColumns, projectRow, type OutputColumn } from "./crm-mapping";
import { readDate } from "./dates";
import { dateColumns } from "./issues";
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
  /** Rewrite date columns as YYYY-MM-DD, read in the analysis' date order; ambiguous or invalid values are kept. */
  isoDates: boolean;
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
  isoDates: true,
  defaultCountry: null,
};

/**
 * What cleaning did to a cell. The first five change the value; the `_unchanged`
 * kinds mark phones and dates that couldn't be converted and were kept as written.
 */
export type ChangeKind =
  "case_fixed" | "trimmed" | "email_lowercased" | "phone_e164" | "date_iso" | "phone_unchanged" | "date_unchanged";

export const CHANGE_KINDS: ChangeKind[] = [
  "case_fixed",
  "trimmed",
  "email_lowercased",
  "phone_e164",
  "date_iso",
  "phone_unchanged",
  "date_unchanged",
];

export function isConversionFailure(kind: ChangeKind): boolean {
  return kind === "phone_unchanged" || kind === "date_unchanged";
}

/** One cleaned cell of the merged table: `col` is the file's column, before it is mapped to CRM headers. */
export interface CellChange {
  /** Zero-based output row. */
  row: number;
  col: number;
  kinds: ChangeKind[];
  before: string;
  after: string;
}

export interface ExportChanges {
  /** Cells per kind, over the whole table. */
  counts: Record<ChangeKind, number>;
  rowsIn: number;
  rowsOut: number;
  mergedGroups: number;
  /** Changed or unconverted cells in the first `cellRows` output rows, by row then column. */
  cells: CellChange[];
}

export interface ExportTable {
  headers: string[];
  rows: CsvRow[];
  /** Where each output column comes from, so a change to a file column can be shown on the CRM column. */
  columns: OutputColumn[];
  changes: ExportChanges;
}

/**
 * Pure: merged rows + cleaning options + CRM layout ⇒ the table to download,
 * with what cleaning changed. Changes are counted for every row, but listed cell
 * by cell only for the first `cellRows` output rows: the preview needs a few,
 * the change report all of them, and holding one object per changed cell on
 * every re-render would be wasteful on large files.
 */
export function buildExportTable(
  {
    parsed,
    profile,
    roles,
    dateOrder,
    cellIssues,
  }: Pick<ProcessResult, "parsed" | "profile" | "roles" | "dateOrder" | "cellIssues">,
  merged: MergeResult,
  crm: Crm,
  options: ExportOptions,
  cellRows = 0,
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
  const dateCols = new Set(options.isoDates ? dateColumns(profile, roles) : []);

  const counts = Object.fromEntries(CHANGE_KINDS.map((k) => [k, 0])) as Record<ChangeKind, number>;
  const cells: CellChange[] = [];

  const clean = (row: CsvRow, r: number): CsvRow =>
    row.map((before, col) => {
      let v = before;
      const kinds: ChangeKind[] = [];
      const fix = fixes.get(col)?.get(v.trim().normalize("NFC"));
      if (fix !== undefined) {
        v = fix;
        kinds.push("case_fixed");
      }
      if (options.trim && v !== v.trim()) {
        v = v.trim();
        kinds.push("trimmed");
      }
      if (options.lowercaseEmails && col === emailCol) {
        const lower = options.trim ? normalizeEmail(v) : v.toLowerCase();
        if (lower !== v) kinds.push("email_lowercased");
        v = lower;
      }
      // Blank phones and dates are not failed conversions: there is nothing to convert.
      if (col === phoneCol && v.trim() !== "") {
        const e164 = toE164(v, options.defaultCountry);
        if (e164 === null) kinds.push("phone_unchanged");
        else if (e164 !== v) kinds.push("phone_e164");
        v = e164 ?? v;
      }
      if (dateCols.has(col) && v.trim() !== "") {
        const reading = readDate(v, dateOrder);
        if (reading.kind !== "date") kinds.push("date_unchanged");
        else if (reading.iso !== v) kinds.push("date_iso");
        if (reading.kind === "date") v = reading.iso;
      }
      for (const k of kinds) counts[k]++;
      if (kinds.length > 0 && r < cellRows) cells.push({ row: r, col, kinds, before, after: v });
      return v;
    });

  const columns = planColumns(parsed.headers, crm, roles);
  return {
    headers: columns.map((c) => c.header),
    rows: merged.rows.map((row, r) => projectRow(clean(row, r), columns)),
    columns,
    changes: {
      counts,
      rowsIn: parsed.rows.length,
      rowsOut: merged.rows.length,
      mergedGroups: merged.mergedGroups,
      cells,
    },
  };
}
