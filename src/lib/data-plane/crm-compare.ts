import "client-only";
import { detectKeyColumns, KEY_COLUMNS, type ColumnRoles, type KeyColumn } from "./columns";
import { blockKeys, keyRows, MAX_BLOCK, scorePair } from "./dedupe";
import type { CountryCode } from "./phone";
import { rowLabel } from "./review";
import type { MatchField, ParsedCsv } from "./types";

/** A row of the user's file that is already in their CRM export. */
export interface CrmMatch {
  /** Row in the user's file. */
  row: number;
  /** Best-matching row in the CRM export. */
  refRow: number;
  /** How that CRM row is named (name, or "Row n"), for the review list. Stays in the browser. */
  refLabel: string;
  score: number;
  matchedOn: MatchField[];
}

export interface CrmComparison {
  matches: CrmMatch[];
  /** Rows in the CRM export. Shown to the user only; never leaves the browser. */
  referenceRows: number;
  /** Roles found in the CRM export's headers, which matching could use. */
  referenceRoles: KeyColumn[];
}

/**
 * Find rows of `parsed` that already exist in `reference` (an export of the
 * user's CRM), with the same keys, blocking and scoring as duplicate detection,
 * so "already in your CRM" means what "duplicate" means. Each row gets its best
 * match: highest score, then the earliest CRM row. Deterministic.
 */
export function compareWithReference(
  parsed: ParsedCsv,
  roles: ColumnRoles,
  defaultCountry: CountryCode | null,
  reference: ParsedCsv,
  referenceRoles: ColumnRoles = detectKeyColumns(reference.headers),
): CrmComparison {
  const ours = keyRows(parsed, roles, defaultCountry);
  const theirs = keyRows(reference, referenceRoles, defaultCountry);

  // CRM rows by block key, ascending. Very common keys are capped like in dedupe.
  const index = new Map<string, number[]>();
  theirs.forEach((r, i) => {
    for (const key of blockKeys(r)) {
      const list = index.get(key);
      if (!list) index.set(key, [i]);
      else if (list.length <= MAX_BLOCK) list.push(i);
    }
  });

  const matches: CrmMatch[] = [];
  ours.forEach((r, row) => {
    const seen = new Set<number>();
    let best: Omit<CrmMatch, "refLabel"> | null = null;
    for (const key of blockKeys(r)) {
      const list = index.get(key);
      // A name shared by hundreds of CRM contacts says little; email and phone blocks are exact, so keep their head.
      if (!list || (list.length > MAX_BLOCK && key.startsWith("n:"))) continue;
      for (const refRow of list.slice(0, MAX_BLOCK)) {
        if (seen.has(refRow)) continue;
        seen.add(refRow);
        const m = scorePair(r, theirs[refRow]!);
        if (m && (!best || m.score > best.score || (m.score === best.score && refRow < best.refRow))) {
          best = { row, refRow, ...m };
        }
      }
    }
    if (best) matches.push({ ...best, refLabel: rowLabel(reference.rows[best.refRow], best.refRow, referenceRoles) });
  });

  return {
    matches,
    referenceRows: reference.rows.length,
    referenceRoles: KEY_COLUMNS.filter((k) => referenceRoles[k] !== undefined),
  };
}
