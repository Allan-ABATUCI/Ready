"use client";

import { useMemo } from "react";
import { CRM_LABELS } from "@/lib/data-plane/crm-mapping";
import { downloadCsv } from "@/lib/data-plane/export";
import {
  buildExportTable,
  type ExportOptions,
  type ExportToggle,
  type SetExportOption,
} from "@/lib/data-plane/export-table";
import { applyDecisions, type Decisions } from "@/lib/data-plane/merge";
import { PHONE_COUNTRIES, type CountryCode } from "@/lib/data-plane/phone";
import { checkRequirements, type RequirementCode } from "@/lib/data-plane/requirements";
import type { ProcessResult } from "@/lib/data-plane/types";
import { groupBy } from "@/lib/group";
import { CRMS, type Crm, type RulePack, type RulePackStatus } from "@/lib/rule-packs/types";

const REQUIREMENT_LABELS: Record<RequirementCode, string> = {
  missing_column: "No column for required field",
  missing_required: "Required field is empty",
  invalid_format: "Wrong format",
};

const OPTION_LABELS: Record<ExportToggle, string> = {
  trim: "Trim extra spaces",
  lowercaseEmails: "Lower-case email addresses",
  fixCase: "Fix capitalization",
  normalizePhones: "International phone format (+33…)",
  isoDates: "Dates as YYYY-MM-DD",
};

export interface ExportPanelProps {
  result: ProcessResult;
  decisions: Decisions;
  crm: Crm | null;
  options: ExportOptions;
  onCrm: (crm: Crm) => void;
  onOption: SetExportOption;
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
    () => (crm ? buildExportTable(result, merged, crm, options) : null),
    [result, merged, crm, options],
  );
  const activePack = rulePack && rulePack.crm === crm ? rulePack : null;
  const requirementGroups = useMemo(() => {
    if (!table || !activePack) return null;
    return groupBy(checkRequirements(table, activePack), (i) => `${i.code}:${i.field}`).map(({ key, items }) => ({
      key,
      field: items[0]!.field,
      code: items[0]!.code,
      count: items.length,
    }));
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
          {(Object.keys(OPTION_LABELS) as ExportToggle[]).map((k) => (
            <label key={k} className="flex items-center gap-1">
              <input type="checkbox" checked={options[k]} onChange={(e) => onOption(k, e.target.checked)} />
              {OPTION_LABELS[k]}
            </label>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm">
          Default country for numbers without +
          <select
            className="rounded border px-1 py-0.5 disabled:opacity-40"
            value={options.defaultCountry ?? ""}
            disabled={!options.normalizePhones}
            onChange={(e) => onOption("defaultCountry", (e.target.value || null) as CountryCode | null)}
          >
            <option value="">None (leave them as they are)</option>
            {PHONE_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
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
