"use client";

import { useEffect, useMemo } from "react";
import { fetchRulePackManifest } from "@/lib/control-plane-client/rule-packs";
import { isRoleColumn, type KeyColumn } from "@/lib/data-plane/columns";
import type { DateOrder } from "@/lib/data-plane/dates";
import { applyOverrides } from "@/lib/data-plane/overrides";
import type { CountryCode } from "@/lib/data-plane/phone";
import { analyzeInWorker, processFileInWorker } from "@/lib/data-plane/run";
import { logEvent, toErrorCode } from "@/lib/diagnostics";
import type { Stage } from "@/lib/data-plane/types";
import { loadVerifiedRulePack } from "@/lib/rule-packs/load";
import { useReadyStore, type AnalysisRequest } from "@/lib/state/store";
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
    history,
    overrides,
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
    setDefaultCountry,
    setOverride,
    finishAnalysis,
    selectCandidate,
    decide,
    chooseField,
    mergeAllExact,
    decideMany,
    undo,
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

  const reanalyze = async (request: AnalysisRequest | null) => {
    // Read the store now, not the render's `result`: the request was just made,
    // and an edit's override isn't in this render's state yet.
    const { result: current, overrides: edits } = useReadyStore.getState();
    if (!request || !current) return;
    const { inputs, scope } = request;
    try {
      const parsed = applyOverrides(current.parsed, edits);
      finishAnalysis(inputs, await analyzeInWorker(parsed, current.profile, inputs, scope, setStage));
    } catch (e) {
      // The analysis is pure code over data that already parsed, so this is not
      // expected; fail visibly rather than show results for the old inputs.
      logEvent({ kind: "error", code: toErrorCode(e) });
      failProcessing();
    }
  };

  /** Changes that alter duplicate pairs clear merge decisions, so ask first if there are any. */
  const confirmClearDecisions = (change: string) =>
    Object.keys(decisions).length === 0 ||
    window.confirm(`Changing ${change} finds duplicates again and clears your merge decisions. Continue?`);

  const onRole = async (role: KeyColumn, col: number | null) => {
    if (confirmClearDecisions("a column's role")) await reanalyze(setRole(role, col));
  };

  const onDefaultCountry = async (country: CountryCode | null) => {
    if (confirmClearDecisions("the default phone country")) await reanalyze(setDefaultCountry(country));
  };

  const onDateOrder = (order: DateOrder | null) => reanalyze(setDateOrder(order));

  const onEdit = async (row: number, col: number, value: string) => {
    if (!result) return;
    if (isRoleColumn(result.roles, col) && !confirmClearDecisions("a value used to find duplicates")) return;
    await reanalyze(setOverride(row, col, value));
  };

  // The file as the user has fixed it: what every section shows, merges and exports.
  const edited = useMemo(
    () => (result ? { ...result, parsed: applyOverrides(result.parsed, overrides) } : null),
    [result, overrides],
  );

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

      {status === "ready" && edited && (
        <>
          <ProfileSummary
            profile={edited.profile}
            rowCount={edited.parsed.rows.length}
            encoding={edited.parsed.encoding}
            roles={edited.roles}
            onRole={onRole}
            dateOrder={edited.dateOrder}
            onDateOrder={onDateOrder}
            defaultCountry={edited.defaultCountry}
            onDefaultCountry={onDefaultCountry}
            busy={reanalyzing}
          />
          <IssuesSummary
            headers={edited.parsed.headers}
            rows={edited.parsed.rows}
            issues={edited.cellIssues}
            onDateOrder={onDateOrder}
            onEdit={onEdit}
            busy={reanalyzing}
          />
          <DuplicateReview
            parsed={edited.parsed}
            candidates={edited.duplicates}
            roles={edited.roles}
            skippedLargeBlocks={edited.skippedLargeBlocks}
            selected={selectedCandidate}
            onSelect={selectCandidate}
            decisions={decisions}
            onDecide={decide}
            onChooseField={chooseField}
            onMergeAllExact={mergeAllExact}
            onDecideMany={decideMany}
            onUndo={undo}
            canUndo={history.length > 0}
          />
          <ExportPanel
            result={edited}
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
