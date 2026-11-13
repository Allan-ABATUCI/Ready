import "client-only";
import type { ParsedCsv } from "./types";

/**
 * Cell values the user typed in to fix flagged cells, keyed by `cellKey`. Held
 * in memory only, like the file itself.
 */
export type Overrides = Record<string, string>;

export function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

/**
 * The file with the user's edits applied. Pure: only edited rows are copied,
 * and the result depends only on the cells edited, not the order of edits.
 */
export function applyOverrides(parsed: ParsedCsv, overrides: Overrides): ParsedCsv {
  const keys = Object.keys(overrides);
  if (keys.length === 0) return parsed;
  const rows = parsed.rows.slice();
  for (const key of keys) {
    const [row, col] = key.split(":").map(Number) as [number, number];
    const original = parsed.rows[row];
    if (!original) continue;
    // Copy each edited row once, even when several of its cells were edited.
    if (rows[row] === original) rows[row] = original.slice();
    rows[row]![col] = overrides[key]!;
  }
  return { ...parsed, rows };
}
