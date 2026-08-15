"use client";

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
    <button
      type="button"
      onClick={handleProcess}
      disabled={isProcessing}
      className="rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-800 dark:hover:bg-neutral-900"
    >
      {isProcessing
        ? t("processing")
        : isCompleted
          ? t("reprocess")
          : t("process")}
    </button>
  );
}
