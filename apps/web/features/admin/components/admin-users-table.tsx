import { ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AdminUserRoleSelect } from "./admin-user-role-select";
import { AdminUserLeaderboardToggle } from "./admin-user-leaderboard-toggle";
import { AdminTableSection } from "./admin-table-section";

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

export function AdminUsersTable({ users }: { users: AdminUser[] }) {
  const locale = useLocale();
  const t = useTranslations("admin.users.table");
  const commonT = useTranslations("admin.common");

  return (
    <AdminTableSection title={t("title")} empty={users.length === 0} emptyMessage={t("empty")} className="min-w-240">
      <thead className="border-b border-border bg-muted text-label text-secondary-text">
        <tr>{["user", "role", "leaderboard", "activity", "created", "actions"].map((key) => <th key={key} scope="col">{commonT(key)}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-border">
        {users.map((user) => {
          const name = user.display_name || user.full_name || `User ${user.user_id.slice(0, 8)}`;
          return (
            <tr key={user.user_id} className="hover:bg-muted/50">
              <td className="max-w-64 [overflow-wrap:anywhere]">
                <Link href={`/admin/users/${user.user_id}`} className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{name}</Link>
                <p className="mt-1 text-caption text-muted-foreground">{user.email ?? commonT("noEmail")}</p>
                <p className="mt-1 text-caption text-muted-foreground">{user.user_id}</p>
              </td>
              <td><AdminUserRoleSelect userId={user.user_id} currentRole={user.role as "user" | "admin"} /></td>
              <td><AdminUserLeaderboardToggle userId={user.user_id} currentValue={user.leaderboard_opt_in} /></td>
              <td className="text-caption tabular-nums text-secondary-text">
                <p>{t("activity.focusMinutes", { count: user.total_focus_minutes })}</p>
                <p>{t("activity.tasks", { completed: user.completed_tasks, total: user.total_tasks })}</p>
                <p>{t("activity.docs", { count: user.uploaded_documents })}</p>
              </td>
              <td className="text-caption tabular-nums text-secondary-text">{user.created_at ? new Date(user.created_at).toLocaleString(locale) : commonT("na")}</td>
              <td><Button asChild variant="ghost" size="icon"><Link href={`/admin/users/${user.user_id}`} aria-label={`${commonT("view")}: ${name}`} title={commonT("view")}><ArrowUpRight aria-hidden="true" /></Link></Button></td>
            </tr>
          );
        })}
      </tbody>
    </AdminTableSection>
  );
}
