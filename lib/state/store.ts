"use client";

import { create } from "zustand";
import { isExactMatch, pairKey, type Decisions, type FieldSide, type PairAction } from "@/lib/data-plane/merge";
import { DEFAULT_EXPORT_OPTIONS, type ExportOptions, type SetExportOption } from "@/lib/data-plane/export-table";
import { assignRole, type KeyColumn } from "@/lib/data-plane/columns";
import type { DateOrder } from "@/lib/data-plane/dates";
import type { Analysis, AnalysisInputs, ProcessResult, Stage } from "@/lib/data-plane/types";
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
  /**
   * The re-analysis in progress after a role or date-order change, or null.
   * `inputs` is compared by identity to drop results that a newer change made stale.
   */
  pendingAnalysis: { inputs: AnalysisInputs; clearsDecisions: boolean } | null;
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
   * returns the inputs for the caller to re-analyze with (null if no file).
   */
  setRole: (role: KeyColumn, col: number | null) => AnalysisInputs | null;
  /**
   * Read dates in `order` (null: "not sure"). Keeps merge decisions, since dates
   * don't affect duplicate pairs. Returns the inputs to re-analyze with, or null
   * if there is no file or nothing changed.
   */
  setDateOrder: (order: DateOrder | null) => AnalysisInputs | null;
  /** Store a re-analysis; ignored if the inputs have changed again since it started. */
  finishAnalysis: (inputs: AnalysisInputs, analysis: Analysis) => void;
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
  pendingAnalysis: null as ReadyState["pendingAnalysis"],
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

  const startAnalysis = (result: ProcessResult, inputs: AnalysisInputs, clearsDecisions: boolean) => {
    // If a role change is still being analyzed, this run replaces it, so it must
    // also clear decisions the user made against the old pairs in the meantime.
    const clears = clearsDecisions || (get().pendingAnalysis?.clearsDecisions ?? false);
    set({
      result: { ...result, ...inputs },
      pendingAnalysis: { inputs, clearsDecisions: clears },
      ...(clearsDecisions && { decisions: {}, selectedCandidate: 0 }),
    });
    return inputs;
  };

  return {
    ...initial,
    manifest: null,
    startProcessing: (fileName) => set({ ...initial, status: "processing", fileName }),
    // A late progress message must not flip a finished or failed run back to a stage.
    setStage: (stage) => {
      if (get().status === "processing" || get().pendingAnalysis) set({ stage });
    },
    finishProcessing: (result) => set({ status: "ready", stage: null, result, selectedCandidate: 0, decisions: {} }),
    failProcessing: () => set({ status: "error", stage: null, result: null, pendingAnalysis: null, decisions: {} }),
    setRole: (role, col) => {
      const { result } = get();
      if (!result) return null;
      return startAnalysis(result, { roles: assignRole(result.roles, role, col), dateOrder: result.dateOrder }, true);
    },
    setDateOrder: (dateOrder) => {
      const { result } = get();
      if (!result || result.dateOrder === dateOrder) return null;
      // Duplicate matching never looks at dates, so the pairs and decisions stay valid.
      return startAnalysis(result, { roles: result.roles, dateOrder }, false);
    },
    finishAnalysis: (inputs, analysis) => {
      const { result, pendingAnalysis } = get();
      // Identity check: a newer change replaced the pending inputs, so this analysis is stale.
      if (!result || pendingAnalysis?.inputs !== inputs) return;
      set({
        result: { ...result, ...analysis },
        pendingAnalysis: null,
        stage: null,
        ...(pendingAnalysis.clearsDecisions && { decisions: {}, selectedCandidate: 0 }),
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
