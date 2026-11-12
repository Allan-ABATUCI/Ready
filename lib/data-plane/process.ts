import "client-only";
import { detectKeyColumns, type ColumnRoles } from "./columns";
import { parseCsv } from "./csv";
import { findDuplicateCandidates } from "./dedupe";
import { findCellIssues } from "./issues";
import { profileColumns } from "./profile";
import type { Analysis, ColumnProfile, CsvEncoding, ParsedCsv, ProcessResult, Stage } from "./types";

type OnStage = (stage: Stage) => void;

export interface ProcessOptions {
  /** How `text` was decoded (see `decodeCsvBytes`); defaults to UTF-8. */
  encoding?: CsvEncoding;
  /** Column roles to use; defaults to those detected from the headers. */
  roles?: ColumnRoles;
  /** Called before each stage starts, so the UI can show progress. */
  onStage?: OnStage;
}

/** The role-dependent stages. Also run on its own when the user reassigns a column. */
export function analyze(parsed: ParsedCsv, profile: ColumnProfile[], roles: ColumnRoles, onStage?: OnStage): Analysis {
  onStage?.("matching");
  const { candidates, skippedLargeBlocks } = findDuplicateCandidates(parsed, roles);
  onStage?.("checking");
  const cellIssues = findCellIssues(parsed, profile, roles);
  return { duplicates: candidates, skippedLargeBlocks, cellIssues };
}

/** Pure pipeline: text in, results out. Runs inside the Web Worker. */
export function processCsv(text: string, { encoding, roles, onStage }: ProcessOptions = {}): ProcessResult {
  onStage?.("parsing");
  const parsed = parseCsv(text, encoding);
  onStage?.("profiling");
  const profile = profileColumns(parsed);
  const used = roles ?? detectKeyColumns(parsed.headers);
  return { parsed, profile, roles: used, ...analyze(parsed, profile, used, onStage) };
}
