import { AdminGroupSearchForm } from "@/features/admin/components/admin-group-search-form";
import { AdminGroupsTable } from "@/features/admin/components/admin-groups-table";
import { searchAdminStudyGroups } from "@/features/admin/admin-groups.queries";
import { getTranslations } from "next-intl/server";

type AdminGroupsPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
  }>;
};

export default async function AdminGroupsPage({
  searchParams,
}: AdminGroupsPageProps) {
  const { q, status } = await searchParams;

  const query = q ?? "";
  const groupStatus = status ?? "all";

  const [groups, t] = await Promise.all([
    searchAdminStudyGroups({
      query,
      status: groupStatus,
    }),
    getTranslations("admin.groups.page"),
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

      <AdminGroupSearchForm
        initialQuery={query}
        initialStatus={groupStatus}
      />

      <AdminGroupsTable groups={groups} />
    </main>
  );
}
