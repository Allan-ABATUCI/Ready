"use client";

import { create } from "zustand";
import { isExactMatch, pairKey, type Decisions, type FieldSide, type PairAction } from "@/lib/data-plane/merge";
import { DEFAULT_EXPORT_OPTIONS, type ExportOptions, type SetExportOption } from "@/lib/data-plane/export-table";
import { assignRole, type ColumnRoles, type KeyColumn } from "@/lib/data-plane/columns";
import type { Analysis, ProcessResult, Stage } from "@/lib/data-plane/types";
import type { Crm, RulePack, RulePackManifest, RulePackStatus } from "@/lib/rule-packs/types";

export type Status = "idle" | "processing" | "ready" | "error";

/**
 * In-memory app state. Not persisted (no `persist` middleware) — file data must
 * not land in localStorage/IndexedDB or anything that might sync off-device.
 */
export interface ReadyState {
  status: Status;
  fileName: string | null;
  /** Current pipeline stage while processing or re-analyzing; null otherwise. */
  stage: Stage | null;
  result: ProcessResult | null;
  /** True while duplicates and issues are recomputed after a role change. */
  reanalyzing: boolean;
  selectedCandidate: number;
  /** Merge decisions keyed by `pairKey` ("a:b"). */
  decisions: Decisions;
  /** Destination CRM picked by the user; export is disabled until set. */
  crm: Crm | null;
  exportOptions: ExportOptions;
  /** Verified rule pack for `crm`; never set from an unverified pack. */
  rulePack: RulePack | null;
  rulePackStatus: RulePackStatus;
  manifest: RulePackManifest | null;

  startProcessing: (fileName: string) => void;
  setStage: (stage: Stage) => void;
  finishProcessing: (result: ProcessResult) => void;
  failProcessing: () => void;
  /**
   * Give `role` to column `col` (null: to no column), moving it off any other
   * column. Clears merge decisions, since candidate pairs will change, and
   * returns the new roles for the caller to re-analyze with (null if no file).
   */
  setRole: (role: KeyColumn, col: number | null) => ColumnRoles | null;
  /** Store a re-analysis; ignored if the roles have changed again since it started. */
  finishAnalysis: (roles: ColumnRoles, analysis: Analysis) => void;
  selectCandidate: (index: number) => void;
  /** Set the action for candidate `index`, keeping any field picks. */
  decide: (index: number, action: PairAction) => void;
  /** Pick a side for one column of candidate `index`. Implies "merge". */
  chooseField: (index: number, col: number, side: FieldSide) => void;
  /** Mark every undecided exact match (see `isExactMatch`) as "merge". */
  mergeAllExact: () => void;
  setCrm: (crm: Crm) => void;
  setExportOption: SetExportOption;
  /** Store the result of loading `crm`'s pack; ignored if the user has since picked another CRM. */
  setRulePack: (crm: Crm, pack: RulePack | null) => void;
  setManifest: (manifest: RulePackManifest | null) => void;
  reset: () => void;
}

const initial = {
  status: "idle" as Status,
  fileName: null,
  stage: null as Stage | null,
  result: null,
  reanalyzing: false,
  selectedCandidate: 0,
  decisions: {} as Decisions,
  crm: null as Crm | null,
  exportOptions: DEFAULT_EXPORT_OPTIONS,
  rulePack: null as RulePack | null,
  rulePackStatus: "idle" as RulePackStatus,
};

export const useReadyStore = create<ReadyState>()((set, get) => {
  const keyOf = (index: number): string | null => {
    const c = get().result?.duplicates[index];
    return c ? pairKey(c) : null;
  };

  return {
    ...initial,
    manifest: null,
    startProcessing: (fileName) => set({ ...initial, status: "processing", fileName }),
    // A late progress message must not flip a finished or failed run back to a stage.
    setStage: (stage) => {
      if (get().status === "processing" || get().reanalyzing) set({ stage });
    },
    finishProcessing: (result) => set({ status: "ready", stage: null, result, selectedCandidate: 0, decisions: {} }),
    failProcessing: () => set({ status: "error", stage: null, result: null, reanalyzing: false, decisions: {} }),
    setRole: (role, col) => {
      const { result } = get();
      if (!result) return null;
      const roles = assignRole(result.roles, role, col);
      set({ result: { ...result, roles }, reanalyzing: true, decisions: {}, selectedCandidate: 0 });
      return roles;
    },
    finishAnalysis: (roles, analysis) => {
      const { result } = get();
      // Identity check: a newer setRole replaced `result.roles`, so this analysis is stale.
      if (!result || result.roles !== roles) return;
      set({
        result: { ...result, ...analysis },
        reanalyzing: false,
        stage: null,
        decisions: {},
        selectedCandidate: 0,
      });
    },
    selectCandidate: (selectedCandidate) => set({ selectedCandidate }),
    decide: (index, action) => {
      const key = keyOf(index);
      if (!key) return;
      const { decisions } = get();
      set({ decisions: { ...decisions, [key]: { action, fields: decisions[key]?.fields ?? {} } } });
    },
    chooseField: (index, col, side) => {
      const key = keyOf(index);
      if (!key) return;
      const { decisions } = get();
      const fields = { ...decisions[key]?.fields, [col]: side };
      set({ decisions: { ...decisions, [key]: { action: "merge", fields } } });
    },
    mergeAllExact: () => {
      const { result, decisions } = get();
      if (!result) return;
      const next = { ...decisions };
      for (const c of result.duplicates) {
        const key = pairKey(c);
        if (isExactMatch(c) && !next[key]) next[key] = { action: "merge", fields: {} };
      }
      set({ decisions: next });
    },
    setCrm: (crm) => {
      if (get().crm !== crm) set({ crm, rulePack: null, rulePackStatus: "loading" });
    },
    setRulePack: (crm, pack) => {
      if (get().crm !== crm) return;
      set({ rulePack: pack, rulePackStatus: pack ? "verified" : "failed" });
    },
    setExportOption: (key, value) => set({ exportOptions: { ...get().exportOptions, [key]: value } }),
    setManifest: (manifest) => set({ manifest }),
    reset: () => set(initial),
  };
});
