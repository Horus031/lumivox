import { AdminMetricCard } from "@/features/admin/components/admin-metric-card";
import { AdminRecentUsersTable } from "@/features/admin/components/admin-recent-users-table";
import {
  getAdminDashboardMetrics,
  getAdminRecentUsers,
} from "@/features/admin/admin.queries";
import { getLocale, getTranslations } from "next-intl/server";

function formatNumber(value: number | null | undefined, locale: string) {
  return new Intl.NumberFormat(locale).format(value ?? 0);
}

export default async function AdminDashboardPage() {
  const [metrics, recentUsers, t, locale] = await Promise.all([
    getAdminDashboardMetrics(),
    getAdminRecentUsers(),
    getTranslations("admin.dashboard"),
    getLocale(),
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          label={t("metrics.totalUsers")}
          value={formatNumber(metrics?.total_users, locale)}
          description={t("metrics.newUsers", {
            count: formatNumber(metrics?.users_created_last_7_days, locale),
          })}
        />

        <AdminMetricCard
          label={t("metrics.admins")}
          value={formatNumber(metrics?.total_admins, locale)}
          description={t("metrics.adminsDescription")}
        />

        <AdminMetricCard
          label={t("metrics.goals")}
          value={formatNumber(metrics?.total_goals, locale)}
          description={t("metrics.goalsDescription")}
        />

        <AdminMetricCard
          label={t("metrics.tasks")}
          value={formatNumber(metrics?.total_tasks, locale)}
          description={t("metrics.completed", {
            count: formatNumber(metrics?.completed_tasks, locale),
          })}
        />

        <AdminMetricCard
          label={t("metrics.focusSessions")}
          value={formatNumber(metrics?.total_focus_sessions, locale)}
          description={t("metrics.totalFocusMinutes", {
            count: formatNumber(metrics?.total_focus_minutes, locale),
          })}
        />

        <AdminMetricCard
          label={t("metrics.documents")}
          value={formatNumber(metrics?.total_learning_documents, locale)}
          description={t("metrics.processedDocuments", {
            count: formatNumber(metrics?.processed_learning_documents, locale),
          })}
        />

        <AdminMetricCard
          label={t("metrics.documentChunks")}
          value={formatNumber(metrics?.total_document_chunks, locale)}
          description={t("metrics.documentChunksDescription")}
        />

        <AdminMetricCard
          label={t("metrics.studyGroups")}
          value={formatNumber(metrics?.total_study_groups, locale)}
          description={t("metrics.groupMessages", {
            count: formatNumber(metrics?.total_group_messages, locale),
          })}
        />

        <AdminMetricCard
          label={t("metrics.ragSessions")}
          value={formatNumber(metrics?.total_rag_chat_sessions, locale)}
          description={t("metrics.ragMessages", {
            count: formatNumber(metrics?.total_rag_chat_messages, locale),
          })}
        />

        <AdminMetricCard
          label={t("metrics.failedDocuments")}
          value={formatNumber(metrics?.failed_learning_documents, locale)}
          description={t("metrics.failedDocumentsDescription")}
        />
      </section>

      <AdminRecentUsersTable users={recentUsers} />
    </main>
  );
}
