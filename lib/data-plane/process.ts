import "client-only";
import { detectKeyColumns } from "./columns";
import { parseCsv } from "./csv";
import { detectDateOrder } from "./dates";
import { findDuplicateCandidates } from "./dedupe";
import { dateColumns, findCellIssues } from "./issues";
import { profileColumns } from "./profile";
import type { Analysis, AnalysisInputs, ColumnProfile, CsvEncoding, ParsedCsv, ProcessResult, Stage } from "./types";

type OnStage = (stage: Stage) => void;

export interface ProcessOptions extends Partial<AnalysisInputs> {
  /** How `text` was decoded (see `decodeCsvBytes`); defaults to UTF-8. */
  encoding?: CsvEncoding;
  /** Called before each stage starts, so the UI can show progress. */
  onStage?: OnStage;
}

/** The input-dependent stages. Also run on their own when the user changes a column role or the date order. */
export function analyze(
  parsed: ParsedCsv,
  profile: ColumnProfile[],
  { roles, dateOrder }: AnalysisInputs,
  onStage?: OnStage,
): Analysis {
  onStage?.("matching");
  const { candidates, skippedLargeBlocks } = findDuplicateCandidates(parsed, roles);
  onStage?.("checking");
  const cellIssues = findCellIssues(parsed, profile, roles, dateOrder);
  return { duplicates: candidates, skippedLargeBlocks, cellIssues };
}

/**
 * Pure pipeline: text in, results out. Runs inside the Web Worker. Roles default
 * to those detected from the headers, and the date order to the one the date
 * columns' values settle (see `detectDateOrder`).
 */
export function processCsv(text: string, { encoding, roles, dateOrder, onStage }: ProcessOptions = {}): ProcessResult {
  onStage?.("parsing");
  const parsed = parseCsv(text, encoding);
  onStage?.("profiling");
  const profile = profileColumns(parsed);
  const usedRoles = roles ?? detectKeyColumns(parsed.headers);
  const usedOrder =
    dateOrder !== undefined
      ? dateOrder
      : detectDateOrder(dateColumns(profile, usedRoles).flatMap((col) => parsed.rows.map((row) => row[col] ?? "")));
  const inputs: AnalysisInputs = { roles: usedRoles, dateOrder: usedOrder };
  return { parsed, profile, ...inputs, ...analyze(parsed, profile, inputs, onStage) };
}
