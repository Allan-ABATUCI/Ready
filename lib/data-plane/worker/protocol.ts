import type { ProcessResult, Stage } from "../types";

export interface ProcessRequest {
  file: File;
}

/** Messages carry stage names and codes only, never counts or values from the file. */
export type ProcessResponse =
  | { type: "progress"; stage: Stage }
  | { type: "done"; result: ProcessResult }
  | { type: "error"; code: "parse_failed" };
