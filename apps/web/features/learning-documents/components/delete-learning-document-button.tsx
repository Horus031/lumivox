"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { deleteLearningDocumentAction } from "@/features/learning-documents/learning-document.actions";
import { Button } from "@/components/ui/button";

type DeleteLearningDocumentButtonProps = {
  documentId: string;
};

export function DeleteLearningDocumentButton({
  documentId,
}: DeleteLearningDocumentButtonProps) {
  const t = useTranslations("goals.documents.delete");
  const commonT = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    const confirmed = window.confirm(
      t("confirm"),
    );

    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteLearningDocumentAction(documentId);

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
      variant={"outline"}
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="cursor-pointer border border-danger/20 px-4 py-2 text-sm font-medium text-danger/60 transition hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
    >
      {isPending ? t("deleting") : commonT("delete")}
    </Button>
  );
}
