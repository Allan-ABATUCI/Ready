"use client";

import { useEffect } from "react";
import { fetchRulePackManifest } from "@/lib/control-plane-client/rule-packs";
import type { KeyColumn } from "@/lib/data-plane/columns";
import type { DateOrder } from "@/lib/data-plane/dates";
import { analyzeInWorker, processFileInWorker } from "@/lib/data-plane/run";
import { logEvent, toErrorCode } from "@/lib/diagnostics";
import type { AnalysisInputs, Stage } from "@/lib/data-plane/types";
import { loadVerifiedRulePack } from "@/lib/rule-packs/load";
import { useReadyStore } from "@/lib/state/store";
import { DuplicateReview } from "./DuplicateReview";
import { ExportPanel } from "./ExportPanel";
import { FileDrop } from "./FileDrop";
import { IssuesSummary } from "./IssuesSummary";
import { ProfileSummary } from "./ProfileSummary";

const STAGE_TEXT: Record<Stage, string> = {
  parsing: "Reading your file…",
  profiling: "Looking at your columns…",
  matching: "Finding duplicates…",
  checking: "Checking values…",
};

export function ReadyApp() {
  // This component renders nearly all of the store, so one subscription is simplest.
  const {
    status,
    stage,
    result,
    pendingAnalysis,
    selectedCandidate,
    decisions,
    crm,
    exportOptions,
    rulePack,
    rulePackStatus,
    manifest,
    startProcessing,
    setStage,
    finishProcessing,
    failProcessing,
    setRole,
    setDateOrder,
    finishAnalysis,
    selectCandidate,
    decide,
    chooseField,
    mergeAllExact,
    setCrm,
    setExportOption,
    setRulePack,
    setManifest,
    reset,
  } = useReadyStore();
  const reanalyzing = pendingAnalysis !== null;

  useEffect(() => {
    void fetchRulePackManifest().then((manifest) => {
      logEvent({ kind: "manifest", status: manifest ? "loaded" : "failed" });
      setManifest(manifest);
    });
  }, [setManifest]);

  // Only the CRM identifier the user picked is sent; the pack is verified before use.
  useEffect(() => {
    if (crm) void loadVerifiedRulePack(crm).then((pack) => setRulePack(crm, pack));
  }, [crm, setRulePack]);

  const onFile = async (file: File) => {
    startProcessing(file.name);
    try {
      finishProcessing(await processFileInWorker(file, setStage));
    } catch (e) {
      logEvent({ kind: "error", code: toErrorCode(e) });
      failProcessing();
    }
  };

  const reanalyze = async (inputs: AnalysisInputs | null) => {
    if (!inputs || !result) return;
    try {
      finishAnalysis(inputs, await analyzeInWorker(result.parsed, result.profile, inputs, setStage));
    } catch (e) {
      // The analysis is pure code over data that already parsed, so this is not
      // expected; fail visibly rather than show results for the old inputs.
      logEvent({ kind: "error", code: toErrorCode(e) });
      failProcessing();
    }
  };

  const onRole = async (role: KeyColumn, col: number | null) => {
    const hasDecisions = Object.keys(decisions).length > 0;
    if (
      hasDecisions &&
      !window.confirm("Changing a column's role finds duplicates again and clears your merge decisions. Continue?")
    ) {
      return;
    }
    await reanalyze(setRole(role, col));
  };

  const onDateOrder = (order: DateOrder | null) => reanalyze(setDateOrder(order));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">Ready</h1>
        <p className="mt-1 text-slate-600">Get your contact list ready for your CRM — without uploading it anywhere.</p>
      </header>

      <FileDrop onFile={onFile} disabled={status === "processing"} />

      <p role="status" aria-live="polite" className="text-sm text-slate-600" data-testid="status">
        {(status === "processing" || reanalyzing) && (stage ? STAGE_TEXT[stage] : "Processing in your browser…")}
        {status === "error" && "We couldn't read that file. Is it a CSV?"}
        {status === "ready" && !reanalyzing && "Done."}
      </p>

      {status === "ready" && result && (
        <>
          <ProfileSummary
            profile={result.profile}
            rowCount={result.parsed.rows.length}
            encoding={result.parsed.encoding}
            roles={result.roles}
            onRole={onRole}
            dateOrder={result.dateOrder}
            onDateOrder={onDateOrder}
            busy={reanalyzing}
          />
          <IssuesSummary
            headers={result.parsed.headers}
            rows={result.parsed.rows}
            issues={result.cellIssues}
            onDateOrder={onDateOrder}
            busy={reanalyzing}
          />
          <DuplicateReview
            parsed={result.parsed}
            candidates={result.duplicates}
            skippedLargeBlocks={result.skippedLargeBlocks}
            selected={selectedCandidate}
            onSelect={selectCandidate}
            decisions={decisions}
            onDecide={decide}
            onChooseField={chooseField}
            onMergeAllExact={mergeAllExact}
          />
          <ExportPanel
            result={result}
            decisions={decisions}
            crm={crm}
            options={exportOptions}
            onCrm={setCrm}
            onOption={setExportOption}
            rulePack={rulePack}
            rulePackStatus={rulePackStatus}
          />
          <div className="flex gap-3">
            <button type="button" className="rounded-lg border px-4 py-2" onClick={reset}>
              Start over
            </button>
          </div>
        </>
      )}

      <footer className="text-xs text-slate-400">
        {manifest ? `Rule packs: ${manifest.packs.map((p) => `${p.crm} ${p.version}`).join(" · ")}` : null}
      </footer>
    </main>
  );
}
