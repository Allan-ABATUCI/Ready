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

/** Issue detection alone: enough after an edit that can't change duplicate pairs. */
export function checkIssues(
  parsed: ParsedCsv,
  profile: ColumnProfile[],
  { roles, dateOrder }: AnalysisInputs,
  onStage?: OnStage,
): Pick<Analysis, "cellIssues"> {
  onStage?.("checking");
  return { cellIssues: findCellIssues(parsed, profile, roles, dateOrder) };
}

/** The input-dependent stages. Also run on their own when the user changes an input or edits a cell. */
export function analyze(
  parsed: ParsedCsv,
  profile: ColumnProfile[],
  inputs: AnalysisInputs,
  onStage?: OnStage,
): Analysis {
  onStage?.("matching");
  const { candidates, skippedLargeBlocks } = findDuplicateCandidates(parsed, inputs.roles, inputs.defaultCountry);
  return { duplicates: candidates, skippedLargeBlocks, ...checkIssues(parsed, profile, inputs, onStage) };
}

/**
 * Pure pipeline: text in, results out. Runs inside the Web Worker. Roles default
 * to those detected from the headers, and the date order to the one the date
 * columns' values settle (see `detectDateOrder`), and there is no default phone country.
 */
export function processCsv(text: string, { encoding, onStage, ...rest }: ProcessOptions = {}): ProcessResult {
  onStage?.("parsing");
  return processParsed(parseCsv(text, encoding), { ...rest, onStage });
}

/** The pipeline after parsing, for files that aren't CSV text (e.g. Excel workbooks). */
export function processParsed(
  parsed: ParsedCsv,
  { roles, dateOrder, defaultCountry = null, onStage }: Omit<ProcessOptions, "encoding"> = {},
): ProcessResult {
  onStage?.("profiling");
  const profile = profileColumns(parsed);
  const usedRoles = roles ?? detectKeyColumns(parsed.headers);
  const usedOrder =
    dateOrder !== undefined
      ? dateOrder
      : detectDateOrder(dateColumns(profile, usedRoles).flatMap((col) => parsed.rows.map((row) => row[col] ?? "")));
  const inputs: AnalysisInputs = { roles: usedRoles, dateOrder: usedOrder, defaultCountry };
  return { parsed, profile, ...inputs, ...analyze(parsed, profile, inputs, onStage) };
}
