"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deleteLearningDocumentAction } from "@/features/learning-documents/learning-document.actions";

type DeleteLearningDocumentButtonProps = {
  documentId: string;
};

export function DeleteLearningDocumentButton({
  documentId,
}: DeleteLearningDocumentButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    const confirmed = window.confirm(
      "Delete this document? This action cannot be undone.",
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
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
    >
      {isPending ? "Deleting..." : "Delete"}
    </button>
  );
}
