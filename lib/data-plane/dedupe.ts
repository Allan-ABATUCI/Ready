import "client-only";
import { token_sort_ratio, ratio, type FuzzballBaseOptions } from "fuzzball";
import { groupBy } from "@/lib/group";
import type { ColumnRoles } from "./columns";
import { joinName } from "./names";
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

/**
 * Largest block compared pairwise. Bigger exact blocks are linked as a star;
 * bigger name blocks are skipped (see `findDuplicateCandidates`). Bounds the
 * worst case at roughly n × MAX_BLOCK comparisons.
 */
export const MAX_BLOCK = 200;

export interface Keyed {
  email: string;
  phone: string;
  name: string;
  company: string;
}

export interface DuplicateMatches {
  candidates: DuplicateCandidate[];
  /** Rows in name blocks bigger than MAX_BLOCK, which were not compared by name. A count only. */
  skippedLargeBlocks: number;
}

export function keyRows(parsed: ParsedCsv, cols: ColumnRoles): Keyed[] {
  const cell = (row: string[], idx: number | undefined) => (idx === undefined ? "" : (row[idx] ?? "").trim());

  return parsed.rows.map((row) => {
    const email = cell(row, cols.email);
    // Digits only, so "+33 6…" and "06…" don't match. toE164 (phone.ts) could
    // unify them, but only with a default country, which dedupe doesn't have yet.
    const phone = normalizePhone(cell(row, cols.phone));
    const name =
      cols.name !== undefined ? cell(row, cols.name) : joinName(cell(row, cols.firstName), cell(row, cols.lastName));
    return {
      email: isValidEmail(email) ? normalizeEmail(email) : "",
      phone: phone.replace("+", "").length >= 7 ? phone : "",
      name: name.normalize("NFC"),
      company: cell(row, cols.company).normalize("NFC"),
    };
  });
}

/** Score one pair of rows; null when they don't match on anything. */
export function scorePair(ra: Keyed, rb: Keyed): Omit<DuplicateCandidate, "a" | "b"> | null {
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

  return matchedOn.length > 0 ? { score, matchedOn } : null;
}

/**
 * "Zoë Müller", "zoe muller" and "Muller Zoe" → "mul zoe": accents folded,
 * lowercased, first 3 characters of each token, tokens sorted. Sorting mirrors
 * token_sort_ratio, so reordered names still land in the same block.
 *
 * Trade-off: a typo within a token's first 3 characters ("Zeo" vs "Zoe") puts
 * the rows in different blocks, so that pair is no longer compared by name.
 * Typos later in the token are still caught by the fuzzy score.
 */
export function nameSignature(name: string): string {
  const tokens = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  // Initials alone ("J. K.") would otherwise give no block and never match at all.
  const long = tokens.filter((t) => t.length >= 2);
  const parts = (long.length > 0 ? long : tokens).map((t) => t.slice(0, 3));
  return parts.sort().join(" ");
}

function blockKeys(r: Keyed): string[] {
  const keys: string[] = [];
  if (r.email) keys.push(`e:${r.email}`);
  if (r.phone) keys.push(`p:${r.phone}`);
  const sig = r.name ? nameSignature(r.name) : "";
  if (sig) keys.push(`n:${sig}`);
  return keys;
}

/**
 * Duplicate detection with blocking: only rows sharing an exact email, an exact
 * phone or a name signature are scored, with the same `scorePair` as a full
 * pairwise scan. Output order is fully deterministic: score desc, then a, then b.
 */
export function findDuplicateCandidates(parsed: ParsedCsv, roles: ColumnRoles): DuplicateMatches {
  const rows = keyRows(parsed, roles);
  const n = rows.length;

  const entries = rows.flatMap((r, row) => blockKeys(r).map((key) => ({ key, row })));
  const blocks = groupBy(entries, (e) => e.key)
    // Plain string comparison (not localeCompare) keeps the order identical on every machine.
    .sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));

  // Pairs encoded as a * n + b (a < b) so a row pair sharing several blocks is scored once.
  const pairs = new Set<number>();
  let skippedLargeBlocks = 0;
  for (const { key, items } of blocks) {
    const members = items.map((e) => e.row); // ascending, since groupBy keeps input order
    if (members.length < 2) continue;
    if (members.length > MAX_BLOCK) {
      if (key.startsWith("n:")) {
        // A very common name: comparing every pair is too slow and mostly noise.
        skippedLargeBlocks += members.length;
      } else {
        // Same email/phone: linking each row to the first is enough, because
        // applyDecisions merges transitively.
        for (let i = 1; i < members.length; i++) pairs.add(members[0]! * n + members[i]!);
      }
      continue;
    }
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) pairs.add(members[i]! * n + members[j]!);
    }
  }

  const candidates: DuplicateCandidate[] = [];
  for (const p of pairs) {
    const a = Math.floor(p / n);
    const b = p % n;
    const match = scorePair(rows[a]!, rows[b]!);
    if (match) candidates.push({ a, b, ...match });
  }

  candidates.sort((x, y) => y.score - x.score || x.a - y.a || x.b - y.b);
  return { candidates, skippedLargeBlocks };
}
