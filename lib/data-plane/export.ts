import "client-only";
import { toCsv } from "./csv";
import type { CsvRow } from "./types";

/** Trigger a local download via a blob: URL — no network request is made. */
export function downloadCsv(filename: string, headers: string[], rows: CsvRow[]): void {
  const blob = new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
