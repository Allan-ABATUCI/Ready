import "client-only";
import type { CsvRow, DuplicateCandidate, ParsedCsv } from "./types";

export type FieldSide = "a" | "b";
export type PairAction = "merge" | "keep_both";

/** The user's decision for one duplicate pair. Undecided pairs are kept separate. */
export interface PairDecision {
  action: PairAction;
  /** Explicit per-column picks. Columns without a pick fill blanks from either side. */
  fields: Record<number, FieldSide>;
}

export type Decisions = Record<string, PairDecision>;

export function pairKey(c: Pick<DuplicateCandidate, "a" | "b">): string {
  return `${c.a}:${c.b}`;
}

/**
 * Pairs safe to merge in bulk: a perfect score that isn't based on phone alone.
 * Shared phones (switchboards, family numbers) often belong to different people.
 */
export function isExactMatch(c: Pick<DuplicateCandidate, "score" | "matchedOn">): boolean {
  return c.score === 100 && c.matchedOn.some((f) => f !== "phone");
}

const isBlank = (v: string | undefined) => (v ?? "").trim() === "";

/** Which side a column takes when the user hasn't picked: keep A unless only B has a value. */
export function defaultSide(a: string | undefined, b: string | undefined): FieldSide {
  return isBlank(a) && !isBlank(b) ? "b" : "a";
}

/**
 * Fold one merged pair into `record` (mutated). Explicit picks always win;
 * otherwise blanks are filled from whichever side has a value (A first).
 */
function foldPair(record: string[], rowA: CsvRow, rowB: CsvRow, fields: Record<number, FieldSide>): void {
  for (let col = 0; col < record.length; col++) {
    const pick = fields[col];
    if (pick !== undefined) record[col] = (pick === "a" ? rowA[col] : rowB[col]) ?? "";
    else if (isBlank(record[col])) record[col] = !isBlank(rowA[col]) ? rowA[col]! : (rowB[col] ?? "");
  }
}

/** The merged record for a single pair, starting from A. Used for the review preview. */
export function mergePair(rowA: CsvRow, rowB: CsvRow, fields: Record<number, FieldSide>): CsvRow {
  const width = Math.max(rowA.length, rowB.length);
  const record = Array.from({ length: width }, (_, i) => rowA[i] ?? "");
  foldPair(record, rowA, rowB, fields);
  return record;
}

export interface MergeResult {
  rows: CsvRow[];
  /** Original row index of each output row. */
  sourceRows: number[];
  /** Original row indexes folded into another row. */
  removed: number[];
  /** Original row indexes making up each output row: the survivor first, then those folded into it. */
  members: number[][];
  /** Output rows made from two or more original rows. */
  mergedGroups: number;
  /** Output rows left out because they are already in the CRM (see `excludeRows`). */
  excludedRows: number;
}

/**
 * Apply the user's merge decisions. Pure and deterministic:
 * - pairs marked "merge" are unioned, so A~B and B~C collapse into one record;
 * - the survivor is the group's smallest row index and keeps its position;
 * - merged pairs are folded in (a, b) order, so later explicit picks win.
 */
export function applyDecisions(parsed: ParsedCsv, candidates: DuplicateCandidate[], decisions: Decisions): MergeResult {
  const n = parsed.rows.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };

  const merged = candidates
    .filter((c) => c.a < n && c.b < n && decisions[pairKey(c)]?.action === "merge")
    .sort((x, y) => x.a - y.a || x.b - y.b);

  for (const c of merged) {
    const [ra, rb] = [find(c.a), find(c.b)];
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }

  const records = new Map<number, string[]>();
  for (const c of merged) {
    const root = find(c.a);
    let record = records.get(root);
    if (!record) records.set(root, (record = [...parsed.rows[root]!]));
    foldPair(record, parsed.rows[c.a]!, parsed.rows[c.b]!, decisions[pairKey(c)]!.fields);
  }

  const rows: CsvRow[] = [];
  const sourceRows: number[] = [];
  const removed: number[] = [];
  const membersOf = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (root !== i) {
      removed.push(i);
      membersOf.get(root)!.push(i); // roots come first: a root is its group's smallest index
      continue;
    }
    membersOf.set(i, [i]);
    rows.push(records.get(i) ?? parsed.rows[i]!);
    sourceRows.push(i);
  }
  const members = sourceRows.map((i) => membersOf.get(i)!);
  return { rows, sourceRows, removed, members, mergedGroups: records.size, excludedRows: 0 };
}

/**
 * Leave out output rows that any of `rows` (original indexes) went into: if one
 * contact of a merged group is already in the CRM, the merged record is too.
 */
export function excludeRows(merged: MergeResult, rows: ReadonlySet<number>): MergeResult {
  if (rows.size === 0) return merged;
  const keep = merged.members.map((group) => !group.some((i) => rows.has(i)));
  const pick = <T>(xs: T[]) => xs.filter((_, r) => keep[r]);
  const members = pick(merged.members);
  return {
    rows: pick(merged.rows),
    sourceRows: pick(merged.sourceRows),
    removed: merged.removed,
    members,
    mergedGroups: members.filter((g) => g.length > 1).length,
    excludedRows: merged.excludedRows + keep.filter((k) => !k).length,
  };
}
