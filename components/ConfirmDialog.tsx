"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface ConfirmOptions {
  /** Label of the button that goes ahead. Defaults to "Continue". */
  confirmLabel?: string;
}

export type Confirm = (message: string, options?: ConfirmOptions) => Promise<boolean>;

/**
 * Without a provider (e.g. a component tested on its own), fall back to the
 * browser's dialog, so callers never have to handle a missing provider.
 */
const ConfirmContext = createContext<Confirm>((message) => Promise.resolve(window.confirm(message)));

/** Ask the user to confirm, in an in-page dialog when inside `ConfirmProvider`. */
export function useConfirm(): Confirm {
  return useContext(ConfirmContext);
}

interface Pending {
  message: string;
  confirmLabel: string;
  resolve: (ok: boolean) => void;
}

/**
 * In-page replacement for `window.confirm`: styled like the app, announced as
 * an alert dialog, focus moved in and back out, Escape and the backdrop cancel.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const confirm = useCallback<Confirm>(
    (message, options = {}) =>
      new Promise<boolean>((resolve) => {
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setPending((current) => {
          current?.resolve(false); // a newer question replaces an unanswered one
          return { message, confirmLabel: options.confirmLabel ?? "Continue", resolve };
        });
      }),
    [],
  );

  const answer = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
    returnFocus.current?.focus();
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <Dialog pending={pending} onAnswer={answer} />}
    </ConfirmContext.Provider>
  );
}

function Dialog({ pending, onAnswer }: { pending: Pending; onAnswer: (ok: boolean) => void }) {
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // The safe choice gets focus, so a stray Enter doesn't throw work away.
  useEffect(() => cancelRef.current?.focus(), []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[1px]"
      onMouseDown={(e) => e.target === e.currentTarget && onAnswer(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-describedby={messageId}
        aria-label="Please confirm"
        className="w-full max-w-md animate-pop rounded-xl bg-white p-6 shadow-xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onAnswer(false);
          } else if (e.key === "Tab") {
            // Two buttons: keep focus inside the dialog.
            e.preventDefault();
            (document.activeElement === cancelRef.current ? confirmRef : cancelRef).current?.focus();
          }
        }}
      >
        <p id={messageId} className="text-slate-800">
          {pending.message}
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button ref={cancelRef} type="button" className="rounded-lg border px-4 py-2" onClick={() => onAnswer(false)}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
            onClick={() => onAnswer(true)}
          >
            {pending.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
