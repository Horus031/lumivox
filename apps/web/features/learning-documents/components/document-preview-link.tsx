"use client";

import { Button } from "@/components/ui/button";
import type { LearningDocument } from "@/features/learning-documents/learning-document.types";

type DocumentPreviewLinkProps = {
  document: LearningDocument;
};

export function DocumentPreviewLink({ document }: DocumentPreviewLinkProps) {
  function handleOpen() {
    window.open(
      `/documents/shared/${document.id}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <Button
      type="button"
      onClick={handleOpen}
      className="px-4 py-2 text-sm font-medium transition "
    >
      Preview
    </Button>
  );
}
