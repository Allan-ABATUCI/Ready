import "client-only";
import Papa from "papaparse";
import type { CsvEncoding, CsvRow, ParsedCsv } from "./types";

const BOM = "﻿";
const DELIMITERS = [",", ";", "\t", "|"];
/** Excel's delimiter hint, written as the first line of some exports. */
const SEP_LINE = /^sep=(.)\r?$/i;

/**
 * Decode file bytes. Valid UTF-8 is read as UTF-8; anything else falls back to
 * Windows-1252, which is what Excel on Windows writes for "CSV (comma delimited)".
 * Every byte sequence is valid Windows-1252, so the fallback never throws.
 */
export function decodeCsvBytes(bytes: Uint8Array): { text: string; encoding: CsvEncoding } {
  try {
    // ignoreBOM keeps the BOM in the text so parseCsv can report `hadBom`.
    return { text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
  }
}

/** Parse CSV text entirely in memory. Handles BOMs, quoted/multiline fields and common delimiters. */
export function parseCsv(text: string, encoding: CsvEncoding = "utf-8"): ParsedCsv {
  const hadBom = text.startsWith(BOM);
  let input = hadBom ? text.slice(BOM.length) : text;

  const newline = input.indexOf("\n");
  const sep = SEP_LINE.exec(newline === -1 ? input : input.slice(0, newline));
  if (sep) input = newline === -1 ? "" : input.slice(newline + 1);

  const result = Papa.parse<string[]>(input, {
    header: false,
    skipEmptyLines: "greedy",
    ...(sep ? { delimiter: sep[1] } : { delimitersToGuess: DELIMITERS }),
  });

  const [headerRow = [], ...body] = result.data;
  const headers = headerRow.map((h) => h.trim());
  const rows = body.map((r) => fitWidth(r, headers.length));

  const issues = result.errors
    // A single-column file has no delimiter to detect; that's not a problem.
    .filter((e) => e.code !== "UndetectableDelimiter")
    .map((e) => ({ row: typeof e.row === "number" ? Math.max(e.row - 1, 0) : null, code: e.code }));

  return { headers, rows, delimiter: result.meta.delimiter, hadBom, encoding, issues };
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
