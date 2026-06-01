"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import type { LearningDocument } from "@/features/learning-documents/learning-document.types";
import { createLearningDocumentPreviewUrlAction } from "../learning-document.preview.actions";

type DocumentPreviewLinkProps = {
  document: LearningDocument;
};

export function DocumentPreviewLink({ document }: DocumentPreviewLinkProps) {
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    startTransition(async () => {
      const result = await createLearningDocumentPreviewUrlAction(document.id);

      if (!result.success || !result.data) {
        toast.error(result.message);
        return;
      }

      window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      disabled={isPending}
      className="rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-800 dark:hover:bg-neutral-900"
    >
      {isPending ? "Opening..." : "Preview"}
    </button>
  );
}
