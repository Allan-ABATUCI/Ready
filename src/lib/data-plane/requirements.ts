import "client-only";
import type { RulePack } from "@/lib/rule-packs/types";
import type { ExportTable } from "./export-table";
import { FORMAT_VALIDATORS } from "./validate";

export type RequirementCode = "missing_column" | "missing_required" | "invalid_format";

export interface RequirementIssue {
  /** Export-table row, or null for a whole missing column. */
  row: number | null;
  /** CRM field name from the rule pack (not a file value). */
  field: string;
  code: RequirementCode;
}

/**
 * Check the export table against a verified rule pack. A required field the
 * table has no column for is reported once; otherwise each empty or malformed
 * cell is reported. Sorted by field order in the pack, then row.
 */
export function checkRequirements(table: Pick<ExportTable, "headers" | "rows">, pack: RulePack): RequirementIssue[] {
  const colOf = (field: string) => table.headers.findIndex((h) => h.toLowerCase() === field.toLowerCase());
  const out: RequirementIssue[] = [];

  for (const field of pack.requiredFields) {
    const col = colOf(field);
    if (col < 0) {
      out.push({ row: null, field, code: "missing_column" });
      continue;
    }
    table.rows.forEach((r, row) => {
      if ((r[col] ?? "").trim() === "") out.push({ row, field, code: "missing_required" });
    });
  }

  for (const field of Object.keys(pack.formats).sort()) {
    const col = colOf(field);
    if (col < 0) continue;
    const valid = FORMAT_VALIDATORS[pack.formats[field]!];
    table.rows.forEach((r, row) => {
      const v = (r[col] ?? "").trim();
      if (v !== "" && !valid(v)) out.push({ row, field, code: "invalid_format" });
    });
  }
  return out;
}
