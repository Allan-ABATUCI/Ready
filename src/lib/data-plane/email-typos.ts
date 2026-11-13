import "client-only";

/**
 * Common consumer mail domains that typos are corrected towards. Bundled and
 * fixed: domains are never looked up over the network (CLAUDE.md). Order
 * matters only for ties, which go to the earlier entry.
 */
export const COMMON_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.fr",
  "outlook.de",
  "outlook.es",
  "outlook.it",
  "hotmail.com",
  "hotmail.co.uk",
  "hotmail.fr",
  "hotmail.de",
  "hotmail.es",
  "hotmail.it",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.fr",
  "yahoo.de",
  "yahoo.es",
  "yahoo.it",
  "yahoo.ca",
  "yahoo.com.au",
  "icloud.com",
];

/**
 * Real domains that are within an edit or two of a common one ("ymail.com" is
 * one letter from "gmail.com"). Never flagged, so their users aren't told to
 * change a correct address.
 */
const LOOKALIKE_DOMAINS = new Set([
  "ymail.com",
  "mail.com",
  "email.com",
  "gmx.com",
  "gmx.de",
  "gmx.fr",
  "gmx.net",
  "live.com",
  "live.fr",
  "live.de",
  "live.co.uk",
  "msn.com",
  "me.com",
  "mac.com",
  "aol.com",
  "aol.fr",
  "web.de",
  "free.fr",
  "orange.fr",
  "sfr.fr",
  "laposte.net",
  "proton.me",
  "protonmail.com",
  "hotmail.ca",
  "yahoo.co.jp",
  "yahoo.co.in",
]);

const KNOWN = new Set(COMMON_EMAIL_DOMAINS);

/**
 * Optimal string alignment distance: insertions, deletions, substitutions and
 * swaps of adjacent characters each cost 1, so "gmial" is 1 from "gmail".
 * Works on code points, so "é" counts as one character.
 */
export function editDistance(a: string, b: string): number {
  const s = Array.from(a);
  const t = Array.from(b);
  // Three rolling rows: the swap rule looks two rows back.
  let prev2: number[] = [];
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      let d = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) d = Math.min(d, prev2[j - 2]! + 1);
      cur.push(d);
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[t.length]!;
}

/**
 * Short domains get one edit, longer ones two: on a short domain, two edits
 * reach too many real, unrelated domains.
 */
function maxEdits(domain: string): number {
  return Array.from(domain).length >= 10 ? 2 : 1;
}

/**
 * The address with its domain corrected, when the domain is one or two edits
 * from a common mail domain ("avery@gmial.com" → "avery@gmail.com"); else null.
 * The local part is kept exactly as written. Pure and locale-independent.
 */
export function suggestEmailFix(email: string): string | null {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return null;
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (KNOWN.has(domain) || LOOKALIKE_DOMAINS.has(domain)) return null;

  let best: string | null = null;
  let bestDistance = maxEdits(domain) + 1;
  for (const candidate of COMMON_EMAIL_DOMAINS) {
    const d = editDistance(domain, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best === null ? null : `${trimmed.slice(0, at)}@${best}`;
}
