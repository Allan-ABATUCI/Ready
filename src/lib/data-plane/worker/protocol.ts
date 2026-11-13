import type {
  AnalysisInputs,
  AnalysisScope,
  AnalysisUpdate,
  ColumnProfile,
  ParsedCsv,
  ProcessResult,
  Stage,
} from "../types";
import type { CrmComparison } from "../crm-compare";
import type { RestoredSession } from "../session";

export type WorkerRequest =
  | { type: "process"; file: File }
  /** Read a saved session file and rebuild its analysis. */
  | { type: "resume"; file: File }
  /** Find rows of the (fixed) file that are already in a CRM export. */
  | { type: "compare"; file: File; parsed: ParsedCsv; inputs: AnalysisInputs }
  /** Re-run the input-dependent stages after the user changes an input or edits a cell; the file isn't read again. */
  | { type: "analyze"; parsed: ParsedCsv; profile: ColumnProfile[]; inputs: AnalysisInputs; scope: AnalysisScope };

/** Messages carry stage names and codes only, never counts or values from the file. */
export type WorkerResponse =
  | { type: "progress"; stage: Stage }
  /** How long a stage took, for diagnostics. */
  | { type: "timing"; stage: Stage; ms: number }
  | { type: "processed"; result: ProcessResult }
  | { type: "analyzed"; analysis: AnalysisUpdate }
  | { type: "restored"; restored: RestoredSession }
  | { type: "compared"; comparison: CrmComparison }
  | { type: "error"; code: WorkerErrorCode };

export type WorkerErrorCode =
  | "parse_failed"
  | "analyze_failed"
  | "session_invalid"
  | "session_version"
  | "xlsx_invalid"
  | "xlsx_too_large"
  | "xlsx_empty";
