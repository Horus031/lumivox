"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { useConfirmation, type ConfirmationOptions } from "@/components/ui/confirmation-dialog";

type ConfirmOptions = Partial<Omit<ConfirmationOptions, "description">>;

/** Localized convenience API: if (!(await confirm(description, options))) return; */
export function useConfirmDialog() {
  const show = useConfirmation();
  const t = useTranslations("common.confirmation");
  return useCallback((description: string, options: ConfirmOptions = {}) => show({
    title: t(options.variant === "destructive" ? "destructiveTitle" : "title"),
    confirmLabel: t(options.variant === "destructive" ? "delete" : "confirm"),
    cancelLabel: t("cancel"),
    ...options,
    description,
  }), [show, t]);
}
