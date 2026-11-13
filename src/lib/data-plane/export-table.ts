import "client-only";
import type { Crm } from "@/lib/rule-packs/types";
import { planColumns, projectRow, type OutputColumn } from "./crm-mapping";
import { readDate } from "./dates";
import { dateColumns } from "./issues";
import type { MergeResult } from "./merge";
import { toE164 } from "./phone";
import { sourceFilesOf } from "./sources";
import type { CellIssueCode, CsvRow, ProcessResult } from "./types";
import { normalizeEmail } from "./validate";

export interface ExportOptions {
  /** Strip leading/trailing whitespace from every cell. */
  trim: boolean;
  /** Lower-case the email column. */
  lowercaseEmails: boolean;
  /** Apply the capitalization suggestions from the issues pass. */
  fixCase: boolean;
  /**
   * Apply the email domain typo suggestions ("gmial.com" → "gmail.com"). Off by
   * default: changing an address is riskier than fixing its case, and the
   * domain may be real.
   */
  fixEmailTypos: boolean;
  /**
   * Rewrite the phone column in E.164 ("+33612345678"), reading national numbers
   * with the analysis' default country; values that can't be converted are kept.
   */
  normalizePhones: boolean;
  /** Rewrite date columns as YYYY-MM-DD, read in the analysis' date order; ambiguous or invalid values are kept. */
  isoDates: boolean;
  /**
   * Add a last column naming the file each contact came from (all of them, for
   * a merged contact). Only applies to combined files; off by default.
   */
  sourceFile: boolean;
}

/** The options the UI shows as checkboxes (`sourceFile` only for combined files). */
export type ExportToggle = keyof ExportOptions;

export type SetExportOption = (key: ExportToggle, value: boolean) => void;

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  trim: true,
  lowercaseEmails: true,
  fixCase: true,
  fixEmailTypos: false,
  normalizePhones: true,
  isoDates: true,
  sourceFile: false,
};

export const SOURCE_FILE_HEADER = "Source file";

/**
 * What cleaning did to a cell. The first six change the value; the `_unchanged`
 * kinds mark phones and dates that couldn't be converted and were kept as written.
 */
export type ChangeKind =
  | "case_fixed"
  | "email_typo_fixed"
  | "trimmed"
  | "email_lowercased"
  | "phone_e164"
  | "date_iso"
  | "phone_unchanged"
  | "date_unchanged";

export const CHANGE_KINDS: ChangeKind[] = [
  "case_fixed",
  "email_typo_fixed",
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
  /** Output rows left out because they are already in the CRM. */
  excludedRows: number;
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
    defaultCountry,
    cellIssues,
  }: Pick<ProcessResult, "parsed" | "profile" | "roles" | "dateOrder" | "defaultCountry" | "cellIssues">,
  merged: MergeResult,
  crm: Crm,
  options: ExportOptions,
  cellRows = 0,
): ExportTable {
  // Suggested fixes the options turn on, keyed by column, then by the trimmed
  // NFC original value. Keyed by value rather than row so they also apply to
  // values carried over by a merge. A cell has at most one suggestion: case
  // issues are never raised on email columns.
  const fixKinds: Partial<Record<CellIssueCode, ChangeKind>> = {
    ...(options.fixCase && { inconsistent_case: "case_fixed" }),
    ...(options.fixEmailTypos && { email_typo: "email_typo_fixed" }),
  };
  const fixes = new Map<number, Map<string, { value: string; kind: ChangeKind }>>();
  for (const i of cellIssues) {
    const kind = fixKinds[i.code];
    if (kind === undefined || i.suggestion === undefined) continue;
    const original = (parsed.rows[i.row]?.[i.col] ?? "").trim().normalize("NFC");
    let byValue = fixes.get(i.col);
    if (!byValue) fixes.set(i.col, (byValue = new Map()));
    byValue.set(original, { value: i.suggestion, kind });
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
        v = fix.value;
        kinds.push(fix.kind);
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
        const e164 = toE164(v, defaultCountry);
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

  const sources = options.sourceFile ? parsed.sources : undefined;
  const fileColumns = planColumns(parsed.headers, crm, roles);
  const columns = sources ? [...fileColumns, sourceFileColumn(fileColumns)] : fileColumns;
  return {
    headers: columns.map((c) => c.header),
    rows: merged.rows.map((row, r) =>
      projectRow(clean(row, r), columns, sources && sourceFilesOf(sources, merged.members[r] ?? [])),
    ),
    columns,
    changes: {
      counts,
      rowsIn: parsed.rows.length,
      rowsOut: merged.rows.length,
      mergedGroups: merged.mergedGroups,
      excludedRows: merged.excludedRows,
      cells,
    },
  };
}

/** The "Source file" column, renamed like `planColumns` does if the file already has a column by that name. */
function sourceFileColumn(columns: OutputColumn[]): OutputColumn {
  const taken = new Set(columns.map((c) => c.header.toLowerCase()));
  let header = SOURCE_FILE_HEADER;
  for (let n = 2; taken.has(header.toLowerCase()); n++) header = `${SOURCE_FILE_HEADER} (${n})`;
  return { header, source: { kind: "sourceFile" } };
}
