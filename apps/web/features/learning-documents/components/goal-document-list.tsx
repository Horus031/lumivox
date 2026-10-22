import type { LearningDocumentListItem } from "@/features/learning-documents/learning-document.types";
import { DeleteLearningDocumentButton } from "@/features/learning-documents/components/delete-learning-document-button";
import { DocumentPreviewLink } from "@/features/learning-documents/components/document-preview-link";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Share2 } from "lucide-react";
import { ProcessLearningDocumentButton } from "./process-learning-document-button";

type GoalDocumentListProps = {
  documents: LearningDocumentListItem[];
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
    <section className="min-w-0 border-t border-border pt-card">
      <div>
        <p className="text-caption font-medium text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h3 className="mt-1 text-section font-semibold text-foreground [overflow-wrap:anywhere]">
          {t("title")}
        </h3>
      </div>

      {documents.length === 0 ? (
        <div className="mt-card border-t border-border py-section text-center">
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="mt-3 divide-y divide-border">
          {documents.map((document) => (
            <article
              key={document.id}
              className="flex min-w-0 flex-col justify-between gap-3 py-card xl:flex-row xl:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-foreground [overflow-wrap:anywhere]">
                  {document.file_name}
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  {document.mime_type} -{" "}
                  {formatFileSize(Number(document.file_size_bytes))}
                </p>

                <p className="mt-1 text-caption text-muted-foreground">
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

                <Button asChild variant="outline" size="sm">
                  <Link href={`/documents/${document.id}/share`}><Share2 aria-hidden="true" />{t("share")}</Link>
                </Button>

                <DeleteLearningDocumentButton documentId={document.id} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
