"use client";

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { useMemo } from "react";

interface FieldRow {
  field: string;
  left: string;
  right: string;
  differs: boolean;
}

const features = tableFeatures({});
const col = createColumnHelper<typeof features, FieldRow>();

export interface MergePreviewProps {
  headers: string[];
  left: string[];
  right: string[];
  leftLabel?: string;
  rightLabel?: string;
}

/** Side-by-side comparison of two records, one row per field. */
export function MergePreview({
  headers,
  left,
  right,
  leftLabel = "Record A",
  rightLabel = "Record B",
}: MergePreviewProps) {
  const data = useMemo<FieldRow[]>(
    () =>
      headers.map((field, i) => {
        const l = left[i] ?? "";
        const r = right[i] ?? "";
        return { field, left: l, right: r, differs: l.trim() !== r.trim() };
      }),
    [headers, left, right],
  );

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("field", { header: "Field" }),
        col.accessor("left", { header: leftLabel }),
        col.accessor("right", { header: rightLabel }),
      ]),
    [leftLabel, rightLabel],
  );

  const table = useTable({ features, columns, data });

  return (
    <table className="w-full text-left text-sm" data-testid="merge-preview">
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
            key={row.id}
            data-differs={row.original.differs}
            className={`border-t border-slate-100 ${row.original.differs ? "bg-amber-50" : ""}`}
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
  );
}
