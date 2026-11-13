import "client-only";
import { strFromU8, unzipSync } from "fflate";

/**
 * A small, local .xlsx reader: the first worksheet as rows of strings, the way
 * Excel shows them closely enough for contact data. Runs in the worker like the
 * CSV parser; nothing is fetched.
 *
 * Deliberately limited: values only (no formulas evaluated, no formatting beyond
 * telling dates apart from numbers), first sheet only. Dates become ISO
 * YYYY-MM-DD so the date checks read them without guessing.
 */

/** Refuse archives that would inflate past this: a guard against zip bombs. */
export const MAX_XLSX_BYTES = 256 * 1024 * 1024;

export class XlsxError extends Error {
  constructor(public readonly code: "xlsx_invalid" | "xlsx_too_large" | "xlsx_empty") {
    super(code);
  }
}

/** Zip files start "PK\x03\x04". */
export function looksLikeXlsx(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export interface XlsxSheet {
  headers: string[];
  rows: string[][];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** XML text → string: entities, numeric references, and Excel's _xHHHH_ escapes. */
export function decodeXml(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, ref: string) => {
      if (ref[0] !== "#") return ENTITIES[ref.toLowerCase()] ?? m;
      const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** The visible text of a shared or inline string: every <t>, without phonetic (<rPh>) runs. */
function stringItemText(xml: string): string {
  const visible = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of visible.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) out += decodeXml(m[1] ?? "");
  return out;
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

/** "AB12" → 27 (zero-based column). */
export function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/** Built-in number formats that are dates or times (ECMA-376 §18.8.30). */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

/** A custom format code is a date if it has date/time tokens outside quotes, brackets and escapes. */
export function isDateFormat(code: string): boolean {
  const bare = code
    .replace(/"[^"]*"/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\\./g, "")
    .replace(/_.|\*./g, "");
  return /[dmyhs]/i.test(bare) && !/^[#0.,%\s]*$/.test(bare);
}

/** For each cell style index, whether it shows numbers as dates. */
function dateStyles(stylesXml: string | undefined): boolean[] {
  if (!stylesXml) return [];
  const custom = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*>/g)) {
    const id = Number(attr(m[0], "numFmtId"));
    const code = attr(m[0], "formatCode");
    if (Number.isInteger(id) && code !== undefined) custom.set(id, decodeXml(code));
  }
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? "";
  return [...xfs.matchAll(/<xf\b[^>]*>/g)].map((m) => {
    const id = Number(attr(m[0], "numFmtId") ?? 0);
    const code = custom.get(id);
    return code !== undefined ? isDateFormat(code) : BUILTIN_DATE_FORMATS.has(id);
  });
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/**
 * An Excel serial date as ISO text, in UTC so the result never depends on the
 * machine's time zone. Whole days → "YYYY-MM-DD"; with a time → "YYYY-MM-DD HH:MM[:SS]".
 * Serial 60 is Excel's phantom 29 Feb 1900; days before it are shifted to match.
 */
export function serialToIso(serial: number, date1904: boolean): string {
  // Round to the second first, so 23:59:59.6 becomes midnight of the next day, not "24:00".
  const total = Math.round(serial * 86_400);
  const days = Math.floor(total / 86_400);
  const seconds = total - days * 86_400;
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const shifted = !date1904 && days < 61 ? days + 1 : days;
  const d = new Date(epoch + shifted * 86_400_000);
  const date = `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (seconds === 0) return date;
  const hh = Math.floor(seconds / 3600);
  const mm = Math.floor((seconds % 3600) / 60);
  const ss = seconds % 60;
  return `${date} ${pad(hh)}:${pad(mm)}${ss ? `:${pad(ss)}` : ""}`;
}

/** A stored number as Excel would show it in General format, minus float noise (0.1 + 0.2). */
export function numberText(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(Number(n.toPrecision(15)));
}

/** Path of the first worksheet, from the workbook and its relationships. */
function firstSheetPath(files: Record<string, Uint8Array>): string {
  const workbook = files["xl/workbook.xml"];
  const rels = files["xl/_rels/workbook.xml.rels"];
  if (workbook && rels) {
    const sheet = /<sheet\b[^>]*>/.exec(strFromU8(workbook))?.[0];
    const rid = sheet && (attr(sheet, "r:id") ?? attr(sheet, "id"));
    for (const m of strFromU8(rels).matchAll(/<Relationship\b[^>]*>/g)) {
      if (attr(m[0], "Id") !== rid) continue;
      const target = attr(m[0], "Target") ?? "";
      const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
      if (files[path]) return path;
    }
  }
  if (files["xl/worksheets/sheet1.xml"]) return "xl/worksheets/sheet1.xml";
  throw new XlsxError("xlsx_invalid");
}

export function readXlsx(bytes: Uint8Array): XlsxSheet {
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (
          !/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(
            f.name,
          )
        ) {
          return false;
        }
        total += f.originalSize;
        if (total > MAX_XLSX_BYTES) throw new XlsxError("xlsx_too_large");
        return true;
      },
    });
  } catch (e) {
    throw e instanceof XlsxError ? e : new XlsxError("xlsx_invalid");
  }

  const workbook = files["xl/workbook.xml"] ? strFromU8(files["xl/workbook.xml"]) : "";
  const date1904 = /<workbookPr\b[^>]*\sdate1904="(1|true)"/.test(workbook);
  const shared = files["xl/sharedStrings.xml"]
    ? [...strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((m) =>
        stringItemText(m[1] ?? ""),
      )
    : [];
  const isDate = dateStyles(files["xl/styles.xml"] ? strFromU8(files["xl/styles.xml"]) : undefined);
  const sheet = strFromU8(files[firstSheetPath(files)]!);

  const grid: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(attr(rowMatch[0], "r") ?? grid.length + 1) - 1;
    if (!Number.isInteger(r) || r < 0 || r > 2_000_000) throw new XlsxError("xlsx_invalid");
    const row: string[] = [];
    for (const c of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const open = `<c${c[1]}>`;
      const ref = attr(open, "r");
      const col = ref ? columnIndex(ref) : row.length;
      if (col < 0 || col > 16_383) throw new XlsxError("xlsx_invalid");
      const body = c[2] ?? "";
      const type = attr(open, "t") ?? "n";
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let text = "";
      if (type === "s") text = shared[Number(v)] ?? "";
      else if (type === "inlineStr") text = stringItemText(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? "");
      else if (type === "b") text = v === "1" ? "TRUE" : v === "0" ? "FALSE" : "";
      else if (v === undefined) text = "";
      else if (type === "str" || type === "e") text = decodeXml(v);
      else if (type === "d") text = decodeXml(v).replace(/T00:00:00(\.0+)?Z?$/, "");
      else {
        const style = Number(attr(open, "s") ?? 0);
        const n = Number(v);
        text = isDate[style] && Number.isFinite(n) && n >= 0 ? serialToIso(n, date1904) : numberText(v);
      }
      while (row.length < col) row.push("");
      row[col] = text;
    }
    while (grid.length < r) grid.push([]);
    grid[r] = row;
  }

  // The header row is the first row with anything in it; trailing empty rows are dropped.
  const start = grid.findIndex((row) => row.some((v) => v.trim() !== ""));
  if (start < 0) throw new XlsxError("xlsx_empty");
  const end = grid.length;
  // Blank rows in between are skipped, as the CSV parser does.
  const body = grid
    .slice(start, end)
    .filter((row, i) => i === 0 || row.some((v) => v.trim() !== ""))
    .map((row) => row.slice());
  const width = Math.max(...body.map((row) => row.length));
  for (const row of body) while (row.length < width) row.push("");
  // Drop trailing columns that are empty everywhere, header included (Excel often stores formatting there).
  let cols = width;
  while (cols > 1 && body.every((row) => row[cols - 1]!.trim() === "")) cols--;
  const [headers, ...rows] = body.map((row) => row.slice(0, cols));
  return { headers: headers!.map((h) => h.trim()), rows };
}
