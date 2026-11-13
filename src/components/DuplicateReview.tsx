"use client";

import type { PaginationState } from "@tanstack/react-table";
import { useMemo, useState, type KeyboardEvent } from "react";
import type { ColumnRoles } from "@/lib/data-plane/columns";
import { isExactMatch, pairKey, type Decisions, type FieldSide, type PairAction } from "@/lib/data-plane/merge";
import {
  listPairs,
  NO_FILTER,
  PAIR_STATUSES,
  pairStatus,
  rowLabel,
  type PairFilter,
  type PairSort,
} from "@/lib/data-plane/review";
import type { DuplicateCandidate, MatchField, ParsedCsv } from "@/lib/data-plane/types";
import { useConfirm } from "./ConfirmDialog";
import { CountUp } from "./CountUp";
import { MergePreview } from "./MergePreview";
import { PAGE_SIZE, PairList, STATUS_LABELS, type PairRow } from "./PairList";

export interface DuplicateReviewProps {
  parsed: ParsedCsv;
  candidates: DuplicateCandidate[];
  /** Used to name rows in the pair list; rows are numbered otherwise. */
  roles?: ColumnRoles;
  /** Rows in very common name groups that weren't compared by name. */
  skippedLargeBlocks?: number;
  selected: number;
  onSelect: (index: number) => void;
  decisions?: Decisions;
  onDecide?: (index: number, action: PairAction) => void;
  onChooseField?: (index: number, col: number, side: FieldSide) => void;
  onMergeAllExact?: () => void;
  onDecideMany?: (indexes: number[], action: PairAction) => void;
  onUndo?: () => void;
  canUndo?: boolean;
}

const MATCH_LABELS: Record<MatchField, string> = { email: "Email", phone: "Phone", name: "Name", company: "Company" };

/** Shortcuts must not fire while the user is typing or choosing in a form field. */
function isFormField(target: EventTarget): boolean {
  return target instanceof HTMLElement && target.closest("input, select, textarea, [contenteditable='true']") !== null;
}

export function DuplicateReview({
  parsed,
  candidates,
  roles = {},
  skippedLargeBlocks = 0,
  selected,
  onSelect,
  decisions = {},
  onDecide,
  onChooseField,
  onMergeAllExact,
  onDecideMany,
  onUndo,
  canUndo = false,
}: DuplicateReviewProps) {
  const confirm = useConfirm();
  const [filter, setFilter] = useState<PairFilter>(NO_FILTER);
  const [sort, setSort] = useState<PairSort>("score");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE });

  const shown = useMemo(() => listPairs(candidates, decisions, filter, sort), [candidates, decisions, filter, sort]);
  const rows = useMemo<PairRow[]>(
    () =>
      shown.map((index) => {
        const c = candidates[index]!;
        return {
          index,
          left: rowLabel(parsed.rows[c.a], c.a, roles),
          right: rowLabel(parsed.rows[c.b], c.b, roles),
          matchedOn: c.matchedOn,
          score: c.score,
          status: pairStatus(c, decisions),
        };
      }),
    [shown, candidates, parsed.rows, roles, decisions],
  );

  const current = candidates[selected];
  const decision = current ? decisions[pairKey(current)] : undefined;
  const decided = candidates.filter((c) => decisions[pairKey(c)]).length;
  const toMerge = candidates.filter((c) => decisions[pairKey(c)]?.action === "merge").length;
  const exactUndecided = candidates.filter((c) => isExactMatch(c) && !decisions[pairKey(c)]).length;

  /** Select a pair and show the page it is on. */
  const select = (index: number) => {
    onSelect(index);
    const pos = shown.indexOf(index);
    if (pos >= 0) setPagination((p) => ({ ...p, pageIndex: Math.floor(pos / p.pageSize) }));
  };

  // Previous/Next walk the list as filtered and sorted. If the current pair has
  // left the list (e.g. just decided under "Not reviewed"), Next goes to the
  // top, which is the next pair still to review.
  const pos = shown.indexOf(selected);
  const prevIndex = pos > 0 ? shown[pos - 1] : undefined;
  const nextIndex = pos >= 0 ? shown[pos + 1] : shown[0];

  const changeFilter = (next: Partial<PairFilter>) => {
    setFilter((f) => ({ ...f, ...next }));
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };

  const bulk = async (action: PairAction) => {
    if (!onDecideMany) return;
    const what = action === "merge" ? "Merge" : "Keep separate";
    if (await confirm(`${what} all ${shown.length} pairs shown?`, { confirmLabel: what })) onDecideMany(shown, action);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (isFormField(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    let handled = true;
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "z" && onUndo) onUndo();
    else if (mod || e.altKey) handled = false;
    else if (e.key.toLowerCase() === "m" && current && onDecide) onDecide(selected, "merge");
    else if (e.key.toLowerCase() === "k" && current && onDecide) onDecide(selected, "keep_both");
    else if (e.key === "ArrowLeft" && prevIndex !== undefined) select(prevIndex);
    else if (e.key === "ArrowRight" && nextIndex !== undefined) select(nextIndex);
    else handled = false;
    if (handled) e.preventDefault();
  };

  return (
    <section
      aria-labelledby="dupes-heading"
      className="rounded-xl bg-white p-6 shadow-sm focus:outline-2 focus:outline-emerald-600"
      // Focusable so the shortcuts work after clicking anywhere in the section.
      tabIndex={-1}
      onKeyDown={onKeyDown}
      aria-keyshortcuts="M K ArrowLeft ArrowRight Control+Z Meta+Z"
      data-testid="duplicate-review"
    >
      <h2 id="dupes-heading" className="text-lg font-semibold text-slate-900">
        Possible duplicates{" "}
        <span className="font-normal text-slate-500">
          (<CountUp value={candidates.length} />)
        </span>
      </h2>

      {skippedLargeBlocks > 0 && (
        <p className="mt-2 text-sm text-amber-700" data-testid="skipped-blocks">
          Some very common names weren&apos;t compared by name ({skippedLargeBlocks} rows). Matches on email and phone
          are still found.
        </p>
      )}

      {!current ? (
        <p className="mt-2 text-sm text-slate-600">No likely duplicates found.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span data-testid="review-progress">
              Reviewed {decided} of {candidates.length} · {toMerge} to merge
            </span>
            {onMergeAllExact && exactUndecided > 0 && (
              <button type="button" className="rounded border px-2 py-1" onClick={onMergeAllExact}>
                Merge all exact matches ({exactUndecided})
              </button>
            )}
            {onUndo && (
              <button
                type="button"
                className="rounded border px-2 py-1 disabled:opacity-40"
                disabled={!canUndo}
                onClick={onUndo}
              >
                Undo
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-1">
              Matched on
              <select
                className="rounded border px-1 py-0.5"
                value={filter.matchedOn ?? ""}
                onChange={(e) => changeFilter({ matchedOn: (e.target.value || null) as MatchField | null })}
              >
                <option value="">Any</option>
                {(Object.keys(MATCH_LABELS) as MatchField[]).map((f) => (
                  <option key={f} value={f}>
                    {MATCH_LABELS[f]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              Status
              <select
                className="rounded border px-1 py-0.5"
                value={filter.status ?? ""}
                onChange={(e) => changeFilter({ status: (e.target.value || null) as PairFilter["status"] })}
              >
                <option value="">Any</option>
                {PAIR_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              Sort by
              <select
                className="rounded border px-1 py-0.5"
                value={sort}
                onChange={(e) => setSort(e.target.value as PairSort)}
              >
                <option value="score">Score</option>
                <option value="status">Status</option>
              </select>
            </label>
            {onDecideMany && (
              <>
                <button
                  type="button"
                  className="rounded border px-2 py-1 disabled:opacity-40"
                  disabled={shown.length === 0}
                  onClick={() => void bulk("merge")}
                >
                  Merge all shown ({shown.length})
                </button>
                <button
                  type="button"
                  className="rounded border px-2 py-1 disabled:opacity-40"
                  disabled={shown.length === 0}
                  onClick={() => void bulk("keep_both")}
                >
                  Keep all shown separate ({shown.length})
                </button>
              </>
            )}
          </div>

          <div className="mt-3">
            <PairList
              rows={rows}
              pagination={pagination}
              onPaginationChange={setPagination}
              selected={selected}
              onSelect={select}
            />
          </div>

          <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4 text-sm">
            <button
              type="button"
              className="rounded border px-2 py-1 disabled:opacity-40"
              disabled={prevIndex === undefined}
              onClick={() => prevIndex !== undefined && select(prevIndex)}
            >
              Previous
            </button>
            <span data-testid="current-pair">
              Pair {selected + 1} of {candidates.length} · matched on {current.matchedOn.join(", ")} · score{" "}
              {current.score}
            </span>
            <button
              type="button"
              className="rounded border px-2 py-1 disabled:opacity-40"
              disabled={nextIndex === undefined}
              onClick={() => nextIndex !== undefined && select(nextIndex)}
            >
              Next
            </button>
          </div>

          {onDecide && (
            <div className="mt-3 flex items-center gap-3 text-sm">
              <button
                type="button"
                aria-pressed={decision?.action === "merge"}
                className="rounded-lg border px-3 py-1 font-medium aria-pressed:bg-emerald-700 aria-pressed:text-white"
                onClick={() => onDecide(selected, "merge")}
              >
                Merge
              </button>
              <button
                type="button"
                aria-pressed={decision?.action === "keep_both"}
                className="rounded-lg border px-3 py-1 font-medium aria-pressed:bg-slate-700 aria-pressed:text-white"
                onClick={() => onDecide(selected, "keep_both")}
              >
                Keep separate
              </button>
              <span
                key={decision?.action ?? "undecided"}
                data-testid="pair-status"
                className="animate-pop text-slate-600"
              >
                {STATUS_LABELS[decision?.action ?? "undecided"]}
              </span>
            </div>
          )}

          {onDecide && (
            <p className="mt-2 text-xs text-slate-500" data-testid="shortcuts">
              Shortcuts (click in this section first): <kbd>M</kbd> merge · <kbd>K</kbd> keep separate · <kbd>←</kbd>{" "}
              <kbd>→</kbd> previous / next
              {onUndo && (
                <>
                  {" "}
                  · <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> undo
                </>
              )}
            </p>
          )}

          <div className="mt-4">
            <MergePreview
              headers={parsed.headers}
              left={parsed.rows[current.a] ?? []}
              right={parsed.rows[current.b] ?? []}
              leftLabel={`Row ${current.a + 1}`}
              rightLabel={`Row ${current.b + 1}`}
              choices={decision?.fields}
              onChoose={onChooseField ? (col, side) => onChooseField(selected, col, side) : undefined}
            />
          </div>
        </>
      )}
    </section>
  );
}
