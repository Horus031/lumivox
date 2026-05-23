"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { X } from "lucide-react";

type TaskModalShellProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  align?: "center" | "right";
};

export function TaskModalShell({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  align = "center",
}: TaskModalShellProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const panelAlignment =
    align === "right"
      ? "ml-auto h-full w-full max-w-full rounded-none border-l border-border/60 md:max-w-[32rem] md:rounded-l-[32px]"
      : "mx-auto w-full max-h-180 max-w-2xl rounded-[32px]";

  return (
    <div
      className="fixed m-0 h-screen inset-0 z-50 flex items-start justify-center bg-background/80 backdrop-blur-md md:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-modal="true"
        className={`relative flex h-fit flex-col bg-background shadow-[0_28px_90px_-50px_hsl(var(--primary)/0.36)] ring-1 ring-border/60 ${panelAlignment}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/50 px-5 py-4 md:px-6">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              Task detail
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            className="rounded-full p-2 text-muted-foreground transition hover:bg-muted/70 hover:text-foreground"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6">
          {children}
        </div>

        {footer ? (
          <div className="border-t border-border/50 px-5 py-4 md:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}