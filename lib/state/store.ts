"use client";

import { create } from "zustand";
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
  manifest: RulePackManifest | null;

  startProcessing: (fileName: string) => void;
  finishProcessing: (result: ProcessResult) => void;
  failProcessing: () => void;
  selectCandidate: (index: number) => void;
  setManifest: (manifest: RulePackManifest | null) => void;
  reset: () => void;
}

const initial = {
  status: "idle" as Status,
  fileName: null,
  result: null,
  selectedCandidate: 0,
};

export const useReadyStore = create<ReadyState>()((set) => ({
  ...initial,
  manifest: null,
  startProcessing: (fileName) => set({ ...initial, status: "processing", fileName }),
  finishProcessing: (result) => set({ status: "ready", result, selectedCandidate: 0 }),
  failProcessing: () => set({ status: "error", result: null }),
  selectCandidate: (selectedCandidate) => set({ selectedCandidate }),
  setManifest: (manifest) => set({ manifest }),
  reset: () => set(initial),
}));
