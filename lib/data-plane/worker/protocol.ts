import type { ProcessResult } from "../types";

export interface ProcessRequest {
  file: File;
}

export type ProcessResponse = { ok: true; result: ProcessResult } | { ok: false; code: "parse_failed" };
