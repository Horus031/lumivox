import { AdminUserSearchForm } from "@/features/admin/components/admin-user-search-form";
import { AdminUsersTable } from "@/features/admin/components/admin-users-table";
import { searchAdminUsers } from "@/features/admin/admin-users.queries";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/features/app-shell/components/page-header";

type AdminUsersPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  const { q } = await searchParams;
  const query = q ?? "";

  const [users, t] = await Promise.all([
    searchAdminUsers(query),
    getTranslations("admin.users.page"),
  ]);

  return (
    <div className="min-w-0 space-y-section">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />

      <AdminUserSearchForm initialQuery={query} />

      <AdminUsersTable users={users} />
    </div>
  );
}
