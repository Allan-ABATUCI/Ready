import "client-only";
import type { ColumnRoles } from "./columns";
import type { Analysis, ColumnProfile, ParsedCsv, ProcessResult, Stage } from "./types";
import type { WorkerRequest, WorkerResponse } from "./worker/protocol";

type Done = Extract<WorkerResponse, { type: "processed" | "analyzed" }>;

/** One request, one fresh worker: no state survives between files. */
function runInWorker(request: WorkerRequest, onStage?: (stage: Stage) => void): Promise<Done> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker/processing.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        onStage?.(msg.stage);
        return;
      }
      worker.terminate();
      if (msg.type === "error") reject(new Error(msg.code));
      else resolve(msg);
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

/** Re-run duplicate and issue detection with new column roles, off the main thread. */
export async function analyzeInWorker(
  parsed: ParsedCsv,
  profile: ColumnProfile[],
  roles: ColumnRoles,
  onStage?: (stage: Stage) => void,
): Promise<Analysis> {
  const msg = await runInWorker({ type: "analyze", parsed, profile, roles }, onStage);
  if (msg.type !== "analyzed") throw new Error("worker_failed");
  return msg.analysis;
}
