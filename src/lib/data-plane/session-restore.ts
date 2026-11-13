import "client-only";
import { pairKey } from "./merge";
import { applyOverrides } from "./overrides";
import { analyze } from "./process";
import { profileColumns } from "./profile";
import type { RestoredSession, Session } from "./session";
import type { Stage } from "./types";

/**
 * Rebuild everything from a session: profile from the file as loaded, analysis
 * over the file as fixed (as after an edit), and only the decisions whose pair
 * is still found.
 */
export function restoreSession(session: Session, onStage?: (stage: Stage) => void): RestoredSession {
  onStage?.("profiling");
  const { parsed } = session;
  const profile = profileColumns(parsed);
  const analysis = analyze(applyOverrides(parsed, session.overrides), profile, session.inputs, onStage);
  const found = new Set(analysis.duplicates.map(pairKey));
  const decisions = Object.fromEntries(Object.entries(session.decisions).filter(([key]) => found.has(key)));
  return {
    fileName: session.fileName,
    result: { parsed, profile, ...session.inputs, ...analysis },
    overrides: session.overrides,
    decisions,
    crm: session.crm,
    exportOptions: session.exportOptions,
    step: session.step,
  };
}
