import { decodeCsvBytes } from "../csv";
import { analyze, processCsv } from "../process";
import type { Stage } from "../types";
import type { WorkerRequest, WorkerResponse } from "./protocol";

// Typed locally to avoid pulling the "webworker" lib into the global (DOM) tsconfig.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (msg: WorkerResponse) => void;
};

const onStage = (stage: Stage) => ctx.postMessage({ type: "progress", stage });

ctx.onmessage = async (e) => {
  const req = e.data;
  try {
    if (req.type === "process") {
      // Bytes, not file.text(): text() always assumes UTF-8, and Excel often saves Windows-1252.
      const { text, encoding } = decodeCsvBytes(new Uint8Array(await req.file.arrayBuffer()));
      ctx.postMessage({ type: "processed", result: processCsv(text, { encoding, onStage }) });
    } else {
      ctx.postMessage({ type: "analyzed", analysis: analyze(req.parsed, req.profile, req.roles, onStage) });
    }
  } catch {
    // Never forward the error message — it could quote file content.
    ctx.postMessage({ type: "error", code: req.type === "process" ? "parse_failed" : "analyze_failed" });
  }
};
