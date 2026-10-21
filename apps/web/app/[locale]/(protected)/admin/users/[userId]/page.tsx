import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { AdminMetricCard } from "@/features/admin/components/admin-metric-card";
import { AdminUserLeaderboardToggle } from "@/features/admin/components/admin-user-leaderboard-toggle";
import { AdminUserRoleSelect } from "@/features/admin/components/admin-user-role-select";
import { getAdminUserDetail } from "@/features/admin/admin-users.queries";

type AdminUserDetailPageProps = {
  params: Promise<{
    userId: string;
  }>;
};

function formatDate(value: string | null, locale: string, fallback: string) {
  if (!value) return fallback;
  return new Date(value).toLocaleString(locale);
}

function getDisplayName(user: {
  full_name: string | null;
  display_name: string | null;
  user_id: string;
}) {
  return (
    user.display_name ||
    user.full_name ||
    `User ${user.user_id.slice(0, 8)}`
  );
}

export default async function AdminUserDetailPage({
  params,
}: AdminUserDetailPageProps) {
  const { userId } = await params;

  const [user, t, commonT, locale] = await Promise.all([
    getAdminUserDetail(userId),
    getTranslations("admin.users.detail"),
    getTranslations("admin.common"),
    getLocale(),
  ]);

  if (!user) {
    notFound();
  }

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-surface p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          {getDisplayName(user)}
        </h1>

        <p className="mt-3 max-w-3xl text-muted-foreground">
          {user.email ?? commonT("noEmail")} - {user.user_id}
        </p>

        <div className="mt-5 flex flex-wrap gap-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {commonT("role")}
            </p>

            <AdminUserRoleSelect
              userId={user.user_id}
              currentRole={user.role as "user" | "admin"}
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {commonT("leaderboardVisibility")}
            </p>

            <AdminUserLeaderboardToggle
              userId={user.user_id}
              currentValue={user.leaderboard_opt_in}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label={commonT("goals")} value={user.total_goals} />
        <AdminMetricCard
          label={commonT("tasks")}
          value={user.total_tasks}
          description={commonT("completed", { count: user.completed_tasks })}
        />
        <AdminMetricCard
          label={commonT("focusSessions")}
          value={user.total_focus_sessions}
          description={commonT("focusMinutes", {
            count: user.total_focus_minutes,
          })}
        />
        <AdminMetricCard
          label={commonT("documents")}
          value={user.uploaded_documents}
          description={commonT("processed", { count: user.processed_documents })}
        />
        <AdminMetricCard
          label={commonT("ragSessions")}
          value={user.rag_chat_sessions}
          description={commonT("messagesCount", {
            count: user.rag_chat_messages,
          })}
        />
        <AdminMetricCard
          label={commonT("groups")}
          value={user.study_group_memberships}
          description={t("activeGroupMemberships")}
        />
        <AdminMetricCard
          label={t("currentStreak")}
          value={commonT("days", { count: user.current_streak })}
        />
        <AdminMetricCard label={t("tokenBalance")} value={user.token_balance} />
      </section>

      <section className="rounded-2xl border bg-surface p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-foreground">
          {t("timeline")}
        </h2>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border p-4">
            <p className="text-sm text-muted-foreground">
              {t("createdAt")}
            </p>
            <p className="mt-2 font-medium text-foreground">
              {formatDate(user.created_at, locale, commonT("na"))}
            </p>
          </div>

          <div className="rounded-2xl border p-4">
            <p className="text-sm text-muted-foreground">
              {commonT("lastSignIn")}
            </p>
            <p className="mt-2 font-medium text-foreground">
              {formatDate(user.last_sign_in_at, locale, commonT("na"))}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
