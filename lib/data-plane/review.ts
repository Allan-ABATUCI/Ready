import "client-only";
import type { ColumnRoles } from "./columns";
import { pairKey, type Decisions, type PairAction } from "./merge";
import { joinName } from "./names";
import type { CsvRow, DuplicateCandidate, MatchField } from "./types";

export type PairStatus = PairAction | "undecided";

/** Statuses in the order "sort by status" puts them: what still needs work first. */
export const PAIR_STATUSES: PairStatus[] = ["undecided", "merge", "keep_both"];

export interface PairFilter {
  /** Only pairs matched on this field; null for all. */
  matchedOn: MatchField | null;
  /** Only pairs with this status; null for all. */
  status: PairStatus | null;
}

export const NO_FILTER: PairFilter = { matchedOn: null, status: null };

/** "score" is the order `findDuplicateCandidates` returns: score, then row numbers. */
export type PairSort = "score" | "status";

export function pairStatus(c: DuplicateCandidate, decisions: Decisions): PairStatus {
  return decisions[pairKey(c)]?.action ?? "undecided";
}

/**
 * Indexes into `candidates` of the pairs that pass `filter`, in `sort` order.
 * Ties keep candidate order, so the list is deterministic.
 */
export function listPairs(
  candidates: DuplicateCandidate[],
  decisions: Decisions,
  filter: PairFilter,
  sort: PairSort,
): number[] {
  const shown: number[] = [];
  candidates.forEach((c, i) => {
    if (filter.matchedOn !== null && !c.matchedOn.includes(filter.matchedOn)) return;
    if (filter.status !== null && pairStatus(c, decisions) !== filter.status) return;
    shown.push(i);
  });
  if (sort === "status") {
    const rank = (i: number) => PAIR_STATUSES.indexOf(pairStatus(candidates[i]!, decisions));
    shown.sort((x, y) => rank(x) - rank(y) || x - y);
  }
  return shown;
}

/**
 * How a row is named in the pair list: the full-name column, else first + last
 * name, else its row number. Shown on screen only, like every other cell value.
 */
export function rowLabel(row: CsvRow | undefined, index: number, roles: ColumnRoles): string {
  const cell = (col: number | undefined) => (col === undefined ? "" : (row?.[col] ?? ""));
  const name = cell(roles.name).trim() || joinName(cell(roles.firstName), cell(roles.lastName));
  return name || `Row ${index + 1}`;
}
