import "client-only";
import { parseCsv } from "./csv";
import { findDuplicateCandidates } from "./dedupe";
import { findCellIssues } from "./issues";
import { profileColumns } from "./profile";
import type { CsvEncoding, ProcessResult, Stage } from "./types";

export interface ProcessOptions {
  /** How `text` was decoded (see `decodeCsvBytes`); defaults to UTF-8. */
  encoding?: CsvEncoding;
  /** Called before each stage starts, so the UI can show progress. */
  onStage?: (stage: Stage) => void;
}

/** Pure pipeline: text in, results out. Runs inside the Web Worker. */
export function processCsv(text: string, { encoding, onStage }: ProcessOptions = {}): ProcessResult {
  onStage?.("parsing");
  const parsed = parseCsv(text, encoding);
  onStage?.("profiling");
  const profile = profileColumns(parsed);
  onStage?.("matching");
  const { candidates, skippedLargeBlocks } = findDuplicateCandidates(parsed);
  onStage?.("checking");
  const cellIssues = findCellIssues(parsed, profile);
  return { parsed, profile, duplicates: candidates, skippedLargeBlocks, cellIssues };
}
