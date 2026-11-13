import "client-only";
import { detectKeyColumns, KEY_COLUMNS, normalizeHeader } from "./columns";
import type { CsvRow, ParsedCsv } from "./types";

/**
 * Combining several files into one contact list. The user lines up the files'
 * columns on a mapping screen: `proposeMapping` makes the first guess, the
 * editing helpers keep the mapping consistent, and `combineTables` stacks the
 * rows. All pure and deterministic: same files and mapping, same table.
 */

/** What the mapping screen shows of one file: its columns and a few example values. */
export interface TablePreview {
  name: string;
  headers: string[];
  rowCount: number;
  /** Up to `SAMPLES_PER_COLUMN` distinct non-blank values per column, first seen first. */
  samples: string[][];
}

/** One column of the combined table: for each file, the column it takes values from, or null. */
export interface MappingRow {
  header: string;
  sources: (number | null)[];
}

export type ColumnMapping = MappingRow[];

/** A file column, for columns left out of the mapping. */
export interface FileColumn {
  file: number;
  col: number;
}

export const SAMPLES_PER_COLUMN = 3;

export function previewTable(name: string, parsed: Pick<ParsedCsv, "headers" | "rows">): TablePreview {
  const samples = parsed.headers.map((_, col) => {
    const seen: string[] = [];
    for (const row of parsed.rows) {
      const v = (row[col] ?? "").trim();
      if (v !== "" && !seen.includes(v)) seen.push(v);
      if (seen.length === SAMPLES_PER_COLUMN) break;
    }
    return seen;
  });
  return { name, headers: parsed.headers, rowCount: parsed.rows.length, samples };
}

/**
 * First guess at lining up the files' columns, file by file, left to right.
 * A column joins an earlier one with the same header (ignoring case, accents
 * and punctuation, as role detection does), or else one playing the same role
 * ("E-mail" with "Email address", "Mobile" with "Phone"). A file never feeds
 * two of its columns into one combined column; anything unmatched becomes a
 * column of its own, so nothing is left out until the user says so.
 */
export function proposeMapping(tables: Pick<TablePreview, "headers">[]): ColumnMapping {
  const mapping: ColumnMapping = [];
  const byKey = new Map<string, number>();
  tables.forEach((table, f) => {
    const roles = detectKeyColumns(table.headers);
    const roleOf = new Map(KEY_COLUMNS.filter((k) => roles[k] !== undefined).map((k) => [roles[k]!, k]));
    const fedByThisFile = new Set<number>();
    table.headers.forEach((header, col) => {
      const name = normalizeHeader(header);
      const role = roleOf.get(col);
      // Exact name first: if both files have "Mobile", that beats matching it with "Phone" by role.
      const keys = [name && `name:${name}`, role && `role:${role}`].filter((k): k is string => Boolean(k));
      let target = keys.map((k) => byKey.get(k)).find((t) => t !== undefined && !fedByThisFile.has(t));
      if (target === undefined) {
        target = mapping.length;
        mapping.push({ header, sources: Array<number | null>(tables.length).fill(null) });
      }
      mapping[target]!.sources[f] = col;
      fedByThisFile.add(target);
      for (const k of keys) if (!byKey.has(k)) byKey.set(k, target);
    });
  });
  return mapping;
}

/** Combined columns that no file feeds any more are dropped: there is nothing to show in them. */
const live = (mapping: ColumnMapping) => mapping.filter((r) => r.sources.some((s) => s !== null));

/** Take column `col` of file `file` out of every combined column. */
const release = (mapping: ColumnMapping, file: number, col: number): ColumnMapping =>
  mapping.map((r) =>
    r.sources[file] === col ? { ...r, sources: r.sources.map((s, f) => (f === file ? null : s)) } : r,
  );

/**
 * Make combined column `row` take file `file`'s values from `col` (null: from
 * none). A file column feeds one combined column at most, so it leaves any other.
 */
export function setSource(mapping: ColumnMapping, row: number, file: number, col: number | null): ColumnMapping {
  const freed = col === null ? mapping : release(mapping, file, col);
  return live(
    freed.map((r, i) => (i === row ? { ...r, sources: r.sources.map((s, f) => (f === file ? col : s)) } : r)),
  );
}

/** Give file column `col` a combined column of its own, named after it, at the end. */
export function addColumn(mapping: ColumnMapping, tables: Pick<TablePreview, "headers">[], file: number, col: number) {
  const sources = tables.map((_, f) => (f === file ? col : null));
  return [...live(release(mapping, file, col)), { header: tables[file]!.headers[col] ?? "", sources }];
}

/** Rename combined column `row`. */
export function renameColumn(mapping: ColumnMapping, row: number, header: string): ColumnMapping {
  return mapping.map((r, i) => (i === row ? { ...r, header } : r));
}

/** File columns no combined column takes values from, file by file, left to right. */
export function leftOutColumns(mapping: ColumnMapping, tables: Pick<TablePreview, "headers">[]): FileColumn[] {
  const out: FileColumn[] = [];
  tables.forEach((table, file) => {
    const used = new Set(mapping.map((r) => r.sources[file]));
    table.headers.forEach((_, col) => {
      if (!used.has(col)) out.push({ file, col });
    });
  });
  return out;
}

/** Thrown when a mapping doesn't fit the files it is applied to. Carries no file data. */
export class MappingError extends Error {
  constructor() {
    super("mapping_invalid");
  }
}

/** Check a mapping (it comes from the UI, through the worker) against the files' widths. */
export function checkMapping(mapping: ColumnMapping, widths: number[]): void {
  const ok =
    live(mapping).length > 0 &&
    mapping.every(
      (r) =>
        typeof r.header === "string" &&
        r.sources.length === widths.length &&
        r.sources.every((s, f) => s === null || (Number.isInteger(s) && s >= 0 && s < widths[f]!)),
    ) &&
    widths.every((_, f) => {
      const cols = mapping.map((r) => r.sources[f]).filter((s) => s !== null);
      return new Set(cols).size === cols.length;
    });
  if (!ok) throw new MappingError();
}

/**
 * Stack the files' rows, in file order, under the combined columns. Cells a
 * file has no column for are blank. Parse issues keep pointing at their rows,
 * and `sources` records which file each row came from.
 */
export function combineTables(tables: { name: string; parsed: ParsedCsv }[], mapping: ColumnMapping): ParsedCsv {
  checkMapping(
    mapping,
    tables.map((t) => t.parsed.headers.length),
  );
  const columns = live(mapping);
  const rows: CsvRow[] = [];
  const starts: number[] = [];
  const issues: ParsedCsv["issues"] = [];
  tables.forEach(({ parsed }, f) => {
    const start = rows.length;
    starts.push(start);
    for (const row of parsed.rows)
      rows.push(columns.map((c) => (c.sources[f] === null ? "" : (row[c.sources[f]!] ?? ""))));
    for (const i of parsed.issues) issues.push({ row: i.row === null ? null : i.row + start, code: i.code });
  });
  const delimiters = new Set(tables.map((t) => t.parsed.delimiter));
  return {
    headers: columns.map((c) => c.header),
    rows,
    delimiter: delimiters.size === 1 ? tables[0]!.parsed.delimiter : "",
    hadBom: tables.some((t) => t.parsed.hadBom),
    // Shown to the user as a note that accents were read the Excel way; true if any file was.
    encoding: tables.some((t) => t.parsed.encoding === "windows-1252") ? "windows-1252" : "utf-8",
    issues,
    sources: { files: tables.map((t) => t.name), starts },
  };
}
