import "client-only";
import type { ProcessResult } from "./types";
import type { ProcessRequest, ProcessResponse } from "./worker/protocol";

/** Process a file off the main thread. The File never leaves the browser. */
export function processFileInWorker(file: File): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker/processing.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<ProcessResponse>) => {
      worker.terminate();
      if (e.data.ok) resolve(e.data.result);
      else reject(new Error(e.data.code));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("worker_failed"));
    };
    worker.postMessage({ file } satisfies ProcessRequest);
  });
}
