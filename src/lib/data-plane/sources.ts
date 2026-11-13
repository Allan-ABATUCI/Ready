import "client-only";
import type { RowSources } from "./types";

/** Index of the file row `row` of a combined table came from. */
export function fileOfRow(sources: RowSources, row: number): number {
  // Few files, so a scan from the end beats anything cleverer.
  for (let f = sources.starts.length - 1; f > 0; f--) if (row >= sources.starts[f]!) return f;
  return 0;
}

/**
 * How to name a row to the user: "Row 12" for a single file, or its row in its
 * own file for a combined table ("Row 3 of webinar.xlsx"), which is the number
 * the user can find when they open that file.
 */
export function describeRow(sources: RowSources | undefined, row: number): string {
  const { line, file } = rowOrigin(sources, row);
  return file === null ? `Row ${line}` : `Row ${line} of ${file}`;
}

/** A row's 1-based number in the file it came from, and that file's name (null for a single file). */
export function rowOrigin(sources: RowSources | undefined, row: number): { line: number; file: string | null } {
  if (!sources) return { line: row + 1, file: null };
  const f = fileOfRow(sources, row);
  return { line: row - sources.starts[f]! + 1, file: sources.files[f] ?? null };
}

/**
 * The files the original rows `members` came from (a merged contact can come
 * from several), unique and in the order the files were combined, joined by "; ".
 */
export function sourceFilesOf(sources: RowSources, members: readonly number[]): string {
  const files = [...new Set(members.map((row) => fileOfRow(sources, row)))].sort((a, b) => a - b);
  return files.map((f) => sources.files[f]).join("; ");
}
