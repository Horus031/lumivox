"use client";

import { useRef, useState, useTransition } from "react";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import type { LearningDocumentListItem } from "@/features/learning-documents/learning-document.types";

import {
  deleteLearningDocumentAction,
  uploadTaskLearningDocumentAction,
} from "@/features/learning-documents/learning-document.actions";

import { processLearningDocumentAction } from "@/features/learning-documents/learning-document-processing.action";

import { DocumentPreviewLink } from "@/features/learning-documents/components/document-preview-link";

import { Link } from "@/i18n/navigation";

type TaskDocumentsPanelProps = {
  taskId: string;

  documents: LearningDocumentListItem[];

  onChanged: () => void;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;

  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(kb / 1024).toFixed(1)} MB`;
}

export function TaskDocumentsPanel({
  taskId,
  documents,
  onChanged,
}: TaskDocumentsPanelProps) {
  const t = useTranslations("tasks.details.documents");

  const documentT = useTranslations("goals.documents.list");

  const router = useRouter();

  const formRef = useRef<HTMLFormElement>(null);

  const [pendingDocumentId, setPendingDocumentId] = useState<string | null>(
    null,
  );

  const [isPending, startTransition] = useTransition();

  function refresh() {
    onChanged();
    router.refresh();
  }

  function handleUpload(formData: FormData) {
    startTransition(async () => {
      const result = await uploadTaskLearningDocumentAction(formData);

      if (!result.success) {
        toast.error(result.message);

        return;
      }

      toast.success(result.message);

      formRef.current?.reset();

      refresh();
    });
  }

  function handleProcess(documentId: string) {
    setPendingDocumentId(documentId);

    startTransition(async () => {
      try {
        const result = await processLearningDocumentAction(documentId);

        if (!result.success) {
          toast.error(result.message);

          refresh();

          return;
        }

        toast.success(result.message);

        refresh();
      } finally {
        setPendingDocumentId(null);
      }
    });
  }

  function handleDelete(documentId: string) {
    if (!window.confirm(t("deleteConfirm"))) {
      return;
    }

    setPendingDocumentId(documentId);

    startTransition(async () => {
      try {
        const result = await deleteLearningDocumentAction(documentId);

        if (!result.success) {
          toast.error(result.message);

          return;
        }

        toast.success(result.message);

        refresh();
      } finally {
        setPendingDocumentId(null);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          {t("title")}
        </h3>

        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <form
        ref={formRef}
        action={handleUpload}
        className="rounded-[22px] border border-border/60 bg-muted/20 p-4"
      >
        <input type="hidden" name="taskId" value={taskId} />

        <input
          name="file"
          type="file"
          required
          accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
          disabled={isPending}
          className="block w-full rounded-xl border bg-background px-3 py-2.5 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-muted file:px-4 file:py-2 file:text-sm file:font-medium"
        />

        <Button type="submit" className="mt-3" disabled={isPending}>
          {isPending ? t("uploading") : t("upload")}
        </Button>
      </form>

      {documents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 p-7 text-center">
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((document) => {
            const processing =
              pendingDocumentId === document.id ||
              document.extracted_text_status === "processing";

            return (
              <article
                key={document.id}
                className="rounded-[22px] border border-border/60 p-4"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {document.file_name}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {document.mime_type}
                    {" · "}
                    {formatFileSize(Number(document.file_size_bytes))}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {documentT("metadata", {
                      visibility: documentT(
                        `visibility.${document.visibility}`,
                      ),

                      status: documentT(
                        `aiStatus.${document.extracted_text_status ?? "pending"}`,
                      ),
                    })}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={processing || isPending}
                    onClick={() => handleProcess(document.id)}
                  >
                    {processing
                      ? t("processing")
                      : document.extracted_text_status === "completed"
                        ? t("reprocess")
                        : t("process")}
                  </Button>

                  <DocumentPreviewLink document={document} />

                  <Button asChild type="button" size="sm" variant="outline">
                    <Link href={`/documents/${document.id}/share`}>
                      {t("share")}
                    </Link>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => handleDelete(document.id)}
                  >
                    {t("delete")}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
