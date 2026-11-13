import "client-only";
import { logEvent } from "@/lib/diagnostics";
import type {
  AnalysisInputs,
  AnalysisScope,
  AnalysisUpdate,
  ColumnProfile,
  ParsedCsv,
  ProcessResult,
  Stage,
} from "./types";
import type { ColumnMapping, TablePreview } from "./combine";
import type { CrmComparison } from "./crm-compare";
import type { RestoredSession } from "./session";
import type { WorkerRequest, WorkerResponse } from "./worker/protocol";

type Done = Extract<WorkerResponse, { type: "processed" | "inspected" | "analyzed" | "restored" | "compared" }>;

/**
 * Handle one message from the worker: progress goes to `onStage`, timings to
 * diagnostics. Returns the final message, or null while work is still going.
 * Throws `Error(code)` for a worker error, so callers can map it to a known code.
 */
export function receive(msg: WorkerResponse, onStage?: (stage: Stage) => void): Done | null {
  switch (msg.type) {
    case "progress":
      onStage?.(msg.stage);
      return null;
    case "timing":
      logEvent({ kind: "stage", stage: msg.stage, ms: msg.ms });
      return null;
    case "error":
      throw new Error(msg.code);
    default:
      return msg;
  }
}

/** One request, one fresh worker: no state survives between files. */
function runInWorker(request: WorkerRequest, onStage?: (stage: Stage) => void): Promise<Done> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker/processing.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      let done: Done | null;
      try {
        done = receive(e.data, onStage);
      } catch (err) {
        worker.terminate();
        reject(err);
        return;
      }
      if (!done) return;
      worker.terminate();
      resolve(done);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("worker_failed"));
    };
    worker.postMessage(request);
  });
}

/** Process a file off the main thread. The File never leaves the browser. */
export async function processFileInWorker(file: File, onStage?: (stage: Stage) => void): Promise<ProcessResult> {
  const msg = await runInWorker({ type: "process", file }, onStage);
  if (msg.type !== "processed") throw new Error("worker_failed");
  return msg.result;
}

/** Read several files off the main thread and describe their columns, for the mapping screen. */
export async function inspectFilesInWorker(files: File[], onStage?: (stage: Stage) => void): Promise<TablePreview[]> {
  const msg = await runInWorker({ type: "inspect", files }, onStage);
  if (msg.type !== "inspected") throw new Error("worker_failed");
  return msg.tables;
}

/** Combine several files as the user mapped their columns, and process the result, off the main thread. */
export async function combineFilesInWorker(
  files: File[],
  mapping: ColumnMapping,
  onStage?: (stage: Stage) => void,
): Promise<ProcessResult> {
  const msg = await runInWorker({ type: "combine", files, mapping }, onStage);
  if (msg.type !== "processed") throw new Error("worker_failed");
  return msg.result;
}

/** Re-run duplicate and/or issue detection after a change, off the main thread. */
export async function analyzeInWorker(
  parsed: ParsedCsv,
  profile: ColumnProfile[],
  inputs: AnalysisInputs,
  scope: AnalysisScope,
  onStage?: (stage: Stage) => void,
): Promise<AnalysisUpdate> {
  const msg = await runInWorker({ type: "analyze", parsed, profile, inputs, scope }, onStage);
  if (msg.type !== "analyzed") throw new Error("worker_failed");
  return msg.analysis;
}

/** Read a saved session file off the main thread and rebuild its analysis. */
export async function resumeInWorker(file: File, onStage?: (stage: Stage) => void): Promise<RestoredSession> {
  const msg = await runInWorker({ type: "resume", file }, onStage);
  if (msg.type !== "restored") throw new Error("worker_failed");
  return msg.restored;
}

/** Compare the file (as fixed) with a CRM export, off the main thread. */
export async function compareInWorker(
  file: File,
  parsed: ParsedCsv,
  inputs: AnalysisInputs,
  onStage?: (stage: Stage) => void,
): Promise<CrmComparison> {
  const msg = await runInWorker({ type: "compare", file, parsed, inputs }, onStage);
  if (msg.type !== "compared") throw new Error("worker_failed");
  return msg.comparison;
}
