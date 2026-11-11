import { processCsv } from "../process";
import type { ProcessRequest, ProcessResponse } from "./protocol";

// Typed locally to avoid pulling the "webworker" lib into the global (DOM) tsconfig.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ProcessRequest>) => void) | null;
  postMessage: (msg: ProcessResponse) => void;
};

ctx.onmessage = async (e) => {
  try {
    const text = await e.data.file.text();
    ctx.postMessage({ ok: true, result: processCsv(text) });
  } catch {
    // Never forward the error message — it could quote file content.
    ctx.postMessage({ ok: false, code: "parse_failed" });
  }
};
