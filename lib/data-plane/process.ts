import "client-only";
import { parseCsv } from "./csv";
import { findDuplicateCandidates } from "./dedupe";
import { profileColumns } from "./profile";
import type { ProcessResult } from "./types";

/** Pure pipeline: text in, results out. Runs inside the Web Worker. */
export function processCsv(text: string): ProcessResult {
  const parsed = parseCsv(text);
  return { parsed, profile: profileColumns(parsed), duplicates: findDuplicateCandidates(parsed) };
}
