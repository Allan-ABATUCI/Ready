"use client";

import { useId, useState, type DragEvent } from "react";

export interface FileDropProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function FileDrop({ onFile, disabled = false }: FileDropProps) {
  const inputId = useId();
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file && !disabled) onFile(file);
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
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
        over ? "border-emerald-500 bg-emerald-50" : "border-slate-300 bg-white hover:border-slate-400"
      } ${disabled ? "pointer-events-none opacity-60" : ""}`}
    >
      <span className="text-lg font-medium text-slate-800">Drop a CSV file here, or click to choose one</span>
      <span className="mt-1 text-sm text-slate-500">Your file is processed in this browser and never uploaded.</span>
      <input
        id={inputId}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        disabled={disabled}
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
