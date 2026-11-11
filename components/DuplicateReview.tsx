"use client";

import type { DuplicateCandidate, ParsedCsv } from "@/lib/data-plane/types";
import { MergePreview } from "./MergePreview";

export interface DuplicateReviewProps {
  parsed: ParsedCsv;
  candidates: DuplicateCandidate[];
  selected: number;
  onSelect: (index: number) => void;
}

export function DuplicateReview({ parsed, candidates, selected, onSelect }: DuplicateReviewProps) {
  const current = candidates[selected];

  return (
    <section aria-labelledby="dupes-heading" className="rounded-xl bg-white p-6 shadow-sm">
      <h2 id="dupes-heading" className="text-lg font-semibold text-slate-900">
        Possible duplicates <span className="font-normal text-slate-500">({candidates.length})</span>
      </h2>

      {!current ? (
        <p className="mt-2 text-sm text-slate-600">No likely duplicates found.</p>
      ) : (
        <>
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
          <div className="mt-4">
            <MergePreview
              headers={parsed.headers}
              left={parsed.rows[current.a] ?? []}
              right={parsed.rows[current.b] ?? []}
              leftLabel={`Row ${current.a + 1}`}
              rightLabel={`Row ${current.b + 1}`}
            />
          </div>
        </>
      )}
    </section>
  );
}
