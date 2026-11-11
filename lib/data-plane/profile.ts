import "client-only";
import type { ColumnProfile, ParsedCsv, ValuePattern } from "./types";
import { isIsoDate, isValidEmail, isValidPhone } from "./validate";

const NUMBER_RE = /^-?\d+([.,]\d+)?$/;

function classify(value: string): Exclude<ValuePattern, "empty"> {
  if (isValidEmail(value)) return "email";
  if (isIsoDate(value)) return "date";
  if (NUMBER_RE.test(value)) return "number";
  if (isValidPhone(value)) return "phone";
  return "text";
}

const PATTERN_ORDER: Exclude<ValuePattern, "empty">[] = ["email", "phone", "date", "number", "text"];

export function profileColumns(parsed: ParsedCsv): ColumnProfile[] {
  const total = parsed.rows.length;
  return parsed.headers.map((header, index) => {
    const counts = new Map<Exclude<ValuePattern, "empty">, number>();
    const distinct = new Set<string>();
    let filled = 0;

    for (const row of parsed.rows) {
      const value = (row[index] ?? "").trim();
      if (value === "") continue;
      filled++;
      distinct.add(value);
      const p = classify(value);
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }

    // Majority pattern; ties broken by fixed order for determinism.
    let pattern: ValuePattern = "empty";
    let best = 0;
    for (const p of PATTERN_ORDER) {
      const c = counts.get(p) ?? 0;
      if (c > best) {
        best = c;
        pattern = p;
      }
    }

    return { index, header, filled, fillRate: total === 0 ? 0 : filled / total, distinct: distinct.size, pattern };
  });
}
