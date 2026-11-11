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

export interface ProcessResult {
  parsed: ParsedCsv;
  profile: ColumnProfile[];
  duplicates: DuplicateCandidate[];
}
