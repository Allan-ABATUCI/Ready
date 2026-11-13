import "client-only";
import { toCsv } from "./csv";
import type { CsvRow } from "./types";

/** Trigger a local download via a blob: URL — no network request is made. */
export function downloadCsv(filename: string, headers: string[], rows: CsvRow[]): void {
  downloadText(filename, toCsv(headers, rows), "text/csv;charset=utf-8");
}

/** Save text as a file through a local blob URL: nothing is uploaded. */
export function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
