import "client-only";
import { CRMS, type Crm } from "@/lib/rule-packs/types";
import { KEY_COLUMNS, type ColumnRoles } from "./columns";
import type { DateOrder } from "./dates";
import { DEFAULT_EXPORT_OPTIONS, type ExportOptions } from "./export-table";
import type { Decisions, PairDecision } from "./merge";
import type { Overrides } from "./overrides";
import { PHONE_COUNTRIES, type CountryCode } from "./phone";
import type { AnalysisInputs, CsvEncoding, ParsedCsv, ProcessResult } from "./types";

/**
 * A saved session: the file as loaded plus everything the user did to it. It
 * holds customer data, so it is only ever written to a file the user downloads
 * on purpose, and read back from one they drop in. Never stored by the app, and
 * never sent anywhere (CLAUDE.md).
 *
 * Duplicate pairs are not saved: they are recomputed on resume. Matching is
 * deterministic, so the same file and inputs give the same pairs, and the
 * saved decisions (keyed by pair) still apply.
 */
export const SESSION_FORMAT = "ready-session";
export const SESSION_VERSION = 1;
export const SESSION_EXTENSION = ".ready.json";

export const STEP_IDS = ["upload", "fix", "review", "export"] as const;
export type SessionStep = (typeof STEP_IDS)[number];

export interface Session {
  format: typeof SESSION_FORMAT;
  version: typeof SESSION_VERSION;
  fileName: string;
  parsed: ParsedCsv;
  inputs: AnalysisInputs;
  overrides: Overrides;
  decisions: Decisions;
  crm: Crm | null;
  exportOptions: ExportOptions;
  step: SessionStep;
}

export interface SessionState {
  fileName: string | null;
  result: ProcessResult;
  overrides: Overrides;
  decisions: Decisions;
  crm: Crm | null;
  exportOptions: ExportOptions;
  step: SessionStep;
}

export function buildSession(s: SessionState): Session {
  const { headers, rows, delimiter, hadBom, encoding, issues, sources } = s.result.parsed;
  return {
    format: SESSION_FORMAT,
    version: SESSION_VERSION,
    fileName: s.fileName ?? "contacts.csv",
    parsed: { headers, rows, delimiter, hadBom, encoding, issues, ...(sources && { sources }) },
    inputs: { roles: s.result.roles, dateOrder: s.result.dateOrder, defaultCountry: s.result.defaultCountry },
    overrides: s.overrides,
    decisions: s.decisions,
    crm: s.crm,
    exportOptions: s.exportOptions,
    step: s.step === "upload" ? "fix" : s.step,
  };
}

/** "contacts.csv" → "contacts.ready.json". */
export function sessionFileName(fileName: string | null): string {
  const base = (fileName ?? "contacts").replace(/\.[^./\\]+$/, "") || "contacts";
  return `${base}${SESSION_EXTENSION}`;
}

export function isSessionFileName(name: string): boolean {
  return name.toLowerCase().endsWith(".json");
}

/** Thrown for anything that isn't a session this version can read. Carries a code only, never content. */
export class SessionError extends Error {
  constructor(public readonly code: "session_invalid" | "session_version") {
    super(code);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const isIndex = (v: unknown, below: number): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) < below;
const ENCODINGS: CsvEncoding[] = ["utf-8", "windows-1252"];
const DATE_ORDERS: DateOrder[] = ["dmy", "mdy", "ymd"];
const COUNTRIES = new Set<string>(PHONE_COUNTRIES.map((c) => c.code));

function invalid(): never {
  throw new SessionError("session_invalid");
}

/**
 * Read and check a session file's text. Strict: anything unexpected is
 * rejected rather than half-restored, since a wrong restore is worse than none.
 */
export function parseSession(text: string): Session {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    invalid();
  }
  if (!isObject(raw) || raw.format !== SESSION_FORMAT) invalid();
  if (raw.version !== SESSION_VERSION) throw new SessionError("session_version");

  const { parsed, inputs, overrides, decisions, crm, exportOptions, step, fileName } = raw;
  if (typeof fileName !== "string") invalid();

  if (!isObject(parsed) || !isStringArray(parsed.headers) || !Array.isArray(parsed.rows)) invalid();
  if (!parsed.rows.every(isStringArray)) invalid();
  if (typeof parsed.delimiter !== "string" || typeof parsed.hadBom !== "boolean") invalid();
  if (!ENCODINGS.includes(parsed.encoding as CsvEncoding)) invalid();
  if (!Array.isArray(parsed.issues)) invalid();
  for (const issue of parsed.issues) {
    if (!isObject(issue) || typeof issue.code !== "string" || (issue.row !== null && !Number.isInteger(issue.row))) {
      invalid();
    }
  }
  const width = parsed.headers.length;
  const height = parsed.rows.length;
  // Optional: only sessions of combined files have it. Older sessions read as before.
  const { sources } = parsed;
  if (sources !== undefined) {
    if (!isObject(sources) || !isStringArray(sources.files) || !Array.isArray(sources.starts)) invalid();
    const { files, starts } = sources;
    if (files.length === 0 || starts.length !== files.length || starts[0] !== 0) invalid();
    if (!starts.every((s, i) => Number.isInteger(s) && s <= height && (i === 0 || s >= starts[i - 1]))) invalid();
  }

  if (!isObject(inputs) || !isObject(inputs.roles)) invalid();
  const roles: ColumnRoles = {};
  for (const [key, col] of Object.entries(inputs.roles)) {
    if (!(KEY_COLUMNS as string[]).includes(key) || !isIndex(col, width)) invalid();
    roles[key as keyof ColumnRoles] = col;
  }
  if (inputs.dateOrder !== null && !DATE_ORDERS.includes(inputs.dateOrder as DateOrder)) invalid();
  if (inputs.defaultCountry !== null && !COUNTRIES.has(inputs.defaultCountry as string)) invalid();

  if (!isObject(overrides)) invalid();
  for (const [key, value] of Object.entries(overrides)) {
    const [row, col, extra] = key.split(":").map(Number);
    if (extra !== undefined || !isIndex(row, height) || !isIndex(col, width) || typeof value !== "string") invalid();
  }

  if (!isObject(decisions)) invalid();
  for (const [key, d] of Object.entries(decisions)) {
    const [a, b, extra] = key.split(":").map(Number);
    if (extra !== undefined || !isIndex(a, height) || !isIndex(b, height) || a! >= b!) invalid();
    if (!isObject(d) || (d.action !== "merge" && d.action !== "keep_both") || !isObject(d.fields)) invalid();
    for (const [col, side] of Object.entries(d.fields)) {
      if (!isIndex(Number(col), width) || (side !== "a" && side !== "b")) invalid();
    }
  }

  if (crm !== null && !CRMS.includes(crm as Crm)) invalid();
  if (!isObject(exportOptions)) invalid();
  const options = { ...DEFAULT_EXPORT_OPTIONS };
  for (const key of Object.keys(DEFAULT_EXPORT_OPTIONS) as (keyof ExportOptions)[]) {
    const v = exportOptions[key];
    if (v !== undefined && typeof v !== "boolean") invalid();
    if (typeof v === "boolean") options[key] = v;
  }
  if (!STEP_IDS.includes(step as SessionStep)) invalid();

  return {
    format: SESSION_FORMAT,
    version: SESSION_VERSION,
    fileName,
    parsed: {
      headers: parsed.headers,
      rows: parsed.rows as string[][],
      delimiter: parsed.delimiter,
      hadBom: parsed.hadBom,
      encoding: parsed.encoding as CsvEncoding,
      issues: (parsed.issues as Record<string, unknown>[]).map((i) => ({
        row: i.row as number | null,
        code: i.code as string,
      })),
      ...(sources !== undefined && {
        sources: { files: sources.files as string[], starts: sources.starts as number[] },
      }),
    },
    inputs: {
      roles,
      dateOrder: inputs.dateOrder as DateOrder | null,
      defaultCountry: inputs.defaultCountry as CountryCode | null,
    },
    overrides: overrides as Overrides,
    decisions: decisions as Record<string, PairDecision>,
    crm: crm as Crm | null,
    exportOptions: options,
    step: step as SessionStep,
  };
}

/** A session rebuilt by `restoreSession` (see session-restore.ts, run in the worker). */
export type RestoredSession = SessionState;
