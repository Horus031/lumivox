"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";

import {
  adminClearAiEntityTranslationsAction,
  adminDeleteAiContentTranslationAction,
} from "@/features/admin/admin-translations.actions";

type AdminTranslationDeleteButtonProps = {
  translationId: string;
};

export function AdminTranslationDeleteButton({
  translationId,
}: AdminTranslationDeleteButtonProps) {
  const router = useRouter();
  const t = useTranslations("admin.translations.actions");
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    const confirmed = window.confirm(t("deleteConfirm"));

    if (!confirmed) return;

    startTransition(async () => {
      const result = await adminDeleteAiContentTranslationAction({
        translationId,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
    >
      {isPending ? t("deleting") : t("delete")}
    </button>
  );
}

type AdminClearEntityTranslationsButtonProps = {
  entityType: string;
  entityId: string;
};

export function AdminClearEntityTranslationsButton({
  entityType,
  entityId,
}: AdminClearEntityTranslationsButtonProps) {
  const router = useRouter();
  const t = useTranslations("admin.translations.actions");
  const [isPending, startTransition] = useTransition();

  function handleClear() {
    const confirmed = window.confirm(t("clearEntityConfirm"));

    if (!confirmed) return;

    startTransition(async () => {
      const result = await adminClearAiEntityTranslationsAction({
        entityType,
        entityId,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClear}
      disabled={isPending}
      className="rounded-xl border px-3 py-2 text-sm font-medium transition hover:bg-neutral-50 disabled:opacity-60 dark:border-neutral-800 dark:hover:bg-neutral-900"
    >
      {isPending ? t("clearing") : t("clearEntityCache")}
    </button>
  );
}
