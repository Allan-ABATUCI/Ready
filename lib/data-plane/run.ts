import "client-only";
import type { ProcessResult, Stage } from "./types";
import type { ProcessRequest, ProcessResponse } from "./worker/protocol";

/** Process a file off the main thread. The File never leaves the browser. */
export function processFileInWorker(file: File, onStage?: (stage: Stage) => void): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker/processing.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<ProcessResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        onStage?.(msg.stage);
        return;
      }
      worker.terminate();
      if (msg.type === "done") resolve(msg.result);
      else reject(new Error(msg.code));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("worker_failed"));
    };
    worker.postMessage({ file } satisfies ProcessRequest);
  });
}
