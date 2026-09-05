import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { AdminMetricCard } from "@/features/admin/components/admin-metric-card";
import { AdminDocumentChunksTable } from "@/features/admin/components/admin-document-chunks-table";
import { AdminDocumentDeleteButton } from "@/features/admin/components/admin-document-delete-button";
import { AdminDocumentReprocessButton } from "@/features/admin/components/admin-document-reprocess-button";
import {
  getAdminDocumentChunks,
  getAdminLearningDocumentDetail,
} from "@/features/admin/admin-documents.queries";

type AdminDocumentDetailPageProps = {
  params: Promise<{
    documentId: string;
  }>;
};

function formatBytes(bytes: number | null, fallback: string) {
  if (!bytes) return fallback;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default async function AdminDocumentDetailPage({
  params,
}: AdminDocumentDetailPageProps) {
  const { documentId } = await params;
  const [t, commonT, locale] = await Promise.all([
    getTranslations("admin.documents.detail"),
    getTranslations("admin.common"),
    getLocale(),
  ]);

  const [document, chunks] = await Promise.all([
    getAdminLearningDocumentDetail(documentId),
    getAdminDocumentChunks(documentId),
  ]);

  if (!document) {
    notFound();
  }

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-surface p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          {document.file_name}
        </h1>

        <p className="mt-3 max-w-3xl text-muted-foreground">
          {commonT("owner")}: {document.owner_name ?? commonT("unknownOwner")} -{" "}
          {document.owner_email ?? document.owner_id}
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <AdminDocumentReprocessButton
            documentId={document.document_id}
            ownerId={document.owner_id}
            status={document.extracted_text_status}
          />

          <AdminDocumentDeleteButton
            documentId={document.document_id}
            filePath={document.file_path}
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          label={commonT("aiStatus")}
          value={commonT(
            `aiStatuses.${document.extracted_text_status ?? "pending"}`
          )}
        />

        <AdminMetricCard
          label={commonT("chunks")}
          value={`${document.embedded_chunk_count}/${document.chunk_count}`}
          description={t("embeddedChunksDescription")}
        />

        <AdminMetricCard
          label={t("failedChunks")}
          value={document.failed_chunk_count}
        />

        <AdminMetricCard
          label={commonT("visibilityLabel")}
          value={commonT(`documentVisibility.${document.visibility}`)}
        />

        <AdminMetricCard
          label={t("fileSize")}
          value={formatBytes(document.file_size_bytes, commonT("na"))}
        />

        <AdminMetricCard
          label={t("mimeType")}
          value={document.mime_type}
        />

        <AdminMetricCard
          label={commonT("created")}
          value={new Intl.DateTimeFormat(locale).format(
            new Date(document.created_at)
          )}
        />

        <AdminMetricCard
          label={commonT("updated")}
          value={new Intl.DateTimeFormat(locale).format(
            new Date(document.updated_at)
          )}
        />
      </section>

      {document.extracted_text_preview ? (
        <section className="rounded-2xl border bg-surface p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-foreground">
            {t("extractedTextPreview")}
          </h2>

          <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-surface p-4 text-sm leading-6 text-foreground">
            {document.extracted_text_preview}
          </p>
        </section>
      ) : null}

      <AdminDocumentChunksTable chunks={chunks} />
    </main>
  );
}
