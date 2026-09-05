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

      <AdminAiMetricsOverview metrics={metrics} />

      <AdminAiSearchForm
        initialQuery={query}
        initialContextMode={contextMode}
      />

      <AdminRagSessionsTable sessions={sessions} />

      <AdminRagEmptySourceList answers={emptySourceAnswers} />
    </main>
  );
}
