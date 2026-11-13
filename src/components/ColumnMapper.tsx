"use client";

import {
  addColumn,
  leftOutColumns,
  renameColumn,
  setSource,
  type ColumnMapping,
  type TablePreview,
} from "@/lib/data-plane/combine";

export interface ColumnMapperProps {
  tables: TablePreview[];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

const columnName = (header: string | undefined, col: number) => header || `Column ${col + 1}`;

/**
 * Line up the columns of several files before combining them. Each row is one
 * column of the combined list; each file picks which of its columns feeds it.
 */
export function ColumnMapper({ tables, mapping, onChange, onConfirm, onCancel, disabled = false }: ColumnMapperProps) {
  const leftOut = leftOutColumns(mapping, tables);
  const totalRows = tables.reduce((n, t) => n + t.rowCount, 0);

  return (
    <section
      aria-labelledby="mapping-heading"
      className="rounded-xl bg-white p-6 shadow-sm"
      data-testid="column-mapping"
    >
      <h2 id="mapping-heading" className="text-lg font-semibold text-slate-900">
        Line up your columns
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        You&apos;re combining {tables.length} files ({totalRows} rows) into one list. Each row below is a column of the
        combined list: pick which column of each file goes into it. We matched columns with the same or similar names;
        check the examples, and change anything that doesn&apos;t line up.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500">
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">
                Combined column
              </th>
              {tables.map((t, f) => (
                <th key={f} scope="col" className="py-1 pr-3 font-medium">
                  <span className="text-slate-800">{t.name}</span>
                  <span className="block text-xs font-normal">
                    {t.rowCount} {t.rowCount === 1 ? "row" : "rows"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mapping.map((row, i) => (
              <tr key={i} className="border-t border-slate-100 align-top" data-testid="mapping-row">
                <td className="py-2 pr-3">
                  <input
                    type="text"
                    value={row.header}
                    aria-label={`Name of combined column ${i + 1}`}
                    disabled={disabled}
                    onChange={(e) => onChange(renameColumn(mapping, i, e.target.value))}
                    className="w-40 rounded border px-2 py-1"
                  />
                </td>
                {tables.map((t, f) => {
                  const col = row.sources[f] ?? null;
                  return (
                    <td key={f} className="py-2 pr-3">
                      <select
                        value={col ?? ""}
                        aria-label={`${row.header || `Combined column ${i + 1}`}: column from ${t.name}`}
                        disabled={disabled}
                        onChange={(e) =>
                          onChange(setSource(mapping, i, f, e.target.value === "" ? null : Number(e.target.value)))
                        }
                        className="max-w-48 rounded border bg-white px-2 py-1"
                      >
                        <option value="">— not in this file —</option>
                        {t.headers.map((h, c) => (
                          <option key={c} value={c}>
                            {columnName(h, c)}
                          </option>
                        ))}
                      </select>
                      {col !== null && (
                        <span className="mt-0.5 block max-w-48 truncate text-xs text-slate-500">
                          {t.samples[col]?.length ? `e.g. ${t.samples[col]!.join(", ")}` : "(empty)"}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {leftOut.length > 0 && (
        <div className="mt-4 text-sm" data-testid="left-out-columns">
          <h3 className="font-medium text-slate-700">Left out of the combined list</h3>
          <ul className="mt-1 flex flex-col gap-1">
            {leftOut.map(({ file, col }) => (
              <li key={`${file}:${col}`} className="flex flex-wrap items-center gap-2">
                <span>
                  <span className="font-medium">{columnName(tables[file]!.headers[col], col)}</span>
                  <span className="text-slate-500"> from {tables[file]!.name}</span>
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  className="rounded border px-2 py-0.5 text-xs hover:bg-slate-50"
                  onClick={() => onChange(addColumn(mapping, tables, file, col))}
                >
                  Add as its own column
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-3">
        <button type="button" className="rounded-lg border px-4 py-2" disabled={disabled} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          disabled={disabled || mapping.length === 0}
          className="rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:opacity-40"
          onClick={onConfirm}
        >
          Combine {tables.length} files →
        </button>
      </div>
    </section>
  );
}
