import "client-only";
import Papa from "papaparse";
import type { CsvRow, ParsedCsv } from "./types";

const BOM = "﻿";
const DELIMITERS = [",", ";", "\t", "|"];

/** Parse CSV text entirely in memory. Handles BOMs, quoted/multiline fields and common delimiters. */
export function parseCsv(text: string): ParsedCsv {
  const hadBom = text.startsWith(BOM);
  const input = hadBom ? text.slice(BOM.length) : text;

  const result = Papa.parse<string[]>(input, {
    header: false,
    skipEmptyLines: "greedy",
    delimitersToGuess: DELIMITERS,
  });

  const [headerRow = [], ...body] = result.data;
  const headers = headerRow.map((h) => h.trim());
  const rows = body.map((r) => fitWidth(r, headers.length));

  const issues = result.errors
    // A single-column file has no delimiter to detect; that's not a problem.
    .filter((e) => e.code !== "UndetectableDelimiter")
    .map((e) => ({ row: typeof e.row === "number" ? Math.max(e.row - 1, 0) : null, code: e.code }));

  return { headers, rows, delimiter: result.meta.delimiter, hadBom, issues };
}

function fitWidth(row: CsvRow, width: number): CsvRow {
  if (row.length === width) return row;
  if (row.length > width) return row.slice(0, width);
  return [...row, ...Array<string>(width - row.length).fill("")];
}

/** Serialize back to CSV (RFC 4180 quoting, CRLF line endings, no BOM). */
export function toCsv(headers: string[], rows: CsvRow[]): string {
  return Papa.unparse({ fields: headers, data: rows }, { newline: "\r\n" });
}
