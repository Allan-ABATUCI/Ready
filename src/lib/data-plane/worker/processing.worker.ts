import { handleRequest } from "./handle";
import type { WorkerRequest, WorkerResponse } from "./protocol";

// Typed locally to avoid pulling the "webworker" lib into the global (DOM) tsconfig.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (msg: WorkerResponse) => void;
};

ctx.onmessage = (e) => void handleRequest(e.data, (msg) => ctx.postMessage(msg));
