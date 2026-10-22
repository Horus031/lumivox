import { AdminAiMetricsOverview } from "@/features/admin/components/admin-ai-metrics-overview";
import { AdminAiSearchForm } from "@/features/admin/components/admin-ai-search-form";
import { AdminRagEmptySourceList } from "@/features/admin/components/admin-rag-empty-source-list";
import { AdminRagSessionsTable } from "@/features/admin/components/admin-rag-sessions-table";
import {
  getAdminAiMonitoringMetrics,
  getAdminRagEmptySourceAnswers,
  searchAdminRagChatSessions,
} from "@/features/admin/admin-ai.queries";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/features/app-shell/components/page-header";

type AdminAiPageProps = {
  searchParams: Promise<{
    q?: string;
    mode?: string;
  }>;
};

export default async function AdminAiPage({
  searchParams,
}: AdminAiPageProps) {
  const { q, mode } = await searchParams;

  const query = q ?? "";
  const contextMode = mode ?? "all";

  const [metrics, sessions, emptySourceAnswers, t] = await Promise.all([
    getAdminAiMonitoringMetrics(),
    searchAdminRagChatSessions({
      query,
      contextMode,
    }),
    getAdminRagEmptySourceAnswers(),
    getTranslations("admin.ai.page"),
  ]);

  return (
    <div className="min-w-0 space-y-section">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />

      <AdminAiMetricsOverview metrics={metrics} />

      <AdminAiSearchForm
        initialQuery={query}
        initialContextMode={contextMode}
      />

      <AdminRagSessionsTable sessions={sessions} />

      <AdminRagEmptySourceList answers={emptySourceAnswers} />
    </div>
  );
}
