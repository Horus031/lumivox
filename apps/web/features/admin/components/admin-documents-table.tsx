import { ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminDocumentReprocessButton } from "./admin-document-reprocess-button";
import { AdminTableSection } from "./admin-table-section";

type AdminDocument = {
  document_id: string;
  owner_id: string;
  owner_name: string | null;
  owner_email: string | null;
  file_name: string;
  mime_type: string;
  file_size_bytes: number | null;
  visibility: string;
  extracted_text_status: string | null;
  chunk_count: number;
  embedded_chunk_count: number;
  created_at: string;
};

function statusTone(status: string | null) {
  if (status === "completed") return "border-success/25 bg-success/10 text-foreground";
  if (status === "failed") return "border-danger/25 bg-danger/10 text-foreground";
  if (status === "processing") return "border-info/25 bg-info/10 text-foreground";
  if (status === "unsupported") return "border-warning/25 bg-warning/10 text-foreground";
  return "border-border bg-muted text-secondary-text";
}

export function AdminDocumentsTable({ documents }: { documents: AdminDocument[] }) {
  const locale = useLocale();
  const t = useTranslations("admin.documents.table");
  const commonT = useTranslations("admin.common");

  return (
    <AdminTableSection title={t("title")} empty={documents.length === 0} emptyMessage={t("empty")} className="min-w-260">
      <thead className="border-b border-border bg-muted text-label text-secondary-text">
        <tr>{["file", "owner", "aiStatus", "chunks", "visibilityLabel", "size", "created", "actions"].map((key) => <th key={key} scope="col">{commonT(key)}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-border">
        {documents.map((document) => (
          <tr key={document.document_id} className="hover:bg-muted/50">
            <td className="max-w-60 [overflow-wrap:anywhere]">
              <Link href={`/admin/documents/${document.document_id}`} className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{document.file_name}</Link>
              <p title={document.mime_type} className="mt-1 max-w-60 truncate text-caption text-muted-foreground">{document.mime_type}</p>
            </td>
            <td className="max-w-52 [overflow-wrap:anywhere]">
              <p className="text-label font-medium text-foreground">{document.owner_name ?? commonT("unknownOwner")}</p>
              <p className="mt-1 text-caption text-muted-foreground">{document.owner_email ?? document.owner_id}</p>
            </td>
            <td><Badge variant="outline" className={statusTone(document.extracted_text_status)}>{commonT(`aiStatuses.${document.extracted_text_status ?? "pending"}`)}</Badge></td>
            <td className="text-label tabular-nums text-secondary-text">{document.embedded_chunk_count}/{document.chunk_count}</td>
            <td className="text-label text-secondary-text">{commonT(`documentVisibility.${document.visibility}`)}</td>
            <td className="text-caption tabular-nums text-secondary-text">{document.file_size_bytes ? `${(document.file_size_bytes / 1024 / 1024).toFixed(2)} MB` : commonT("na")}</td>
            <td className="text-caption tabular-nums text-secondary-text">{new Date(document.created_at).toLocaleString(locale)}</td>
            <td><div className="flex items-center gap-1">
              <Button asChild variant="ghost" size="icon"><Link href={`/admin/documents/${document.document_id}`} aria-label={`${commonT("view")}: ${document.file_name}`} title={commonT("view")}><ArrowUpRight aria-hidden="true" /></Link></Button>
              <AdminDocumentReprocessButton documentId={document.document_id} ownerId={document.owner_id} status={document.extracted_text_status} compact />
            </div></td>
          </tr>
        ))}
      </tbody>
    </AdminTableSection>
  );
}
