import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AdminUserRoleSelect } from "./admin-user-role-select";
import { AdminUserLeaderboardToggle } from "./admin-user-leaderboard-toggle";

type AdminUser = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  role: string;
  leaderboard_opt_in: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
  total_goals: number;
  total_tasks: number;
  completed_tasks: number;
  total_focus_sessions: number;
  total_focus_minutes: number;
  uploaded_documents: number;
};

type AdminUsersTableProps = {
  users: AdminUser[];
};

function getDisplayName(user: AdminUser) {
  return user.display_name || user.full_name || `User ${user.user_id.slice(0, 8)}`;
}

function formatDate(value: string | null, locale: string, fallback: string) {
  if (!value) return fallback;
  return new Date(value).toLocaleString(locale);
}

export function AdminUsersTable({ users }: AdminUsersTableProps) {
  const locale = useLocale();
  const t = useTranslations("admin.users.table");
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

      {users.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl">
          <table className="min-w-300 w-full text-sm">
            <thead className="bg-surface text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("user")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("role")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("leaderboard")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("activity")}
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
              {users.map((user) => (
                <tr key={user.user_id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {getDisplayName(user)}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {user.email ?? commonT("noEmail")}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {user.user_id}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    <AdminUserRoleSelect
                      userId={user.user_id}
                      currentRole={user.role as "user" | "admin"}
                    />
                  </td>

                  <td className="px-4 py-3">
                    <AdminUserLeaderboardToggle
                      userId={user.user_id}
                      currentValue={user.leaderboard_opt_in}
                    />
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    <p>
                      {t("activity.focusMinutes", {
                        count: user.total_focus_minutes,
                      })}
                    </p>
                    <p>
                      {t("activity.tasks", {
                        completed: user.completed_tasks,
                        total: user.total_tasks,
                      })}
                    </p>
                    <p>
                      {t("activity.docs", { count: user.uploaded_documents })}
                    </p>
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    {formatDate(user.created_at, locale, commonT("na"))}
                  </td>

                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${user.user_id}`}
                      className="rounded-xl border px-3 py-2 text-sm font-medium transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                    >
                      {commonT("view")}
                    </Link>
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
