import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { AdminDocumentChunksTable } from "@/features/admin/components/admin-document-chunks-table";
import { AdminDocumentDeleteButton } from "@/features/admin/components/admin-document-delete-button";
import { AdminDocumentReprocessButton } from "@/features/admin/components/admin-document-reprocess-button";
import { getAdminDocumentChunks, getAdminLearningDocumentDetail } from "@/features/admin/admin-documents.queries";

export default async function AdminDocumentDetailPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const [t, commonT, locale] = await Promise.all([
    getTranslations("admin.documents.detail"), getTranslations("admin.common"), getLocale(),
  ]);
  const [document, chunks] = await Promise.all([
    getAdminLearningDocumentDetail(documentId), getAdminDocumentChunks(documentId),
  ]);
  if (!document) notFound();
  const metadata = [
    [commonT("aiStatus"), commonT(`aiStatuses.${document.extracted_text_status ?? "pending"}`)],
    [commonT("chunks"), `${document.embedded_chunk_count}/${document.chunk_count}`],
    [t("failedChunks"), document.failed_chunk_count],
    [commonT("visibilityLabel"), commonT(`documentVisibility.${document.visibility}`)],
    [t("fileSize"), document.file_size_bytes ? `${(document.file_size_bytes / 1024 / 1024).toFixed(2)} MB` : commonT("na")],
    [t("mimeType"), document.mime_type],
    [commonT("created"), new Intl.DateTimeFormat(locale).format(new Date(document.created_at))],
    [commonT("updated"), new Intl.DateTimeFormat(locale).format(new Date(document.updated_at))],
  ];

  return (
    <div className="min-w-0 space-y-section">
      <PageHeader eyebrow={t("eyebrow")} title={document.file_name} description={`${commonT("owner")}: ${document.owner_name ?? commonT("unknownOwner")} - ${document.owner_email ?? document.owner_id}`} action={
        <Button asChild variant="outline"><Link href="/admin/documents"><ArrowLeft aria-hidden="true" />{commonT("backToList")}</Link></Button>
      } />
      <div className="flex min-w-0 flex-wrap gap-2 border-y border-border py-card">
        <AdminDocumentReprocessButton documentId={document.document_id} ownerId={document.owner_id} status={document.extracted_text_status} />
        <AdminDocumentDeleteButton documentId={document.document_id} filePath={document.file_path} />
      </div>
      <section className="space-y-3">
        <h2 className="text-section font-semibold text-foreground">{t("metadata")}</h2>
        <dl className="grid min-w-0 gap-x-section gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          {metadata.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-label text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-body font-medium tabular-nums text-foreground [overflow-wrap:anywhere]">{value}</dd>
              {label === commonT("chunks") && <p className="mt-1 text-caption text-muted-foreground">{t("embeddedChunksDescription")}</p>}
            </div>
          ))}
        </dl>
      </section>
      {document.extracted_text_preview ? (
        <section className="min-w-0 space-y-3 border-t border-border pt-card">
          <h2 className="text-section font-semibold text-foreground">{t("extractedTextPreview")}</h2>
          <p className="max-h-80 overflow-y-auto whitespace-pre-wrap text-body text-foreground [overflow-wrap:anywhere]">{document.extracted_text_preview}</p>
        </section>
      ) : null}
      <AdminDocumentChunksTable chunks={chunks} />
    </div>
  );
}
