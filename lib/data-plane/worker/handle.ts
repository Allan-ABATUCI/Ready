import "client-only";
import { decodeCsvBytes, parseCsv } from "../csv";
import { analyze, checkIssues, processParsed } from "../process";
import { parseSession, SessionError } from "../session";
import { restoreSession } from "../session-restore";
import { looksLikeXlsx, readXlsx, XlsxError } from "../xlsx";
import type { ParsedCsv, Stage } from "../types";
import type { WorkerRequest, WorkerResponse } from "./protocol";

/** A CSV/TSV or .xlsx file's bytes as a table. Told apart by content, not name: a renamed workbook still reads. */
export function readTable(bytes: Uint8Array): ParsedCsv {
  if (looksLikeXlsx(bytes)) {
    const { headers, rows } = readXlsx(bytes);
    return { headers, rows, delimiter: "", hadBom: false, encoding: "utf-8", issues: [] };
  }
  // Bytes, not file.text(): text() always assumes UTF-8, and Excel often saves Windows-1252.
  const { text, encoding } = decodeCsvBytes(bytes);
  return parseCsv(text, encoding);
}

/**
 * Handle one worker request, reporting progress, per-stage timings and the
 * result through `post`. Kept apart from the worker entry point so tests can
 * run it directly.
 */
export async function handleRequest(req: WorkerRequest, post: (msg: WorkerResponse) => void): Promise<void> {
  let current: { stage: Stage; start: number } | null = null;
  const endStage = () => {
    if (current) post({ type: "timing", stage: current.stage, ms: performance.now() - current.start });
    current = null;
  };
  const onStage = (stage: Stage) => {
    endStage();
    current = { stage, start: performance.now() };
    post({ type: "progress", stage });
  };

  try {
    if (req.type === "process") {
      onStage("parsing");
      const parsed = readTable(new Uint8Array(await req.file.arrayBuffer()));
      const result = processParsed(parsed, { onStage });
      endStage();
      post({ type: "processed", result });
    } else if (req.type === "resume") {
      onStage("parsing");
      const session = parseSession(await req.file.text());
      const restored = restoreSession(session, onStage);
      endStage();
      post({ type: "restored", restored });
    } else {
      const run = req.scope === "all" ? analyze : checkIssues;
      const analysis = run(req.parsed, req.profile, req.inputs, onStage);
      endStage();
      post({ type: "analyzed", analysis });
    }
  } catch (e) {
    // Never forward the error message — it could quote file content. Codes only.
    if (e instanceof SessionError || e instanceof XlsxError) post({ type: "error", code: e.code });
    else if (req.type === "analyze") post({ type: "error", code: "analyze_failed" });
    else post({ type: "error", code: req.type === "resume" ? "session_invalid" : "parse_failed" });
  }
}
