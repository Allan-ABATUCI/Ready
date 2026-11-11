import "client-only";

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

/** ISO 8601 calendar dates (YYYY-MM-DD) only for now; locale formats come with rule packs. */
export function isIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= daysInMonth;
}
