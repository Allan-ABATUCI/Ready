export type CsvRow = string[];

export interface CsvIssue {
  /** Zero-based data row index (excluding header), or null when not row-specific. */
  row: number | null;
  /** Machine-readable code. Never contains cell values. */
  code: string;
}

export interface ParsedCsv {
  headers: string[];
  rows: CsvRow[];
  delimiter: string;
  hadBom: boolean;
  issues: CsvIssue[];
}

export type FieldFormatCheck = "email" | "phone" | "date";

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

export type CellIssueCode = "invalid_email" | "invalid_phone" | "invalid_date" | "inconsistent_case";

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

export interface ProcessResult {
  parsed: ParsedCsv;
  profile: ColumnProfile[];
  duplicates: DuplicateCandidate[];
  cellIssues: CellIssue[];
}
