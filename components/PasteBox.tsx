"use client";

import { useId, useState } from "react";

export const PASTED_FILE_NAME = "pasted-data.tsv";

/**
 * Paste rows copied from a spreadsheet. Excel, Numbers and Google Sheets copy
 * as tab-separated text, which the CSV parser already reads, so the paste
 * becomes a file and takes the same path as a dropped one.
 */
export function PasteBox({ onFile, disabled = false }: { onFile: (file: File) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const id = useId();

  if (!open) {
    return (
      <button
        type="button"
        className="rounded-lg border bg-white px-3 py-1.5 font-medium transition hover:-translate-y-0.5 hover:shadow-sm disabled:opacity-40"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Paste from a spreadsheet
      </button>
    );
  }

  return (
    <div className="w-full animate-rise rounded-xl bg-white p-4 shadow-sm">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        Paste rows here, header row first
      </label>
      <textarea
        id={id}
        autoFocus
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        className="mt-2 w-full rounded-lg border p-2 font-mono text-xs"
        placeholder={"First Name\tLast Name\tEmail\nAvery\tExample\tavery@example.test"}
      />
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          disabled={disabled || text.trim() === ""}
          className="rounded-lg bg-emerald-600 px-4 py-1.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
          onClick={() => {
            onFile(new File([text], PASTED_FILE_NAME, { type: "text/tab-separated-values" }));
            setText("");
            setOpen(false);
          }}
        >
          Use pasted rows
        </button>
        <button
          type="button"
          className="rounded-lg border px-4 py-1.5"
          onClick={() => {
            setText("");
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
