"use client";

import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type TaskModalShellProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  size?: "compact" | "wide";
  context?: ReactNode;
  actions?: ReactNode;
  getReturnFocus?: (previous: HTMLElement | null) => HTMLElement | null;
};

export function TaskModalShell({
  open,
  title,
  description,
  onClose,
  children,
  size = "compact",
  context,
  actions,
  getReturnFocus,
}: TaskModalShellProps) {
  const t = useTranslations("tasks.modalShell");
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const wide = size === "wide";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        {...(!description ? { "aria-describedby": undefined } : {})}
        onOpenAutoFocus={(event) => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          if (wide && titleRef.current) {
            event.preventDefault();
            titleRef.current.focus({ preventScroll: true });
          }
        }}
        onCloseAutoFocus={(event) => {
          const target = getReturnFocus ? getReturnFocus(returnFocus.current) : returnFocus.current;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus({ preventScroll: true });
          }
        }}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0 motion-reduce:animate-none",
          wide
            ? "h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] rounded-xl sm:h-auto sm:w-[calc(100%-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:min-h-[min(30rem,calc(100dvh-2rem))] sm:max-w-[calc(100%-2rem)] lg:max-w-5xl xl:max-w-6xl"
            : "max-h-[calc(100dvh-2rem)] rounded-lg sm:max-w-2xl",
        )}
      >
        <header className={cn("flex shrink-0 items-start justify-between gap-2 border-b border-border p-card", wide && "sm:px-6 sm:py-4")}>
          <div className="min-w-0">
            {context}
            <DialogTitle
              ref={titleRef}
              tabIndex={wide ? -1 : undefined}
              className={cn("wrap-anywhere font-semibold leading-6 outline-none", wide ? "text-lg sm:text-xl" : "text-section")}
            >
              {title}
            </DialogTitle>
            {description ? (
              <DialogDescription className="sr-only">{description}</DialogDescription>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={t("close")}
              title={t("close")}
              className={wide ? "size-touch sm:size-control" : undefined}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        </header>
        <div className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain p-card", wide && "sm:p-6")}>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
