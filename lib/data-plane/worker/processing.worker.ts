import { decodeCsvBytes } from "../csv";
import { processCsv } from "../process";
import type { Stage } from "../types";
import type { ProcessRequest, ProcessResponse } from "./protocol";

// Typed locally to avoid pulling the "webworker" lib into the global (DOM) tsconfig.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ProcessRequest>) => void) | null;
  postMessage: (msg: ProcessResponse) => void;
};

ctx.onmessage = async (e) => {
  try {
    // Bytes, not file.text(): text() always assumes UTF-8, and Excel often saves Windows-1252.
    const { text, encoding } = decodeCsvBytes(new Uint8Array(await e.data.file.arrayBuffer()));
    const onStage = (stage: Stage) => ctx.postMessage({ type: "progress", stage });
    const result = processCsv(text, { encoding, onStage });
    ctx.postMessage({ type: "done", result });
  } catch {
    // Never forward the error message — it could quote file content.
    ctx.postMessage({ type: "error", code: "parse_failed" });
  }
};
