import { AdminGroupSearchForm } from "@/features/admin/components/admin-group-search-form";
import { AdminGroupsTable } from "@/features/admin/components/admin-groups-table";
import { searchAdminStudyGroups } from "@/features/admin/admin-groups.queries";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/features/app-shell/components/page-header";

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
    <div className="min-w-0 space-y-section">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />

      <AdminGroupSearchForm
        initialQuery={query}
        initialStatus={groupStatus}
      />

      <AdminGroupsTable groups={groups} />
    </div>
  );
}
