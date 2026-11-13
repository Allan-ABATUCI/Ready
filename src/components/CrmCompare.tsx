"use client";

import { useId, useState } from "react";
import type { ColumnRoles, KeyColumn } from "@/lib/data-plane/columns";
import type { CrmComparison } from "@/lib/data-plane/crm-compare";
import { rowLabel } from "@/lib/data-plane/review";
import type { ParsedCsv } from "@/lib/data-plane/types";
import { CountUp } from "./CountUp";

const ROLE_LABELS: Record<KeyColumn, string> = {
  email: "email",
  phone: "phone",
  name: "name",
  firstName: "first name",
  lastName: "last name",
  company: "company",
};

/** Matches listed at once; the rest are summarized in the count. */
const LIST_LIMIT = 20;

export interface CrmCompareProps {
  parsed: ParsedCsv;
  roles: ColumnRoles;
  fileName: string | null;
  comparison: CrmComparison | null;
  status: "idle" | "comparing" | "error";
  onFile: (file: File) => void;
  onClear: () => void;
  exclude: boolean;
  onExclude: (exclude: boolean) => void;
}

/**
 * "Already in your CRM?": the user picks an export of their CRM and sees which
 * rows of their file it already has. Both files stay in the browser.
 */
export function CrmCompare({
  parsed,
  roles,
  fileName,
  comparison,
  status,
  onFile,
  onClear,
  exclude,
  onExclude,
}: CrmCompareProps) {
  const inputId = useId();
  const [showAll, setShowAll] = useState(false);
  const usable = comparison?.referenceRoles.some((r) => r !== "company") ?? true;
  const shown = comparison ? (showAll ? comparison.matches : comparison.matches.slice(0, LIST_LIMIT)) : [];

  return (
    <section
      aria-labelledby="crm-compare-heading"
      className="rounded-xl bg-white p-6 shadow-sm"
      data-testid="crm-compare"
    >
      <h2 id="crm-compare-heading" className="text-lg font-semibold text-slate-900">
        Already in your CRM?
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Add an export of your CRM&apos;s contacts to find rows you already have. It is read in this browser, like your
        file, and never uploaded.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <label
          htmlFor={inputId}
          className="cursor-pointer rounded-lg border bg-white px-3 py-1.5 font-medium transition hover:-translate-y-0.5 hover:shadow-sm"
        >
          {fileName ? "Use another CRM export" : "Choose a CRM export"}
        </label>
        <input
          id={inputId}
          type="file"
          accept=".csv,text/csv,.tsv,.txt,.xlsx"
          className="sr-only"
          data-testid="crm-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
        {fileName && (
          <>
            <span className="text-slate-500" data-testid="crm-file-name">
              {fileName}
            </span>
            <button type="button" className="text-slate-500 underline-offset-2 hover:underline" onClick={onClear}>
              Remove
            </button>
          </>
        )}
      </div>

      <div role="status" aria-live="polite" className="mt-3 text-sm" data-testid="crm-compare-status">
        {status === "comparing" && <p className="text-slate-500">Comparing with your CRM…</p>}
        {status === "error" && (
          <p className="text-amber-700">We couldn&apos;t read that CRM export. Is it a CSV or Excel file?</p>
        )}
        {status === "idle" && comparison && !usable && (
          <p className="text-amber-700">
            We couldn&apos;t find email, phone or name columns in that export, so nothing could be compared.
          </p>
        )}
        {status === "idle" && comparison && usable && (
          <div className="animate-rise">
            <p className="text-slate-700">
              <strong>
                <CountUp value={comparison.matches.length} />
              </strong>{" "}
              of {parsed.rows.length} rows are already in your CRM ({comparison.referenceRows} contacts, compared on{" "}
              {comparison.referenceRoles.map((r) => ROLE_LABELS[r]).join(", ")}).
            </p>
            {comparison.matches.length > 0 && (
              <>
                <label className="mt-2 flex items-center gap-2">
                  <input type="checkbox" checked={exclude} onChange={(e) => onExclude(e.target.checked)} />
                  Leave them out of the export
                </label>
                <table className="mt-3 w-full text-left" data-testid="crm-matches">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-1 pr-4 font-medium">Your file</th>
                      <th className="py-1 pr-4 font-medium">In your CRM</th>
                      <th className="py-1 pr-4 font-medium">Matched on</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((m) => (
                      <tr key={m.row} className="border-t border-slate-100">
                        <td className="py-1 pr-4">{rowLabel(parsed.rows[m.row], m.row, roles)}</td>
                        <td className="py-1 pr-4">{m.refLabel}</td>
                        <td className="py-1 pr-4 text-slate-600">{m.matchedOn.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {comparison.matches.length > LIST_LIMIT && !showAll && (
                  <button
                    type="button"
                    className="mt-2 text-emerald-700 underline-offset-2 hover:underline"
                    onClick={() => setShowAll(true)}
                  >
                    Show all {comparison.matches.length}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
