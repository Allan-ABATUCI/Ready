"use client";

import { useMemo } from "react";
import { CRM_LABELS } from "@/lib/data-plane/crm-mapping";
import { downloadCsv } from "@/lib/data-plane/export";
import { buildExportTable, type ExportOptions } from "@/lib/data-plane/export-table";
import { applyDecisions, type Decisions } from "@/lib/data-plane/merge";
import { checkRequirements, type RequirementCode } from "@/lib/data-plane/requirements";
import type { ProcessResult } from "@/lib/data-plane/types";
import { CRMS, type Crm, type RulePack } from "@/lib/rule-packs/types";
import type { RulePackStatus } from "@/lib/state/store";

const REQUIREMENT_LABELS: Record<RequirementCode, string> = {
  missing_column: "No column for required field",
  missing_required: "Required field is empty",
  invalid_format: "Wrong format",
};

const OPTION_LABELS: Record<keyof ExportOptions, string> = {
  trim: "Trim extra spaces",
  lowercaseEmails: "Lower-case email addresses",
  fixCase: "Fix capitalization",
};

export interface ExportPanelProps {
  result: ProcessResult;
  decisions: Decisions;
  crm: Crm | null;
  options: ExportOptions;
  onCrm: (crm: Crm) => void;
  onOption: (key: keyof ExportOptions, value: boolean) => void;
  /** Verified pack for `crm`, if loaded. */
  rulePack?: RulePack | null;
  rulePackStatus?: RulePackStatus;
  /** Injected for tests; defaults to a local blob download. */
  download?: typeof downloadCsv;
}

export function ExportPanel({
  result,
  decisions,
  crm,
  options,
  onCrm,
  onOption,
  rulePack = null,
  rulePackStatus = "idle",
  download = downloadCsv,
}: ExportPanelProps) {
  const merged = useMemo(
    () => applyDecisions(result.parsed, result.duplicates, decisions),
    [result.parsed, result.duplicates, decisions],
  );
  const table = useMemo(
    () => (crm ? buildExportTable(result.parsed, merged, result.cellIssues, crm, options) : null),
    [result.parsed, result.cellIssues, merged, crm, options],
  );
  const activePack = rulePack && rulePack.crm === crm ? rulePack : null;
  const requirementGroups = useMemo(() => {
    if (!table || !activePack) return null;
    const groups: { key: string; field: string; code: RequirementCode; count: number }[] = [];
    for (const i of checkRequirements(table, activePack)) {
      const key = `${i.code}:${i.field}`;
      const g = groups.find((x) => x.key === key);
      if (g) g.count++;
      else groups.push({ key, field: i.field, code: i.code, count: 1 });
    }
    return groups;
  }, [table, activePack]);

  return (
    <section aria-labelledby="export-heading" className="rounded-xl bg-white p-6 shadow-sm">
      <h2 id="export-heading" className="text-lg font-semibold text-slate-900">
        Export
      </h2>

      <fieldset className="mt-3">
        <legend className="text-sm font-medium text-slate-700">Destination CRM</legend>
        <div className="mt-1 flex gap-4 text-sm">
          {CRMS.map((c) => (
            <label key={c} className="flex items-center gap-1">
              <input type="radio" name="crm" value={c} checked={crm === c} onChange={() => onCrm(c)} />
              {CRM_LABELS[c]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-3">
        <legend className="text-sm font-medium text-slate-700">Clean-up</legend>
        <div className="mt-1 flex flex-wrap gap-4 text-sm">
          {(Object.keys(OPTION_LABELS) as (keyof ExportOptions)[]).map((k) => (
            <label key={k} className="flex items-center gap-1">
              <input type="checkbox" checked={options[k]} onChange={(e) => onOption(k, e.target.checked)} />
              {OPTION_LABELS[k]}
            </label>
          ))}
        </div>
      </fieldset>

      <p className="mt-3 text-sm text-slate-600" data-testid="export-summary">
        {result.parsed.rows.length} rows → {merged.rows.length} after merging
        {table && <> · columns: {table.headers.join(", ")}</>}
      </p>

      {crm && (
        <div className="mt-3 text-sm" data-testid="crm-rules">
          {rulePackStatus === "loading" && <p className="text-slate-500">Loading {CRM_LABELS[crm]} import rules…</p>}
          {rulePackStatus === "failed" && (
            <p className="text-amber-700">
              Couldn&apos;t verify the {CRM_LABELS[crm]} import rules, so required-field checks are off.
            </p>
          )}
          {requirementGroups && activePack && (
            <>
              <p className="text-slate-600">
                Checked against {CRM_LABELS[crm]} rules v{activePack.version}
                {requirementGroups.length === 0 && ": all required fields present."}
              </p>
              {requirementGroups.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-amber-800">
                  {requirementGroups.map((g) => (
                    <li key={g.key}>
                      {REQUIREMENT_LABELS[g.code]}: {g.field}
                      {g.code !== "missing_column" && ` (${g.count} ${g.count === 1 ? "row" : "rows"})`}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={!table || !crm}
        className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
        onClick={() => table && crm && download(`ready-${crm}.csv`, table.headers, table.rows)}
      >
        Download CSV
      </button>
      {!crm && <span className="ml-3 text-sm text-slate-500">Pick a CRM first.</span>}
    </section>
  );
}
