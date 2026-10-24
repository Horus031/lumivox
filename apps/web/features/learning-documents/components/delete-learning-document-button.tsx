"use client";

import { useConfirmDialog } from "@/components/ui/use-confirm-dialog";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { deleteLearningDocumentAction } from "@/features/learning-documents/learning-document.actions";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type DeleteLearningDocumentButtonProps = {
  documentId: string;
};

export function DeleteLearningDocumentButton({
  documentId,
}: DeleteLearningDocumentButtonProps) {
  const t = useTranslations("goals.documents.delete");
  const confirm = useConfirmDialog();
  const commonT = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleDelete() {
    const confirmed = await confirm(t("confirm"), { variant: "destructive" });

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
      variant="ghost"
      size="sm"
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="text-danger hover:bg-danger/10 hover:text-danger"
    >
      <Trash2 aria-hidden="true" />{isPending ? t("deleting") : commonT("delete")}
    </Button>
  );
}
