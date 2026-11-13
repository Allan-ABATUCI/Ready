import "client-only";
import type { FieldFormat } from "@/lib/rule-packs/types";
import { isCalendarDate } from "./dates";

// Deliberately simple and local. No verification services — see CLAUDE.md.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/u;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Digits only, keeping a leading "+" if present. Formatting characters are dropped. */
export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/** E.164 allows at most 15 digits; anything under 7 is not a dialable number. */
export function isValidPhone(value: string): boolean {
  if (!/^[\d\s()+.\-/]+$/.test(value.trim())) return false;
  const digits = normalizePhone(value).replace("+", "");
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Strict ISO 8601 calendar dates (YYYY-MM-DD). Used for rule-pack checks on the
 * export, which writes dates in this form; local formats are read by `dates.ts`.
 */
export function isIsoDate(value: string): boolean {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value.trim());
  return m !== null && isCalendarDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** The single format → validator table shared by issue detection and rule-pack checks. */
export const FORMAT_VALIDATORS: Record<FieldFormat, (value: string) => boolean> = {
  email: isValidEmail,
  phone: isValidPhone,
  date: isIsoDate,
};
