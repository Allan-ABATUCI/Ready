import "client-only";
import { token_sort_ratio, ratio, type FuzzballBaseOptions } from "fuzzball";
import { detectKeyColumns } from "./columns";
import type { DuplicateCandidate, MatchField, ParsedCsv } from "./types";
import { isValidEmail, normalizeEmail, normalizePhone } from "./validate";

/**
 * Fuzzball options chosen for determinism and unicode support:
 * - force_ascii: false keeps "Zoë" from collapsing to "Zo".
 * - useCollator is NOT enabled: Intl.Collator is locale-dependent, which would
 *   make results differ between machines.
 */
const FUZZ: FuzzballBaseOptions = { full_process: true, force_ascii: false, astral: true, normalize: true };

export const NAME_THRESHOLD = 90;
export const COMPANY_THRESHOLD = 85;

interface Keyed {
  email: string;
  phone: string;
  name: string;
  company: string;
}

function keyRows(parsed: ParsedCsv): Keyed[] {
  const cols = detectKeyColumns(parsed.headers);
  const cell = (row: string[], idx: number | undefined) => (idx === undefined ? "" : (row[idx] ?? "").trim());

  return parsed.rows.map((row) => {
    const email = cell(row, cols.email);
    const phone = normalizePhone(cell(row, cols.phone));
    const name =
      cols.name !== undefined
        ? cell(row, cols.name)
        : [cell(row, cols.firstName), cell(row, cols.lastName)].filter(Boolean).join(" ");
    return {
      email: isValidEmail(email) ? normalizeEmail(email) : "",
      phone: phone.replace("+", "").length >= 7 ? phone : "",
      name: name.normalize("NFC"),
      company: cell(row, cols.company).normalize("NFC"),
    };
  });
}

/**
 * Pairwise duplicate detection. O(n²) — fine for the skeleton; blocking/indexing
 * comes later. Output order is fully deterministic: score desc, then a, then b.
 */
export function findDuplicateCandidates(parsed: ParsedCsv): DuplicateCandidate[] {
  const rows = keyRows(parsed);
  const out: DuplicateCandidate[] = [];

  for (let a = 0; a < rows.length; a++) {
    for (let b = a + 1; b < rows.length; b++) {
      const ra = rows[a]!;
      const rb = rows[b]!;
      const matchedOn: MatchField[] = [];
      let score = 0;

      if (ra.email && ra.email === rb.email) {
        matchedOn.push("email");
        score = 100;
      }
      if (ra.phone && ra.phone === rb.phone) {
        matchedOn.push("phone");
        score = 100;
      }
      if (ra.name && rb.name) {
        const nameScore = token_sort_ratio(ra.name, rb.name, FUZZ);
        const companyScore = ra.company && rb.company ? ratio(ra.company, rb.company, FUZZ) : null;
        const companyOk = companyScore === null || companyScore >= COMPANY_THRESHOLD;
        if (nameScore >= NAME_THRESHOLD && companyOk) {
          matchedOn.push("name");
          if (companyScore !== null) matchedOn.push("company");
          score = Math.max(score, companyScore === null ? nameScore : Math.min(nameScore, companyScore));
        }
      }

      if (matchedOn.length > 0) out.push({ a, b, score, matchedOn });
    }
  }

  return out.sort((x, y) => y.score - x.score || x.a - y.a || x.b - y.b);
}
