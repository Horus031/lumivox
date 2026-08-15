import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AdminDocumentReprocessButton } from "./admin-document-reprocess-button";

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

type AdminDocumentsTableProps = {
  documents: AdminDocument[];
};

function formatBytes(bytes: number | null) {
  if (!bytes) return "N/A";

  const mb = bytes / 1024 / 1024;

  return `${mb.toFixed(2)} MB`;
}

function statusBadgeClass(status: string | null) {
  if (status === "completed") {
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  }

  if (status === "failed") {
    return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  }

  if (status === "processing") {
    return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  }

  if (status === "unsupported") {
    return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  }

  return "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300";
}

export function AdminDocumentsTable({
  documents,
}: AdminDocumentsTableProps) {
  const locale = useLocale();
  const t = useTranslations("admin.documents.table");
  const commonT = useTranslations("admin.common");

  return (
    <section className="rounded-2xl shadow-sm">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h2 className="mt-2 text-2xl font-bold text-foreground">
          {t("title")}
        </h2>
      </div>

      {documents.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border">
          <table className="min-w-312.5 w-full text-sm">
            <thead className="bg-surface text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("file")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("owner")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("aiStatus")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("chunks")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("visibilityLabel")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("size")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("created")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("actions")}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y dark:divide-neutral-800">
              {documents.map((document) => (
                <tr key={document.document_id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {document.file_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {document.mime_type}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {document.owner_name ?? commonT("unknownOwner")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {document.owner_email ?? document.owner_id}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass(
                        document.extracted_text_status
                      )}`}
                    >
                      {commonT(
                        `aiStatuses.${document.extracted_text_status ?? "pending"}`,
                      )}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    {document.embedded_chunk_count}/{document.chunk_count}
                  </td>

                  <td className="px-4 py-3 capitalize text-foreground">
                    {commonT(`documentVisibility.${document.visibility}`)}
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    {formatBytes(document.file_size_bytes)}
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    {new Date(document.created_at).toLocaleString(locale)}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/documents/${document.document_id}`}
                        className="rounded-xl border px-3 py-2 text-sm font-medium transition"
                      >
                        {commonT("view")}
                      </Link>

                      <AdminDocumentReprocessButton
                        documentId={document.document_id}
                        ownerId={document.owner_id}
                        status={document.extracted_text_status}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
