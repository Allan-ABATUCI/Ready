"use client";

import { useId, useState, useSyncExternalStore, type DragEvent } from "react";

export interface FileDropProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

const noSubscribe = () => () => {};

export function FileDrop({ onFile, disabled = false }: FileDropProps) {
  const inputId = useId();
  const [over, setOver] = useState(false);
  // Until React has hydrated, the input has no handler: picking a file would do
  // nothing. Showing it disabled avoids a page that only looks ready (e.g. when
  // dev scripts are blocked, or on a slow connection). The server snapshot
  // (false) is used for SSR and hydration; the client one (true) right after.
  // Same result as setting state in a useEffect, without the extra render pass.
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const inactive = disabled || !hydrated;

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file && !inactive) onFile(file);
  };

  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      data-over={over || undefined}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition duration-200 ease-out ${
        over
          ? "scale-[1.01] border-emerald-500 bg-emerald-50 shadow-[0_0_0_6px_rgb(16_185_129/0.15)]"
          : "border-slate-300 bg-white hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-sm"
      } ${inactive ? "pointer-events-none opacity-60" : ""}`}
    >
      <span className="text-lg font-medium text-slate-800">
        {hydrated ? "Drop a CSV or Excel file here, or click to choose one" : "Loading…"}
      </span>
      <span className="mt-1 text-sm text-slate-500">Your file is processed in this browser and never uploaded.</span>
      <span className="mt-1 text-xs text-slate-500">CSV, TSV, Excel (.xlsx, first sheet) or a saved Ready session</span>
      <input
        id={inputId}
        type="file"
        accept=".csv,text/csv,.tsv,.txt,text/tab-separated-values,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.json,application/json"
        className="sr-only"
        disabled={inactive}
        data-testid="file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}
