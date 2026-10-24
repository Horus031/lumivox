"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertDialog } from "radix-ui";
import { AlertTriangle, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  mode?: "confirm" | "alert";
};

type ConfirmationDialogProps = ConfirmationOptions & {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  returnFocus?: HTMLElement | null;
};

/** Theme-aware, accessible confirmation surface, also usable as a controlled component. */
export function ConfirmationDialog({ open, onConfirm, onCancel, returnFocus, title, description, confirmLabel, cancelLabel, variant = "default", mode = "confirm" }: ConfirmationDialogProps) {
  const destructive = variant === "destructive";
  const Icon = destructive ? AlertTriangle : Info;

  return (
    <AlertDialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onCancel(); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        <AlertDialog.Content
          onCloseAutoFocus={(event) => {
            if (returnFocus?.isConnected) {
              event.preventDefault();
              returnFocus.focus();
            }
          }}
          className="fixed left-1/2 top-1/2 z-[60] grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 motion-reduce:animate-none"
        >
          <div className={cn("flex size-12 items-center justify-center rounded-xl", destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
            <Icon className="size-6" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-2">
            <AlertDialog.Title className="text-lg font-semibold tracking-tight [overflow-wrap:anywhere]">{title}</AlertDialog.Title>
            <AlertDialog.Description className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{description}</AlertDialog.Description>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            {mode === "confirm" ? (
              <AlertDialog.Cancel asChild>
                <Button type="button" variant="outline" onClick={onCancel}>{cancelLabel}</Button>
              </AlertDialog.Cancel>
            ) : null}
            <AlertDialog.Action asChild>
              <Button type="button" variant={destructive ? "destructive" : "default"} onClick={onConfirm}>{confirmLabel}</Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

type Request = { owner: string; options: ConfirmationOptions; resolve: (confirmed: boolean) => void; returnFocus: HTMLElement | null };
type ConfirmationContextValue = {
  request: (options: ConfirmationOptions, owner: string) => Promise<boolean>;
  cancel: (owner: string) => void;
};
const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const pending = useRef<Request | null>(null);
  const [dialog, setDialog] = useState<Request | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    setDialog(null);
    current.resolve(confirmed);
  }, []);

  const request = useCallback((options: ConfirmationOptions, owner: string) => {
    // Ignore repeated clicks while a decision is open; never execute an action twice.
    if (pending.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const menuId = active?.closest('[role="menu"]')?.id;
      const menuTrigger = menuId ? [...document.querySelectorAll<HTMLElement>("[aria-controls]")].find(element => element.getAttribute("aria-controls") === menuId) : null;
      const next = { owner, options, resolve, returnFocus: menuTrigger ?? active };
      pending.current = next;
      setDialog(next);
    });
  }, []);

  const cancel = useCallback((owner: string) => {
    if (pending.current?.owner === owner) settle(false);
  }, [settle]);
  const contextValue = useMemo(() => ({ request, cancel }), [request, cancel]);

  useEffect(() => () => {
    pending.current?.resolve(false);
    pending.current = null;
  }, []);

  return (
    <ConfirmationContext.Provider value={contextValue}>
      {children}
      {dialog ? <ConfirmationDialog {...dialog.options} open returnFocus={dialog.returnFocus} onConfirm={() => settle(true)} onCancel={() => settle(false)} /> : null}
    </ConfirmationContext.Provider>
  );
}

/** Await the user's decision before starting a mutation. Unmounting the caller cancels it. */
export function useConfirmation() {
  const context = useContext(ConfirmationContext);
  if (!context) throw new Error("useConfirmation must be used within ConfirmationProvider");
  const { request, cancel } = context;
  const owner = useId();
  useEffect(() => () => cancel(owner), [cancel, owner]);
  return useCallback((options: ConfirmationOptions) => request(options, owner), [request, owner]);
}
