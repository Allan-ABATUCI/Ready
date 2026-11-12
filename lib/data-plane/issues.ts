import "client-only";
import type { FieldFormat } from "@/lib/rule-packs/types";
import { detectKeyColumns, type KeyColumn } from "./columns";
import type { CellIssue, CellIssueCode, ColumnProfile, ParsedCsv } from "./types";
import { FORMAT_VALIDATORS } from "./validate";

const FORMAT_ISSUE: Record<FieldFormat, CellIssueCode> = {
  email: "invalid_email",
  phone: "invalid_phone",
  date: "invalid_date",
};

/** Columns holding proper nouns, where ALL CAPS / all lower is itself a problem. */
const PROPER_NOUN_KEYS: KeyColumn[] = ["name", "firstName", "lastName", "company"];

const HAS_LETTER = /\p{L}/u;

/** Plain (non-locale) case functions keep results identical on every machine. */
function isAllUpper(v: string): boolean {
  return v === v.toUpperCase() && v !== v.toLowerCase();
}
function isAllLower(v: string): boolean {
  return v === v.toLowerCase() && v !== v.toUpperCase();
}

/** True for values with at least two letters that are entirely upper or lower case. */
export function isSingleCase(v: string): boolean {
  const letters = Array.from(v).filter((c) => HAS_LETTER.test(c));
  return letters.length >= 2 && (isAllUpper(v) || isAllLower(v));
}

/** "ZOË o'BRIEN-SMITH" → "Zoë O'Brien-Smith". Deterministic, locale-independent. */
export function titleCase(v: string): string {
  let out = "";
  let startOfWord = true;
  for (const ch of Array.from(v.toLowerCase())) {
    if (HAS_LETTER.test(ch)) {
      out += startOfWord ? ch.toUpperCase() : ch;
      startOfWord = false;
    } else {
      out += ch;
      startOfWord = /[\s\-'’]/u.test(ch);
    }
  }
  return out;
}

function formatColumns(parsed: ParsedCsv, profile: ColumnProfile[]): Map<number, FieldFormat> {
  const keys = detectKeyColumns(parsed.headers);
  const out = new Map<number, FieldFormat>();
  if (keys.email !== undefined) out.set(keys.email, "email");
  if (keys.phone !== undefined) out.set(keys.phone, "phone");
  for (const c of profile) {
    if (!out.has(c.index) && (c.pattern === "email" || c.pattern === "phone" || c.pattern === "date")) {
      out.set(c.index, c.pattern);
    }
  }
  return out;
}

interface Variant {
  value: string;
  count: number;
  firstRow: number;
}

/** Most frequent variant; ties go to the one seen first. */
function pickCanonical(variants: Variant[]): Variant {
  return variants.reduce((best, v) =>
    v.count > best.count || (v.count === best.count && v.firstRow < best.firstRow) ? v : best,
  );
}

function caseIssues(parsed: ParsedCsv, col: number, properNoun: boolean): CellIssue[] {
  // Group by a case-insensitive key; Map iteration follows insertion (row) order.
  const groups = new Map<string, Map<string, Variant>>();
  parsed.rows.forEach((row, r) => {
    const value = (row[col] ?? "").trim().normalize("NFC");
    if (value === "" || !HAS_LETTER.test(value)) return;
    const key = value.toLowerCase();
    let variants = groups.get(key);
    if (!variants) groups.set(key, (variants = new Map()));
    const v = variants.get(value);
    if (v) v.count++;
    else variants.set(value, { value, count: 1, firstRow: r });
  });

  const canonical = new Map<string, string>();
  for (const [key, variants] of groups) {
    const all = [...variants.values()];
    if (properNoun) {
      const wellCased = all.filter((v) => !isSingleCase(v.value));
      canonical.set(key, wellCased.length > 0 ? pickCanonical(wellCased).value : titleCase(pickCanonical(all).value));
    } else if (all.length > 1) {
      canonical.set(key, pickCanonical(all).value);
    }
  }

  const out: CellIssue[] = [];
  parsed.rows.forEach((row, r) => {
    const value = (row[col] ?? "").trim().normalize("NFC");
    const target = canonical.get(value.toLowerCase());
    if (target !== undefined && value !== target) {
      out.push({ row: r, col, code: "inconsistent_case", suggestion: target });
    }
  });
  return out;
}

/**
 * Per-cell problems: malformed emails / phones / dates and inconsistent
 * capitalization. Pure and deterministic; output sorted by row, column, code.
 */
export function findCellIssues(parsed: ParsedCsv, profile: ColumnProfile[]): CellIssue[] {
  const issues: CellIssue[] = [];
  const formats = formatColumns(parsed, profile);

  for (const [col, format] of formats) {
    const valid = FORMAT_VALIDATORS[format];
    parsed.rows.forEach((row, r) => {
      const value = (row[col] ?? "").trim();
      if (value !== "" && !valid(value)) issues.push({ row: r, col, code: FORMAT_ISSUE[format] });
    });
  }

  const keys = detectKeyColumns(parsed.headers);
  const properNounCols = new Set(PROPER_NOUN_KEYS.map((k) => keys[k]).filter((i) => i !== undefined));
  for (const c of profile) {
    const properNoun = properNounCols.has(c.index);
    if (formats.has(c.index) || (!properNoun && c.pattern !== "text")) continue;
    issues.push(...caseIssues(parsed, c.index, properNoun));
  }

  return issues.sort((a, b) => a.row - b.row || a.col - b.col || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}
