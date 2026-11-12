import type { ColumnRoles } from "../columns";
import type { Analysis, ColumnProfile, ParsedCsv, ProcessResult, Stage } from "../types";

export type WorkerRequest =
  | { type: "process"; file: File }
  /** Re-run the role-dependent stages after the user reassigns a column; the file isn't read again. */
  | { type: "analyze"; parsed: ParsedCsv; profile: ColumnProfile[]; roles: ColumnRoles };

/** Messages carry stage names and codes only, never counts or values from the file. */
export type WorkerResponse =
  | { type: "progress"; stage: Stage }
  | { type: "processed"; result: ProcessResult }
  | { type: "analyzed"; analysis: Analysis }
  | { type: "error"; code: "parse_failed" | "analyze_failed" };
