import "client-only";

/** How day-first, month-first and year-first dates are written. */
export type DateOrder = "dmy" | "mdy" | "ymd";

/**
 * Three ASCII-digit groups with one repeated separator. ASCII only (not `\d` with
 * the `u` flag): other scripts' digits would need a conversion we don't do, so
 * they are rejected rather than half-parsed. Anything after the date, such as a
 * time ("31/12/2024 14:30"), fails the match: dropping the time silently would
 * lose data, so those values are left as they are and flagged instead.
 */
const DATE_RE = /^([0-9]{1,4})([/.-])([0-9]{1,2})\2([0-9]{1,4})$/;

function isLeapYear(y: number): boolean {
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Arithmetic rather than `Date`, which maps years 0–99 to 1900–1999. */
export function isCalendarDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const days = m === 2 && isLeapYear(y) ? 29 : DAYS_IN_MONTH[m - 1]!;
  return d <= days;
}

function iso(y: string, m: string, d: string): string | null {
  if (!isCalendarDate(Number(y), Number(m), Number(d))) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * The ISO date (`YYYY-MM-DD`) that `value` means when written in `order`, or null.
 *
 * - A leading 4-digit year is read as year/month/day under every order: it can
 *   only mean one thing, so an ISO date in a day-first column is not an error.
 * - Two-digit years return null: "24" could be 1924 or 2024, and guessing the
 *   century would silently change data.
 */
export function parseDate(value: string, order: DateOrder): string | null {
  const m = DATE_RE.exec(value.trim());
  if (!m) return null;
  const [, first, , second, third] = m as unknown as [string, string, string, string, string];
  if (first.length === 4) return third.length <= 2 ? iso(first, second, third) : null;
  if (order === "ymd" || first.length > 2 || third.length !== 4) return null;
  return order === "dmy" ? iso(third, second, first) : iso(third, first, second);
}

/** What a cell means once a date order is (or isn't) known. */
export type DateReading = { kind: "date"; iso: string } | { kind: "ambiguous" } | { kind: "invalid" };

/**
 * Read `value` with the chosen order. With no order, a value that only fits one
 * order ("31/12/2024") or reads the same either way ("05/05/2024") is still a
 * date; one that fits both differently ("01/02/2024") is ambiguous.
 */
export function readDate(value: string, order: DateOrder | null): DateReading {
  if (order !== null) {
    const date = parseDate(value, order);
    return date === null ? { kind: "invalid" } : { kind: "date", iso: date };
  }
  const dmy = parseDate(value, "dmy");
  const mdy = parseDate(value, "mdy");
  if (dmy !== null && mdy !== null && dmy !== mdy) return { kind: "ambiguous" };
  const date = dmy ?? mdy;
  return date === null ? { kind: "invalid" } : { kind: "date", iso: date };
}

/** True if `value` is a date in at least one order. */
export function looksLikeDate(value: string): boolean {
  return readDate(value, null).kind !== "invalid";
}

/**
 * The order the values are written in, or null if they don't say.
 *
 * Only a value that parses one way settles it ("31/12/2024" is day-first). Values
 * that settle it both ways conflict, so the answer is null and the user decides.
 * Year-first values fit every order, so they decide only when nothing else is
 * written as a date. Depends only on the values, never on their order or the locale.
 */
export function detectDateOrder(values: Iterable<string>): DateOrder | null {
  let dmyOnly = false;
  let mdyOnly = false;
  let ambiguous = false;
  let yearFirst = false;
  for (const v of values) {
    if (parseDate(v, "ymd") !== null) {
      yearFirst = true;
      continue;
    }
    const dmy = parseDate(v, "dmy");
    const mdy = parseDate(v, "mdy");
    if (dmy !== null && mdy === null) dmyOnly = true;
    else if (mdy !== null && dmy === null) mdyOnly = true;
    // "05/05/2024" reads the same either way, so it says nothing about the order.
    else if (dmy !== mdy) ambiguous = true;
  }
  if (dmyOnly !== mdyOnly) return dmyOnly ? "dmy" : "mdy";
  if (dmyOnly || ambiguous) return null;
  return yearFirst ? "ymd" : null;
}
