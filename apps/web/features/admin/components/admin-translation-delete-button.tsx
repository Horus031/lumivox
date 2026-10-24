"use client";

import { useConfirmDialog } from "@/components/ui/use-confirm-dialog";

import { useTransition } from "react";
import { Eraser, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const confirm = useConfirmDialog();
  const [isPending, startTransition] = useTransition();

  async function handleDelete() {
    if (isPending) return;
    const confirmed = await confirm(t("deleteConfirm"), { variant: "destructive" });

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
    <Button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      variant="ghost"
      size="icon"
      className="hover:bg-danger/10"
      aria-label={isPending ? t("deleting") : t("delete")}
      title={isPending ? t("deleting") : t("delete")}
      aria-busy={isPending}
    >
      {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
    </Button>
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
  const confirm = useConfirmDialog();
  const [isPending, startTransition] = useTransition();

  async function handleClear() {
    if (isPending) return;
    const confirmed = await confirm(t("clearEntityConfirm"), { variant: "destructive" });

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
    <Button
      type="button"
      onClick={handleClear}
      disabled={isPending}
      variant="outline"
      size="icon"
      aria-label={isPending ? t("clearing") : t("clearEntityCache")}
      title={isPending ? t("clearing") : t("clearEntityCache")}
      aria-busy={isPending}
    >
      {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Eraser aria-hidden="true" />}
    </Button>
  );
}
