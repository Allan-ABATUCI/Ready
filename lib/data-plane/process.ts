import "client-only";
import { parseCsv } from "./csv";
import { findDuplicateCandidates } from "./dedupe";
import { findCellIssues } from "./issues";
import { profileColumns } from "./profile";
import type { ProcessResult } from "./types";

/** Pure pipeline: text in, results out. Runs inside the Web Worker. */
export function processCsv(text: string): ProcessResult {
  const parsed = parseCsv(text);
  const profile = profileColumns(parsed);
  return {
    parsed,
    profile,
    duplicates: findDuplicateCandidates(parsed),
    cellIssues: findCellIssues(parsed, profile),
  };
}
