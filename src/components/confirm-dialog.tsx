"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Matches the Button variant used for the confirm action. */
  variant?: "default" | "destructive";
}

interface ConfirmState {
  message: string;
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: "default" | "destructive";
  resolve: (value: boolean) => void;
}

/**
 * A lightweight confirmation dialog rendered into a portal.
 * Returns a `[confirm, dialogPortal]` tuple.
 *
 *   const [confirm, confirmDialog] = useConfirm();
 *
 *   <form onSubmit={async (e) => {
 *     e.preventDefault();
 *     const ok = await confirm("Delete everything?");
 *     if (!ok) return;
 *     // proceed…
 *   }}>
 *     ...
 *     {confirmDialog}
 *   </form>
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);
  // Keep a ref of the latest resolve so the stable callbacks always close
  // the correct promise even if state updates race.
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback(
    (message: string, opts?: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setState({
          message,
          title: opts?.title ?? "Confirm",
          confirmLabel: opts?.confirmLabel ?? "Confirm",
          cancelLabel: opts?.cancelLabel ?? "Cancel",
          variant: opts?.variant ?? "default",
          resolve,
        });
      }),
    [],
  );

  const handleConfirm = useCallback(() => {
    state?.resolve(true);
    resolveRef.current = null;
    setState(null);
  }, [state]);

  const handleCancel = useCallback(() => {
    state?.resolve(false);
    resolveRef.current = null;
    setState(null);
  }, [state]);

  // For callers whose confirm copy can go stale while the dialog is open
  // (e.g. a poll flips what the pending action would actually do) — lets
  // them dismiss it out from under the user rather than leave a promise
  // that resolves against outdated copy. No-ops if nothing's open.
  const close = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setState(null);
  }, []);

  // Close on Escape.
  useEffect(() => {
    if (!state) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [state, handleCancel]);

  const dialog =
    state && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label={state.title}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" onClick={handleCancel} />

            {/* Panel */}
            <div className="relative mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg">
              {state.title && <p className="mb-2 text-sm font-medium text-card-foreground">{state.title}</p>}
              <p className="text-sm text-muted-foreground">{state.message}</p>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
                  {state.cancelLabel}
                </Button>
                <Button type="button" variant={state.variant} size="sm" onClick={handleConfirm}>
                  {state.confirmLabel}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return [confirm, dialog, close] as const;
}
