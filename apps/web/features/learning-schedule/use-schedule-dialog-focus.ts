"use client";
import { useRef } from "react";
/** Controlled dialogs have no Radix Trigger; restore their real opener explicitly. */
export function useScheduleDialogFocus() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    captureOpener: () => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; },
    dialogProps: {
    onOpenAutoFocus: () => { if (!opener.current?.isConnected) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      requestAnimationFrame(() => {
        const target = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>("[data-study-sessions-heading], [data-study-schedule-heading]");
        target?.focus();
      });
    },
    },
  };
}
