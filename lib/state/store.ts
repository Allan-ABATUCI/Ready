"use client";

import { create } from "zustand";
import { isExactMatch, pairKey, type Decisions, type FieldSide, type PairAction } from "@/lib/data-plane/merge";
import type { ProcessResult } from "@/lib/data-plane/types";
import type { RulePackManifest } from "@/lib/rule-packs/types";

export type Status = "idle" | "processing" | "ready" | "error";

/**
 * In-memory app state. Not persisted (no `persist` middleware) — file data must
 * not land in localStorage/IndexedDB or anything that might sync off-device.
 */
export interface ReadyState {
  status: Status;
  fileName: string | null;
  result: ProcessResult | null;
  selectedCandidate: number;
  /** Merge decisions keyed by `pairKey` ("a:b"). */
  decisions: Decisions;
  manifest: RulePackManifest | null;

  startProcessing: (fileName: string) => void;
  finishProcessing: (result: ProcessResult) => void;
  failProcessing: () => void;
  selectCandidate: (index: number) => void;
  /** Set the action for candidate `index`, keeping any field picks. */
  decide: (index: number, action: PairAction) => void;
  /** Pick a side for one column of candidate `index`. Implies "merge". */
  chooseField: (index: number, col: number, side: FieldSide) => void;
  /** Mark every undecided exact match (see `isExactMatch`) as "merge". */
  mergeAllExact: () => void;
  setManifest: (manifest: RulePackManifest | null) => void;
  reset: () => void;
}

const initial = {
  status: "idle" as Status,
  fileName: null,
  result: null,
  selectedCandidate: 0,
  decisions: {} as Decisions,
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
    finishProcessing: (result) => set({ status: "ready", result, selectedCandidate: 0, decisions: {} }),
    failProcessing: () => set({ status: "error", result: null, decisions: {} }),
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
    setManifest: (manifest) => set({ manifest }),
    reset: () => set(initial),
  };
});
