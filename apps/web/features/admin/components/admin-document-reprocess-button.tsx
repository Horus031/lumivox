"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { adminReprocessLearningDocumentAction } from "@/features/admin/admin-documents.actions";
import { Button } from "@/components/ui/button";

type AdminDocumentReprocessButtonProps = {
  documentId: string;
  ownerId: string;
  status: string | null;
};

export function AdminDocumentReprocessButton({
  documentId,
  ownerId,
  status,
}: AdminDocumentReprocessButtonProps) {
  const router = useRouter();
  const t = useTranslations("admin.documents.actions");
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await adminReprocessLearningDocumentAction({
        documentId,
        ownerId,
      });

      if (!result.success) {
        toast.error(result.message);
        router.refresh();
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={isPending || status === "processing"}
    >
      {isPending
        ? t("processing")
        : status === "completed"
          ? t("reprocess")
          : t("process")}
    </Button>
  );
}
