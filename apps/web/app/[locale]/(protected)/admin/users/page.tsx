import { AdminUserSearchForm } from "@/features/admin/components/admin-user-search-form";
import { AdminUsersTable } from "@/features/admin/components/admin-users-table";
import { searchAdminUsers } from "@/features/admin/admin-users.queries";
import { getTranslations } from "next-intl/server";

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
    <main className="space-y-6">
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

      <AdminUserSearchForm initialQuery={query} />

      <AdminUsersTable users={users} />
    </main>
  );
}
