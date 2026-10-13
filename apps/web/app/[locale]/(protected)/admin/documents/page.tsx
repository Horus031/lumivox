import { AdminDocumentSearchForm } from "@/features/admin/components/admin-document-search-form";
import { AdminDocumentsTable } from "@/features/admin/components/admin-documents-table";
import { searchAdminLearningDocuments } from "@/features/admin/admin-documents.queries";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/features/app-shell/components/page-header";

type AdminDocumentsPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
  }>;
};

export default async function AdminDocumentsPage({
  searchParams,
}: AdminDocumentsPageProps) {
  const { q, status } = await searchParams;

  const query = q ?? "";
  const aiStatus = status ?? "all";

  const [documents, t] = await Promise.all([
    searchAdminLearningDocuments({
      query,
      status: aiStatus,
    }),
    getTranslations("admin.documents.page"),
  ]);

  return (
    <div className="min-w-0 space-y-section">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />

      <AdminDocumentSearchForm
        initialQuery={query}
        initialStatus={aiStatus}
      />

      <AdminDocumentsTable documents={documents} />
    </div>
  );
}
