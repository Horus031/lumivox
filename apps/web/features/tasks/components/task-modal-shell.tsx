"use client";

import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type TaskModalShellProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  align?: "center" | "right";
};

export function TaskModalShell({ open, title, description, onClose, children, footer, align = "center" }: TaskModalShellProps) {
  const t = useTranslations("tasks.modalShell");
  const returnFocus = useRef<HTMLElement | null>(null);
  const alignment = align === "right"
    ? "top-0 right-0 left-auto h-dvh max-h-dvh max-w-full translate-x-0 translate-y-0 rounded-none border-y-0 border-r-0 sm:max-w-[36rem]"
    : "max-h-[calc(100dvh-2rem)] rounded-lg sm:max-w-2xl";

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        {...(!description ? { "aria-describedby": undefined } : {})}
        onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
        onCloseAutoFocus={(event) => {
          if (returnFocus.current?.isConnected) {
            event.preventDefault();
            returnFocus.current.focus();
          }
        }}
        className={`flex flex-col gap-0 overflow-hidden p-0 ${alignment}`}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-card">
          <div className="min-w-0">
            <DialogTitle className="text-section font-semibold leading-6 [overflow-wrap:anywhere]">{title}</DialogTitle>
            {description ? <DialogDescription className="sr-only">{description}</DialogDescription> : null}
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t("close")} title={t("close")}>
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-card">{children}</div>
        {footer ? <div className="shrink-0 border-t border-border p-card">{footer}</div> : null}
      </DialogContent>
    </Dialog>
  );
}
