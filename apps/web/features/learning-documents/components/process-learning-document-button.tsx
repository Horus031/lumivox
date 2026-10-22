"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { processLearningDocumentAction } from "../learning-document-processing.action";


type ProcessLearningDocumentButtonProps = {
  documentId: string;
  status: string | null;
};

export function ProcessLearningDocumentButton({
  documentId,
  status,
}: ProcessLearningDocumentButtonProps) {
  const t = useTranslations("goals.documents.process");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isCompleted = status === "completed";
  const isProcessing = status === "processing" || isPending;

  function handleProcess() {
    startTransition(async () => {
      const result = await processLearningDocumentAction(documentId);

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
    <Button variant="outline" size="sm"
      type="button"
      onClick={handleProcess}
      disabled={isProcessing}
      aria-busy={isProcessing}
    >
      <RefreshCw aria-hidden="true" />{isProcessing
        ? t("processing")
        : isCompleted
          ? t("reprocess")
          : t("process")}
    </Button>
  );
}
