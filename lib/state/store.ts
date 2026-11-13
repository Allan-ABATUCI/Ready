"use client";

import { create } from "zustand";
import { isExactMatch, pairKey, type Decisions, type FieldSide, type PairAction } from "@/lib/data-plane/merge";
import { DEFAULT_EXPORT_OPTIONS, type ExportOptions, type SetExportOption } from "@/lib/data-plane/export-table";
import { assignRole, isRoleColumn, type KeyColumn } from "@/lib/data-plane/columns";
import { cellKey, type Overrides } from "@/lib/data-plane/overrides";
import type { DateOrder } from "@/lib/data-plane/dates";
import { STEP_IDS, type RestoredSession, type SessionStep } from "@/lib/data-plane/session";
import type { CountryCode } from "@/lib/data-plane/phone";
import type { AnalysisInputs, AnalysisScope, AnalysisUpdate, ProcessResult, Stage } from "@/lib/data-plane/types";
import type { ErrorCode } from "@/lib/diagnostics";
import type { Crm, RulePack, RulePackManifest, RulePackStatus } from "@/lib/rule-packs/types";

/**
 * A re-analysis to run. Scope "all" means duplicate pairs may change, so it also
 * clears merge decisions; "issues" keeps them.
 */
export interface AnalysisRequest {
  inputs: AnalysisInputs;
  scope: AnalysisScope;
}

const inputsOf = ({ roles, dateOrder, defaultCountry }: AnalysisInputs): AnalysisInputs => ({
  roles,
  dateOrder,
  defaultCountry,
});

export type Status = "idle" | "processing" | "ready" | "error";

/** The guided flow's steps, in order. */
export const STEPS = STEP_IDS;
export type Step = SessionStep;

/** Undo steps kept. Each is a full `decisions` snapshot, so this bounds memory on large files. */
export const HISTORY_LIMIT = 50;

/**
 * In-memory app state. Not persisted (no `persist` middleware) — file data must
 * not land in localStorage/IndexedDB or anything that might sync off-device.
 */
export interface ReadyState {
  status: Status;
  /** Why the last load failed, when `status` is "error". A code only. */
  errorCode: ErrorCode | null;
  /** The step shown. Only "upload" is reachable until a file is ready. */
  step: Step;
  fileName: string | null;
  /** Current pipeline stage while processing or re-analyzing; null otherwise. */
  stage: Stage | null;
  result: ProcessResult | null;
  /**
   * The re-analysis in progress after a change, or null. `inputs` is compared by
   * identity to drop results that a newer change made stale.
   */
  pendingAnalysis: AnalysisRequest | null;
  selectedCandidate: number;
  /** Merge decisions keyed by `pairKey` ("a:b"). */
  decisions: Decisions;
  /** Earlier `decisions`, oldest first, for undo. One entry per user action, bulk ones included. */
  history: Decisions[];
  /**
   * Cells the user fixed by hand. `result.parsed` stays as loaded; everything
   * downstream (re-analysis, review, merge, export) uses `applyOverrides`.
   */
  overrides: Overrides;
  /** Destination CRM picked by the user; export is disabled until set. */
  crm: Crm | null;
  exportOptions: ExportOptions;
  /** Verified rule pack for `crm`; never set from an unverified pack. */
  rulePack: RulePack | null;
  rulePackStatus: RulePackStatus;
  manifest: RulePackManifest | null;

  /** Go to a step; ignored for a later step while no file is ready. */
  setStep: (step: Step) => void;
  startProcessing: (fileName: string) => void;
  setStage: (stage: Stage) => void;
  finishProcessing: (result: ProcessResult) => void;
  /** Load a saved session: the file, fixes, decisions and settings, on the step it was saved at. */
  finishRestore: (restored: RestoredSession) => void;
  failProcessing: (code?: ErrorCode) => void;
  /**
   * Give `role` to column `col` (null: to no column), moving it off any other
   * column. Clears merge decisions, since candidate pairs will change, and
   * returns the inputs for the caller to re-analyze with (null if no file).
   */
  setRole: (role: KeyColumn, col: number | null) => AnalysisRequest | null;
  /**
   * Read dates in `order` (null: "not sure"). Keeps merge decisions, since dates
   * don't affect duplicate pairs. Returns the inputs to re-analyze with, or null
   * if there is no file or nothing changed.
   */
  setDateOrder: (order: DateOrder | null) => AnalysisRequest | null;
  /**
   * Read national phone numbers as from `country` (null: none). Clears merge
   * decisions, since phone matches change. Returns the inputs to re-analyze
   * with, or null if there is no file or nothing changed.
   */
  setDefaultCountry: (country: CountryCode | null) => AnalysisRequest | null;
  /**
   * Replace one cell's value. Editing a role column changes what duplicates are
   * found, so it clears decisions and needs scope "all"; other columns only need
   * issues re-checked. Returns what to re-analyze, or null if nothing changed.
   */
  setOverride: (row: number, col: number, value: string) => AnalysisRequest | null;
  /** Store a re-analysis; ignored if the inputs have changed again since it started. */
  finishAnalysis: (inputs: AnalysisInputs, analysis: AnalysisUpdate) => void;
  selectCandidate: (index: number) => void;
  /** Set the action for candidate `index`, keeping any field picks. */
  decide: (index: number, action: PairAction) => void;
  /** Pick a side for one column of candidate `index`. Implies "merge". */
  chooseField: (index: number, col: number, side: FieldSide) => void;
  /** Mark every undecided exact match (see `isExactMatch`) as "merge". */
  mergeAllExact: () => void;
  /** Set the action for every candidate in `indexes`, keeping field picks. One undo step. */
  decideMany: (indexes: number[], action: PairAction) => void;
  /** Restore the decisions from before the last change, if any. */
  undo: () => void;
  setCrm: (crm: Crm) => void;
  setExportOption: SetExportOption;
  /** Store the result of loading `crm`'s pack; ignored if the user has since picked another CRM. */
  setRulePack: (crm: Crm, pack: RulePack | null) => void;
  setManifest: (manifest: RulePackManifest | null) => void;
  reset: () => void;
}

const initial = {
  status: "idle" as Status,
  errorCode: null as ErrorCode | null,
  step: "upload" as Step,
  fileName: null,
  stage: null as Stage | null,
  result: null,
  pendingAnalysis: null as ReadyState["pendingAnalysis"],
  selectedCandidate: 0,
  decisions: {} as Decisions,
  history: [] as Decisions[],
  overrides: {} as Overrides,
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

  /** Replace the decisions, recording the old ones for undo. */
  const commitDecisions = (next: Decisions) => {
    const { decisions, history } = get();
    set({ decisions: next, history: [...history, decisions].slice(-HISTORY_LIMIT) });
  };

  // Undo can't restore decisions about pairs that no longer exist, so every
  // place that clears decisions because pairs changed also clears the history.
  const cleared = { decisions: {}, history: [], selectedCandidate: 0 };

  const startAnalysis = (result: ProcessResult, inputs: AnalysisInputs, scope: AnalysisScope): AnalysisRequest => {
    // This run replaces any pending one. If that one was full, this one must be
    // too, or the new pairs (and the clearing of decisions made against the old
    // ones in the meantime) would be lost.
    const request = { inputs, scope: get().pendingAnalysis?.scope === "all" ? "all" : scope } as const;
    set({ result: { ...result, ...inputs }, pendingAnalysis: request, ...(scope === "all" && cleared) });
    return request;
  };

  return {
    ...initial,
    manifest: null,
    setStep: (step) => {
      if (step === "upload" || get().status === "ready") set({ step });
    },
    startProcessing: (fileName) => set({ ...initial, status: "processing", fileName }),
    // A late progress message must not flip a finished or failed run back to a stage.
    setStage: (stage) => {
      if (get().status === "processing" || get().pendingAnalysis) set({ stage });
    },
    // A new file starts at the first step that needs the user: checking columns and values.
    finishProcessing: (result) => set({ status: "ready", step: "fix", stage: null, result, overrides: {}, ...cleared }),
    finishRestore: ({ fileName, result, overrides, decisions, crm, exportOptions, step }) =>
      set({
        ...initial,
        status: "ready",
        fileName,
        result,
        overrides,
        decisions,
        crm,
        exportOptions,
        step,
        rulePackStatus: crm ? "loading" : "idle",
      }),
    failProcessing: (errorCode = "unknown") =>
      set({ status: "error", errorCode, stage: null, result: null, pendingAnalysis: null, ...cleared }),
    setRole: (role, col) => {
      const { result } = get();
      if (!result) return null;
      return startAnalysis(result, { ...inputsOf(result), roles: assignRole(result.roles, role, col) }, "all");
    },
    setDateOrder: (dateOrder) => {
      const { result } = get();
      if (!result || result.dateOrder === dateOrder) return null;
      // Duplicate matching never looks at dates, so the pairs and decisions stay valid.
      return startAnalysis(result, { ...inputsOf(result), dateOrder }, "issues");
    },
    setDefaultCountry: (defaultCountry) => {
      const { result } = get();
      if (!result || result.defaultCountry === defaultCountry) return null;
      // Phone keys change, so pairs may appear or disappear.
      return startAnalysis(result, { ...inputsOf(result), defaultCountry }, "all");
    },
    setOverride: (row, col, value) => {
      const { result, overrides } = get();
      if (!result || !result.parsed.rows[row]) return null;
      const current = overrides[cellKey(row, col)] ?? result.parsed.rows[row][col] ?? "";
      if (value === current) return null;
      set({ overrides: { ...overrides, [cellKey(row, col)]: value } });
      // A fresh inputs object, so an older analysis still running is recognized as stale.
      return startAnalysis(result, inputsOf(result), isRoleColumn(result.roles, col) ? "all" : "issues");
    },
    finishAnalysis: (inputs, analysis) => {
      const { result, pendingAnalysis } = get();
      // Identity check: a newer change replaced the pending inputs, so this analysis is stale.
      if (!result || pendingAnalysis?.inputs !== inputs) return;
      set({
        result: { ...result, ...analysis },
        pendingAnalysis: null,
        stage: null,
        ...(pendingAnalysis.scope === "all" && cleared),
      });
    },
    selectCandidate: (selectedCandidate) => set({ selectedCandidate }),
    decide: (index, action) => {
      const key = keyOf(index);
      if (!key) return;
      const { decisions } = get();
      if (decisions[key]?.action === action) return; // no-op: don't add an undo step
      commitDecisions({ ...decisions, [key]: { action, fields: decisions[key]?.fields ?? {} } });
    },
    chooseField: (index, col, side) => {
      const key = keyOf(index);
      if (!key) return;
      const { decisions } = get();
      const fields = { ...decisions[key]?.fields, [col]: side };
      commitDecisions({ ...decisions, [key]: { action: "merge", fields } });
    },
    mergeAllExact: () => {
      const { result, decisions } = get();
      if (!result) return;
      const exact = result.duplicates.flatMap((c, i) => (isExactMatch(c) && !decisions[pairKey(c)] ? [i] : []));
      get().decideMany(exact, "merge");
    },
    decideMany: (indexes, action) => {
      const { result, decisions } = get();
      if (!result) return;
      const next = { ...decisions };
      let changed = false;
      for (const i of indexes) {
        const c = result.duplicates[i];
        if (!c) continue;
        const key = pairKey(c);
        if (next[key]?.action === action) continue;
        next[key] = { action, fields: next[key]?.fields ?? {} };
        changed = true;
      }
      if (changed) commitDecisions(next);
    },
    undo: () => {
      const { history } = get();
      const previous = history.at(-1);
      if (previous) set({ decisions: previous, history: history.slice(0, -1) });
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
