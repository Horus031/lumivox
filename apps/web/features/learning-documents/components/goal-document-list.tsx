import type { LearningDocument } from "@/features/learning-documents/learning-document.types";
import { DeleteLearningDocumentButton } from "@/features/learning-documents/components/delete-learning-document-button";
import { DocumentPreviewLink } from "@/features/learning-documents/components/document-preview-link";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ProcessLearningDocumentButton } from "./process-learning-document-button";

type GoalDocumentListProps = {
  documents: LearningDocument[];
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;

  const kb = bytes / 1024;

  if (kb < 1024) return `${kb.toFixed(1)} KB`;

  const mb = kb / 1024;

  return `${mb.toFixed(1)} MB`;
}

export async function GoalDocumentList({ documents }: GoalDocumentListProps) {
  const t = await getTranslations("goals.documents.list");

  return (
    <section className="rounded-2xl border bg-background p-5 shadow-sm">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h3 className="mt-2 text-xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h3>
      </div>

      {documents.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {documents.map((document) => (
            <article
              key={document.id}
              className="flex flex-col justify-between gap-4 rounded-2xl border p-4 dark:border-neutral-800 md:flex-row md:items-center"
            >
              <div>
                <p className="font-semibold text-foreground">
                  {document.file_name}
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  {document.mime_type} -{" "}
                  {formatFileSize(Number(document.file_size_bytes))}
                </p>

                <p className="mt-1 text-xs capitalize text-muted-foreground">
                  {t("metadata", {
                    visibility: t(`visibility.${document.visibility}`),
                    status: t(
                      `aiStatus.${document.extracted_text_status ?? "pending"}`,
                    ),
                  })}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <ProcessLearningDocumentButton
                  documentId={document.id}
                  status={document.extracted_text_status}
                />

                <DocumentPreviewLink document={document} />

                <Link
                  href={`/documents/${document.id}/share`}
                  className="rounded-md border px-4 py-2 text-sm font-medium transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                >
                  {t("share")}
                </Link>

                <DeleteLearningDocumentButton documentId={document.id} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
