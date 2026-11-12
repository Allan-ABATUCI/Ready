import type { ColumnRoles } from "./columns";
import type { DateOrder } from "./dates";
import type { CountryCode } from "./phone";

export type CsvRow = string[];

export interface CsvIssue {
  /** Zero-based data row index (excluding header), or null when not row-specific. */
  row: number | null;
  /** Machine-readable code. Never contains cell values. */
  code: string;
}

/** How the file's bytes were decoded. */
export type CsvEncoding = "utf-8" | "windows-1252";

export interface ParsedCsv {
  headers: string[];
  rows: CsvRow[];
  delimiter: string;
  hadBom: boolean;
  encoding: CsvEncoding;
  issues: CsvIssue[];
}

export type ValuePattern = "empty" | "email" | "phone" | "date" | "number" | "text";

export interface ColumnProfile {
  index: number;
  header: string;
  filled: number;
  fillRate: number;
  distinct: number;
  pattern: ValuePattern;
}

export type MatchField = "email" | "phone" | "name" | "company";

export interface DuplicateCandidate {
  /** Row indexes, a < b. */
  a: number;
  b: number;
  /** 0–100. */
  score: number;
  matchedOn: MatchField[];
}

export type CellIssueCode =
  | "invalid_email"
  | "invalid_phone"
  | "invalid_date"
  /** Reads as two different dates (day/month or month/day) and no date order is set. */
  | "ambiguous_date"
  | "inconsistent_case";

export interface CellIssue {
  /** Zero-based data row index (excluding header). */
  row: number;
  /** Zero-based column index. */
  col: number;
  code: CellIssueCode;
  /**
   * Proposed replacement (only for `inconsistent_case`). Derived from file data,
   * so it stays in the browser like every other value.
   */
  suggestion?: string;
}

/** The user-adjustable inputs to `analyze`. Changing one re-runs the analysis. */
export interface AnalysisInputs {
  roles: ColumnRoles;
  /** How day/month dates are read; null when the file doesn't say and the user hasn't chosen. */
  dateOrder: DateOrder | null;
  /**
   * Country of phone numbers written without "+" or "00", used to match them
   * with international ones and to write them in E.164. Null by default, and
   * deliberately never inferred from navigator.language: results must depend
   * only on the file and the user's explicit choices (CLAUDE.md).
   */
  defaultCountry: CountryCode | null;
}

/** Everything that depends on `AnalysisInputs`, so it is recomputed when the user changes one. */
export interface Analysis {
  duplicates: DuplicateCandidate[];
  /** Rows in very common name groups that weren't compared by name (see MAX_BLOCK in dedupe.ts). */
  skippedLargeBlocks: number;
  cellIssues: CellIssue[];
}

/** `roles` and `dateOrder` are the ones the analysis used: detected from the file, or chosen by the user. */
/**
 * What to recompute: "all" (matching and issues) after a change that can alter
 * duplicate pairs, "issues" after one that can't, such as editing a cell no role uses.
 */
export type AnalysisScope = "all" | "issues";

/** The result of `analyze` for a scope: issues only for "issues". */
export type AnalysisUpdate = Analysis | Pick<Analysis, "cellIssues">;

export interface ProcessResult extends Analysis, AnalysisInputs {
  parsed: ParsedCsv;
  profile: ColumnProfile[];
}

/** Pipeline stages reported to the UI. Names only: never counts or values. */
export type Stage = "parsing" | "profiling" | "matching" | "checking";
