"use client";

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { defaultSide, mergePair, type FieldSide } from "@/lib/data-plane/merge";

interface FieldRow {
  col: number;
  field: string;
  left: string;
  right: string;
  merged: string;
  side: FieldSide;
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
  /** Explicit per-column picks for this pair. */
  choices?: Record<number, FieldSide>;
  /** When set, differing fields get a picker and a "Merged" column is shown. */
  onChoose?: (col: number, side: FieldSide) => void;
}

/** Side-by-side comparison of two records, one row per field. */
export function MergePreview({
  headers,
  left,
  right,
  leftLabel = "Record A",
  rightLabel = "Record B",
  choices = {},
  onChoose,
}: MergePreviewProps) {
  const data = useMemo<FieldRow[]>(() => {
    const merged = mergePair(left, right, choices);
    return headers.map((field, i) => {
      const l = left[i] ?? "";
      const r = right[i] ?? "";
      return {
        col: i,
        field,
        left: l,
        right: r,
        merged: merged[i] ?? "",
        side: choices[i] ?? defaultSide(l, r),
        differs: l.trim() !== r.trim(),
      };
    });
  }, [headers, left, right, choices]);

  const columns = useMemo(() => {
    const valueCell = (side: FieldSide, label: string) =>
      function ValueCell({ row, getValue }: { row: { original: FieldRow }; getValue: () => string }) {
        const f = row.original;
        if (!onChoose || !f.differs) return getValue();
        return (
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="radio"
              name={`field-${f.col}`}
              checked={f.side === side}
              onChange={() => onChoose(f.col, side)}
              aria-label={`Use ${label} value for ${f.field}`}
              className="mt-1"
            />
            <span>{getValue() || <em className="text-slate-400">(empty)</em>}</span>
          </label>
        );
      };

    return col.columns([
      col.accessor("field", { header: "Field" }),
      col.accessor("left", { header: leftLabel, cell: valueCell("a", leftLabel) }),
      col.accessor("right", { header: rightLabel, cell: valueCell("b", rightLabel) }),
      ...(onChoose ? [col.accessor("merged", { header: "Merged" })] : []),
    ]);
  }, [leftLabel, rightLabel, onChoose]);

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
