"use client";

import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { fetchRulePackManifest } from "@/lib/control-plane-client/rule-packs";
import { isRoleColumn, type KeyColumn } from "@/lib/data-plane/columns";
import type { DateOrder } from "@/lib/data-plane/dates";
import { applyOverrides } from "@/lib/data-plane/overrides";
import type { CountryCode } from "@/lib/data-plane/phone";
import { downloadText } from "@/lib/data-plane/export";
import { analyzeInWorker, compareInWorker, processFileInWorker, resumeInWorker } from "@/lib/data-plane/run";
import { buildSession, isSessionFileName, sessionFileName } from "@/lib/data-plane/session";
import { sampleFile } from "@/lib/data-plane/sample";
import { logEvent, toErrorCode, type ErrorCode } from "@/lib/diagnostics";
import type { Stage } from "@/lib/data-plane/types";
import { loadVerifiedRulePack } from "@/lib/rule-packs/load";
import { useReadyStore, type AnalysisRequest, type Step } from "@/lib/state/store";
import { ConfirmProvider, useConfirm } from "./ConfirmDialog";
import { CrmCompare } from "./CrmCompare";
import { DuplicateReview } from "./DuplicateReview";
import { ExportPanel } from "./ExportPanel";
import { FileDrop } from "./FileDrop";
import { PasteBox } from "./PasteBox";
import { IssuesSummary } from "./IssuesSummary";
import { ProfileSummary } from "./ProfileSummary";
import { ProgressBar } from "./ProgressBar";
import { StepNav, type StepItem } from "./StepNav";

const STAGE_TEXT: Record<Stage, string> = {
  parsing: "Reading your file…",
  profiling: "Looking at your columns…",
  matching: "Finding duplicates…",
  checking: "Checking values…",
};

/** Entrance order of a panel's parts (see `.stagger` in globals.css). */
const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

const ERROR_TEXT: Partial<Record<ErrorCode, string>> = {
  session_invalid: "That doesn't look like a saved Ready session.",
  session_version: "That session was saved by a newer version of Ready. Reload the page and try again.",
  xlsx_invalid: "We couldn't read that Excel file. Try saving it again, or as CSV.",
  xlsx_too_large: "That Excel file is too large to open in the browser. Save it as CSV and try again.",
  xlsx_empty: "That Excel file's first sheet is empty.",
};
const DEFAULT_ERROR_TEXT = "We couldn't read that file. Is it a CSV or Excel file?";

const STEP_LABELS: Record<Step, string> = {
  upload: "Upload",
  fix: "Fix",
  review: "Review",
  export: "Export",
};

export function ReadyApp() {
  return (
    <ConfirmProvider>
      <ReadyFlow />
    </ConfirmProvider>
  );
}

function ReadyFlow() {
  const confirm = useConfirm();
  // This component renders nearly all of the store, so one subscription is simplest.
  const {
    status,
    errorCode,
    fileName,
    step,
    setStep,
    finishRestore,
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
    crmFile,
    crmComparison,
    crmStatus,
    excludeExisting,
    startCompare,
    finishCompare,
    failCompare,
    clearCompare,
    setExcludeExisting,
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
    const hasWork = Object.keys(decisions).length > 0 || Object.keys(overrides).length > 0;
    if (
      status === "ready" &&
      hasWork &&
      !(await confirm("Loading another file replaces this one, with your fixes and merge decisions. Continue?", {
        confirmLabel: "Load file",
      }))
    ) {
      return;
    }
    startProcessing(file.name);
    try {
      if (isSessionFileName(file.name)) finishRestore(await resumeInWorker(file, setStage));
      else finishProcessing(await processFileInWorker(file, setStage));
    } catch (e) {
      const code = toErrorCode(e);
      logEvent({ kind: "error", code });
      failProcessing(code);
    }
  };

  /** Download everything needed to pick up later, as a file only the user holds. */
  const saveSession = () => {
    if (!result) return;
    const session = buildSession({ fileName, result, overrides, decisions, crm, exportOptions, step });
    downloadText(sessionFileName(fileName), JSON.stringify(session), "application/json");
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
  const confirmClearDecisions = async (change: string) =>
    Object.keys(decisions).length === 0 ||
    (await confirm(`Changing ${change} finds duplicates again and clears your merge decisions. Continue?`));

  const onRole = async (role: KeyColumn, col: number | null) => {
    if (await confirmClearDecisions("a column's role")) await reanalyze(setRole(role, col));
  };

  const onDefaultCountry = async (country: CountryCode | null) => {
    if (await confirmClearDecisions("the default phone country")) await reanalyze(setDefaultCountry(country));
  };

  const onDateOrder = (order: DateOrder | null) => reanalyze(setDateOrder(order));

  const onEdit = async (row: number, col: number, value: string) => {
    if (!result) return;
    if (isRoleColumn(result.roles, col) && !(await confirmClearDecisions("a value used to find duplicates"))) return;
    await reanalyze(setOverride(row, col, value));
  };

  // The file as the user has fixed it: what every section shows, merges and exports.
  const edited = useMemo(
    () => (result ? { ...result, parsed: applyOverrides(result.parsed, overrides) } : null),
    [result, overrides],
  );

  // Compare with the CRM export whenever it, the fixed file or the matching inputs
  // change. Only the latest run's result is kept.
  const compareRun = useRef(0);
  useEffect(() => {
    if (!crmFile || !edited || reanalyzing) return;
    const run = ++compareRun.current;
    startCompare(crmFile);
    const inputs = { roles: edited.roles, dateOrder: edited.dateOrder, defaultCountry: edited.defaultCountry };
    compareInWorker(crmFile, edited.parsed, inputs)
      .then((comparison) => run === compareRun.current && finishCompare(crmFile, comparison))
      .catch((e) => {
        logEvent({ kind: "error", code: toErrorCode(e) });
        if (run === compareRun.current) failCompare(crmFile);
      });
  }, [crmFile, edited, reanalyzing, startCompare, finishCompare, failCompare]);

  const existingRows = useMemo(
    () => (excludeExisting && crmComparison ? new Set(crmComparison.matches.map((m) => m.row)) : undefined),
    [excludeExisting, crmComparison],
  );

  const ready = status === "ready" && edited !== null;
  const steps: StepItem<Step>[] = [
    { id: "upload", label: STEP_LABELS.upload },
    { id: "fix", label: STEP_LABELS.fix, count: ready ? edited.cellIssues.length : null, disabled: !ready },
    { id: "review", label: STEP_LABELS.review, count: ready ? edited.duplicates.length : null, disabled: !ready },
    { id: "export", label: STEP_LABELS.export, disabled: !ready },
  ];

  // Move focus to the new step's panel, so keyboard and screen-reader users land
  // on it, and bring it into view. Not on first render: the page just loaded.
  const panelRefs = useRef<Partial<Record<Step, HTMLElement | null>>>({});
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const panel = panelRefs.current[step];
    panel?.focus({ preventScroll: true });
    panel?.scrollIntoView?.({ block: "nearest" });
  }, [step]);

  const panel = (id: Step, children: ReactNode) => (
    <section
      key={id}
      ref={(el) => {
        panelRefs.current[id] = el;
      }}
      // Hidden, not unmounted: filters, pages and open editors survive a step change.
      hidden={step !== id}
      tabIndex={-1}
      aria-label={STEP_LABELS[id]}
      data-testid={`step-${id}`}
      className="stagger flex flex-col gap-6 outline-none"
    >
      {children}
    </section>
  );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="animate-rise">
        <h1 className="text-3xl font-bold text-slate-900">Ready</h1>
        <p className="mt-1 text-slate-600">Get your contact list ready for your CRM — without uploading it anywhere.</p>
      </header>

      <StepNav steps={steps} current={step} onStep={setStep} />

      <div className="flex min-h-6 flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <p role="status" aria-live="polite" className="text-sm text-slate-600" data-testid="status">
            {(status === "processing" || reanalyzing) && (stage ? STAGE_TEXT[stage] : "Processing in your browser…")}
            {status === "error" && ((errorCode && ERROR_TEXT[errorCode]) ?? DEFAULT_ERROR_TEXT)}
            {status === "ready" && !reanalyzing && "Done."}
          </p>
          {ready && (
            <button
              type="button"
              className="animate-pop rounded-lg border bg-white px-3 py-1 text-sm transition hover:-translate-y-0.5 hover:shadow-sm"
              title="Downloads a file with your data, fixes and decisions. Drop it here later to carry on."
              onClick={saveSession}
            >
              Save progress
            </button>
          )}
        </div>
        {(status === "processing" || reanalyzing) && <ProgressBar stage={stage} />}
      </div>

      {panel(
        "upload",
        <>
          <div style={stagger(0)}>
            <FileDrop onFile={onFile} disabled={status === "processing"} />
          </div>
          <div style={stagger(1)} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-slate-500">No file at hand?</span>
            <button
              type="button"
              className="rounded-lg border bg-white px-3 py-1.5 font-medium transition hover:-translate-y-0.5 hover:shadow-sm disabled:opacity-40"
              disabled={status === "processing"}
              onClick={() => void onFile(sampleFile())}
            >
              Try a sample file
            </button>
            <PasteBox onFile={(file) => void onFile(file)} disabled={status === "processing"} />
            {ready && (
              <button
                type="button"
                className="ml-auto rounded-lg bg-emerald-600 px-4 py-1.5 font-medium text-white hover:bg-emerald-700"
                onClick={() => setStep("fix")}
              >
                Continue with this file →
              </button>
            )}
          </div>
        </>,
      )}

      {ready && (
        <>
          {panel(
            "fix",
            <>
              <div style={stagger(0)}>
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
              </div>
              <div style={stagger(1)}>
                <IssuesSummary
                  headers={edited.parsed.headers}
                  rows={edited.parsed.rows}
                  issues={edited.cellIssues}
                  onDateOrder={onDateOrder}
                  onEdit={onEdit}
                  busy={reanalyzing}
                />
              </div>
              <NextButton style={stagger(2)} onClick={() => setStep("review")}>
                Next: review duplicates
              </NextButton>
            </>,
          )}
          {panel(
            "review",
            <>
              <div style={stagger(0)}>
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
              </div>
              <div style={stagger(1)}>
                <CrmCompare
                  parsed={edited.parsed}
                  roles={edited.roles}
                  fileName={crmFile?.name ?? null}
                  comparison={crmComparison}
                  status={crmStatus}
                  onFile={startCompare}
                  onClear={clearCompare}
                  exclude={excludeExisting}
                  onExclude={setExcludeExisting}
                />
              </div>
              <NextButton style={stagger(2)} onClick={() => setStep("export")}>
                Next: export
              </NextButton>
            </>,
          )}
          {panel(
            "export",
            <>
              <div style={stagger(0)}>
                <ExportPanel
                  result={edited}
                  decisions={decisions}
                  crm={crm}
                  options={exportOptions}
                  onCrm={setCrm}
                  onOption={setExportOption}
                  rulePack={rulePack}
                  rulePackStatus={rulePackStatus}
                  existingRows={existingRows}
                />
              </div>
              <div style={stagger(1)} className="flex gap-3">
                <button type="button" className="rounded-lg border px-4 py-2" onClick={reset}>
                  Start over
                </button>
              </div>
            </>,
          )}
        </>
      )}

      <footer className="text-xs text-slate-400">
        {manifest ? `Rule packs: ${manifest.packs.map((p) => `${p.crm} ${p.version}`).join(" · ")}` : null}
      </footer>
    </main>
  );
}

function NextButton({ children, onClick, style }: { children: ReactNode; onClick: () => void; style?: CSSProperties }) {
  return (
    <div style={style} className="flex justify-end">
      <button
        type="button"
        className="group rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-700"
        onClick={onClick}
      >
        {children}{" "}
        <span aria-hidden="true" className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">
          →
        </span>
      </button>
    </div>
  );
}
