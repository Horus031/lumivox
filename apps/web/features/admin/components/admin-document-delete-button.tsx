"use client";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { adminDeleteLearningDocumentAction } from "@/features/admin/admin-documents.actions";
import { Button } from "@/components/ui/button";

type AdminDocumentDeleteButtonProps = {
  documentId: string;
  filePath: string;
};

export function AdminDocumentDeleteButton({
  documentId,
  filePath,
}: AdminDocumentDeleteButtonProps) {
  const router = useRouter();
  const t = useTranslations("admin.documents.actions");
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (isPending) return;
    const confirmed = window.confirm(t("deleteConfirm"));

    if (!confirmed) return;

    startTransition(async () => {
      const result = await adminDeleteLearningDocumentAction({
        documentId,
        filePath,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.push("/admin/documents");
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      variant={"destructive"}
      aria-busy={isPending}
    >
      {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
      {isPending ? t("deleting") : t("deleteDocument")}
    </Button>
  );
}
