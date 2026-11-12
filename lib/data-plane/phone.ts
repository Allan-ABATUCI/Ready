import "client-only";
// The "min" build: bundled metadata (~80 kB), no network access, enough to parse and validate.
import { getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

export type { CountryCode };

/**
 * Countries offered as the default for national numbers, in display order.
 * A short fixed list in English (no Intl.DisplayNames, whose output depends on
 * the browser) covering the markets the CRMs serve; add more as needed.
 */
const COUNTRY_NAMES: [CountryCode, string][] = [
  ["US", "United States"],
  ["CA", "Canada"],
  ["GB", "United Kingdom"],
  ["IE", "Ireland"],
  ["FR", "France"],
  ["BE", "Belgium"],
  ["CH", "Switzerland"],
  ["DE", "Germany"],
  ["AT", "Austria"],
  ["NL", "Netherlands"],
  ["ES", "Spain"],
  ["PT", "Portugal"],
  ["IT", "Italy"],
  ["AU", "Australia"],
  ["NZ", "New Zealand"],
  ["JP", "Japan"],
  ["IN", "India"],
  ["BR", "Brazil"],
  ["MX", "Mexico"],
];

export const PHONE_COUNTRIES: { code: CountryCode; label: string }[] = COUNTRY_NAMES.map(([code, name]) => ({
  code,
  label: `${name} (+${getCountryCallingCode(code)})`,
}));

/**
 * A phone number in international E.164 form ("+33612345678"), or null when it
 * can't be made one, in which case the caller keeps the original value.
 *
 * - "+…" and "00…" numbers carry their own country code.
 * - National numbers ("06 12 34 56 78") need `defaultCountry`; without one
 *   they return null rather than guess.
 * - Numbers with an extension return null: E.164 has no room for it, and
 *   dropping it would lose data.
 *
 * Pure: the result depends only on the arguments.
 */
export function toE164(value: string, defaultCountry: CountryCode | null): string | null {
  const v = value.trim();
  if (v === "") return null;
  // "00" is the international prefix in most of the world. libphonenumber only
  // reads it with a country context, so rewrite it as "+" up front.
  const international = v.startsWith("+") ? v : v.startsWith("00") ? `+${v.slice(2)}` : null;
  if (international === null && defaultCountry === null) return null;
  const parsed =
    international !== null ? parsePhoneNumberFromString(international) : parsePhoneNumberFromString(v, defaultCountry!);
  return parsed?.isValid() && !parsed.ext ? parsed.number : null;
}
