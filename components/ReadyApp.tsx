"use client";

import { useEffect } from "react";
import { fetchRulePackManifest } from "@/lib/control-plane-client/rule-packs";
import { downloadCsv } from "@/lib/data-plane/export";
import { applyDecisions } from "@/lib/data-plane/merge";
import { processFileInWorker } from "@/lib/data-plane/run";
import { useReadyStore } from "@/lib/state/store";
import { DuplicateReview } from "./DuplicateReview";
import { FileDrop } from "./FileDrop";
import { IssuesSummary } from "./IssuesSummary";
import { ProfileSummary } from "./ProfileSummary";

export function ReadyApp() {
  const { status, result, selectedCandidate, decisions, manifest } = useReadyStore();
  const { startProcessing, finishProcessing, failProcessing, selectCandidate, setManifest, reset } = useReadyStore();
  const { decide, chooseField, mergeAllExact } = useReadyStore();

  useEffect(() => {
    void fetchRulePackManifest().then(setManifest);
  }, [setManifest]);

  const onFile = async (file: File) => {
    startProcessing(file.name);
    try {
      finishProcessing(await processFileInWorker(file));
    } catch {
      failProcessing();
    }
  };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">Ready</h1>
        <p className="mt-1 text-slate-600">Get your contact list ready for your CRM — without uploading it anywhere.</p>
      </header>

      <FileDrop onFile={onFile} disabled={status === "processing"} />

      <p role="status" aria-live="polite" className="text-sm text-slate-600" data-testid="status">
        {status === "processing" && "Processing in your browser…"}
        {status === "error" && "We couldn't read that file. Is it a CSV?"}
        {status === "ready" && "Done."}
      </p>

      {status === "ready" && result && (
        <>
          <ProfileSummary profile={result.profile} rowCount={result.parsed.rows.length} />
          <IssuesSummary headers={result.parsed.headers} rows={result.parsed.rows} issues={result.cellIssues} />
          <DuplicateReview
            parsed={result.parsed}
            candidates={result.duplicates}
            selected={selectedCandidate}
            onSelect={selectCandidate}
            decisions={decisions}
            onDecide={decide}
            onChooseField={chooseField}
            onMergeAllExact={mergeAllExact}
          />
          <div className="flex gap-3">
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
              onClick={() =>
                downloadCsv(
                  "ready-export.csv",
                  result.parsed.headers,
                  applyDecisions(result.parsed, result.duplicates, decisions).rows,
                )
              }
            >
              Download CSV
            </button>
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
