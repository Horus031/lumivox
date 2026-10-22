"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { adminReprocessLearningDocumentAction } from "@/features/admin/admin-documents.actions";
import { Button } from "@/components/ui/button";

type AdminDocumentReprocessButtonProps = {
  documentId: string;
  ownerId: string;
  status: string | null;
  compact?: boolean;
};

export function AdminDocumentReprocessButton({
  documentId,
  ownerId,
  status,
  compact = false,
}: AdminDocumentReprocessButtonProps) {
  const router = useRouter();
  const t = useTranslations("admin.documents.actions");
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (isPending || status === "processing") return;
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

  const label = isPending ? t("processing") : status === "completed" ? t("reprocess") : t("process");

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={isPending || status === "processing"}
      variant="outline"
      size={compact ? "icon" : "default"}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      aria-busy={isPending}
    >
      {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
      {!compact && label}
    </Button>
  );
}
