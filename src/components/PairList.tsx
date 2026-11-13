"use client";

import {
  createColumnHelper,
  createPaginatedRowModel,
  rowPaginationFeature,
  tableFeatures,
  useTable,
  type PaginationState,
} from "@tanstack/react-table";
import { useMemo } from "react";
import type { PairStatus } from "@/lib/data-plane/review";
import type { MatchField } from "@/lib/data-plane/types";

export const PAGE_SIZE = 50;

export const STATUS_LABELS: Record<PairStatus, string> = {
  undecided: "Not reviewed",
  merge: "Will merge",
  keep_both: "Keeping both",
};

export interface PairRow {
  /** Index into the candidate list. */
  index: number;
  left: string;
  right: string;
  matchedOn: MatchField[];
  score: number;
  status: PairStatus;
}

const features = tableFeatures({ rowPaginationFeature, paginatedRowModel: createPaginatedRowModel() });
const col = createColumnHelper<typeof features, PairRow>();

export interface PairListProps {
  /** Already filtered and sorted; this component only pages through them. */
  rows: PairRow[];
  pagination: PaginationState;
  onPaginationChange: (p: PaginationState) => void;
  selected: number;
  onSelect: (index: number) => void;
}

/**
 * One line per candidate pair, a page at a time: rendering thousands of rows at
 * once would make the page sluggish on the large files Ready now accepts.
 */
export function PairList({ rows, pagination, onPaginationChange, selected, onSelect }: PairListProps) {
  const columns = useMemo(
    () =>
      col.columns([
        col.display({
          id: "pair",
          header: "Pair",
          cell: ({ row }) => (
            <button
              type="button"
              className="text-left underline-offset-2 hover:underline"
              onClick={() => onSelect(row.original.index)}
            >
              {row.original.left} <span className="text-slate-400">↔</span> {row.original.right}
            </button>
          ),
        }),
        col.accessor((r) => r.matchedOn.join(", "), { id: "matchedOn", header: "Matched on" }),
        col.accessor("score", { header: "Score" }),
        col.accessor((r) => STATUS_LABELS[r.status], { id: "status", header: "Status" }),
      ]),
    [onSelect],
  );

  const table = useTable({
    features,
    columns,
    data: rows,
    state: { pagination },
    onPaginationChange: (updater) => onPaginationChange(typeof updater === "function" ? updater(pagination) : updater),
    // The parent resets the page when the filter changes; a decision changing a
    // row's status must not throw the user back to page 1.
    autoResetPageIndex: false,
  });
  const pageCount = Math.max(1, table.getPageCount());

  return (
    <div data-testid="pair-list">
      <table className="w-full text-left text-sm">
        <thead className="text-slate-500">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} className="py-1 pr-4 font-medium">
                  {h.isPlaceholder ? null : <table.FlexRender header={h} />}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.original.index}
              aria-current={row.original.index === selected ? "true" : undefined}
              className="border-t border-slate-100 aria-[current]:bg-emerald-50"
            >
              {row.getAllCells().map((cell) => (
                <td key={cell.id} className="py-1 pr-4 align-top break-words">
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="mt-2 text-sm text-slate-600">No pairs match these filters.</p>}
      <div className="mt-2 flex items-center gap-3 text-sm">
        <button
          type="button"
          className="rounded border px-2 py-1 disabled:opacity-40"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
        >
          Previous page
        </button>
        <span data-testid="pair-page">
          Page {pagination.pageIndex + 1} of {pageCount}
        </span>
        <button
          type="button"
          className="rounded border px-2 py-1 disabled:opacity-40"
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
        >
          Next page
        </button>
      </div>
    </div>
  );
}
