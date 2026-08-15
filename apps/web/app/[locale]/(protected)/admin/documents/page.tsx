import { AdminDocumentSearchForm } from "@/features/admin/components/admin-document-search-form";
import { AdminDocumentsTable } from "@/features/admin/components/admin-documents-table";
import { searchAdminLearningDocuments } from "@/features/admin/admin-documents.queries";
import { getTranslations } from "next-intl/server";

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
    <main className="space-y-6 px-4 py-6 md:px-6 lg:px-8 lg:py-8">
      <section className="rounded-2xl border bg-surface p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>

        <p className="mt-3 max-w-3xl text-muted-foreground">
          {t("description")}
        </p>
      </section>

      <AdminDocumentSearchForm
        initialQuery={query}
        initialStatus={aiStatus}
      />

      <AdminDocumentsTable documents={documents} />
    </main>
  );
}
