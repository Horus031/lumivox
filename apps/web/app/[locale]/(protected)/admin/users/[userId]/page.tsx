import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { AdminMetricCard } from "@/features/admin/components/admin-metric-card";
import { AdminUserLeaderboardToggle } from "@/features/admin/components/admin-user-leaderboard-toggle";
import { AdminUserRoleSelect } from "@/features/admin/components/admin-user-role-select";
import { getAdminUserDetail } from "@/features/admin/admin-users.queries";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const [user, t, commonT, locale] = await Promise.all([
    getAdminUserDetail(userId), getTranslations("admin.users.detail"), getTranslations("admin.common"), getLocale(),
  ]);
  if (!user) notFound();
  const name = user.display_name || user.full_name || `User ${user.user_id.slice(0, 8)}`;

  return (
    <div className="min-w-0 space-y-section">
      <PageHeader eyebrow={t("eyebrow")} title={name} description={`${user.email ?? commonT("noEmail")} - ${user.user_id}`} action={
        <Button asChild variant="outline"><Link href="/admin/users"><ArrowLeft aria-hidden="true" />{commonT("backToList")}</Link></Button>
      } />
      <section className="grid min-w-0 gap-4 border-y border-border py-card sm:grid-cols-2 sm:items-start">
        <div className="min-w-0 space-y-2">
          <p className="text-label font-medium text-foreground">{commonT("role")}</p>
          <div className="max-w-64"><AdminUserRoleSelect userId={user.user_id} currentRole={user.role as "user" | "admin"} /></div>
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-label font-medium text-foreground">{commonT("leaderboardVisibility")}</p>
          <AdminUserLeaderboardToggle userId={user.user_id} currentValue={user.leaderboard_opt_in} />
        </div>
      </section>
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label={commonT("goals")} value={user.total_goals} />
        <AdminMetricCard label={commonT("tasks")} value={user.total_tasks} description={commonT("completed", { count: user.completed_tasks })} />
        <AdminMetricCard label={commonT("focusSessions")} value={user.total_focus_sessions} description={commonT("focusMinutes", { count: user.total_focus_minutes })} />
        <AdminMetricCard label={commonT("documents")} value={user.uploaded_documents} description={commonT("processed", { count: user.processed_documents })} />
        <AdminMetricCard label={commonT("ragSessions")} value={user.rag_chat_sessions} description={commonT("messagesCount", { count: user.rag_chat_messages })} />
        <AdminMetricCard label={commonT("groups")} value={user.study_group_memberships} description={t("activeGroupMemberships")} />
        <AdminMetricCard label={t("currentStreak")} value={commonT("days", { count: user.current_streak })} />
        <AdminMetricCard label={t("tokenBalance")} value={user.token_balance} />
      </section>
      <section className="space-y-3 border-t border-border pt-card">
        <h2 className="text-section font-semibold text-foreground">{t("timeline")}</h2>
        <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
          {[[t("createdAt"), user.created_at], [commonT("lastSignIn"), user.last_sign_in_at]].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-label text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-body tabular-nums text-foreground [overflow-wrap:anywhere]">{value ? new Date(value).toLocaleString(locale) : commonT("na")}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
