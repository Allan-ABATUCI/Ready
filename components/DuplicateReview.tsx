"use client";

import { isExactMatch, pairKey, type Decisions, type FieldSide, type PairAction } from "@/lib/data-plane/merge";
import type { DuplicateCandidate, ParsedCsv } from "@/lib/data-plane/types";
import { MergePreview } from "./MergePreview";

export interface DuplicateReviewProps {
  parsed: ParsedCsv;
  candidates: DuplicateCandidate[];
  /** Rows in very common name groups that weren't compared by name. */
  skippedLargeBlocks?: number;
  selected: number;
  onSelect: (index: number) => void;
  decisions?: Decisions;
  onDecide?: (index: number, action: PairAction) => void;
  onChooseField?: (index: number, col: number, side: FieldSide) => void;
  onMergeAllExact?: () => void;
}

const STATUS: Record<PairAction | "undecided", string> = {
  undecided: "Not reviewed",
  merge: "Will merge",
  keep_both: "Keeping both",
};

export function DuplicateReview({
  parsed,
  candidates,
  skippedLargeBlocks = 0,
  selected,
  onSelect,
  decisions = {},
  onDecide,
  onChooseField,
  onMergeAllExact,
}: DuplicateReviewProps) {
  const current = candidates[selected];
  const decision = current ? decisions[pairKey(current)] : undefined;
  const decided = candidates.filter((c) => decisions[pairKey(c)]).length;
  const toMerge = candidates.filter((c) => decisions[pairKey(c)]?.action === "merge").length;
  const exactUndecided = candidates.filter((c) => isExactMatch(c) && !decisions[pairKey(c)]).length;

  return (
    <section aria-labelledby="dupes-heading" className="rounded-xl bg-white p-6 shadow-sm">
      <h2 id="dupes-heading" className="text-lg font-semibold text-slate-900">
        Possible duplicates <span className="font-normal text-slate-500">({candidates.length})</span>
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
          </div>

          <div className="mt-3 flex items-center gap-3 text-sm">
            <button
              type="button"
              className="rounded border px-2 py-1 disabled:opacity-40"
              disabled={selected === 0}
              onClick={() => onSelect(selected - 1)}
            >
              Previous
            </button>
            <span>
              {selected + 1} of {candidates.length} · matched on {current.matchedOn.join(", ")} · score {current.score}
            </span>
            <button
              type="button"
              className="rounded border px-2 py-1 disabled:opacity-40"
              disabled={selected >= candidates.length - 1}
              onClick={() => onSelect(selected + 1)}
            >
              Next
            </button>
          </div>

          {onDecide && (
            <div className="mt-3 flex items-center gap-3 text-sm">
              <button
                type="button"
                aria-pressed={decision?.action === "merge"}
                className="rounded-lg border px-3 py-1 font-medium aria-pressed:bg-emerald-600 aria-pressed:text-white"
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
              <span data-testid="pair-status" className="text-slate-600">
                {STATUS[decision?.action ?? "undecided"]}
              </span>
            </div>
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
