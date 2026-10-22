import { AdminRoadmapMetricsOverview } from "@/features/admin/components/admin-roadmap-metrics-overview";
import { AdminRoadmapSearchForm } from "@/features/admin/components/admin-roadmap-search-form";
import { AdminRoadmapsTable } from "@/features/admin/components/admin-roadmaps-table";
import {
  getAdminRoadmapMetrics,
  searchAdminLearningRoadmaps,
} from "@/features/admin/admin-roadmaps.queries";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/features/app-shell/components/page-header";

type AdminRoadmapsPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
  }>;
};

export default async function AdminRoadmapsPage({
  searchParams,
}: AdminRoadmapsPageProps) {
  const { q, status } = await searchParams;

  const query = q ?? "";
  const roadmapStatus = status ?? "all";

  const [metrics, roadmaps, t] = await Promise.all([
    getAdminRoadmapMetrics(),
    searchAdminLearningRoadmaps({
      query,
      status: roadmapStatus,
    }),
    getTranslations("admin.roadmaps.page"),
  ]);

  return (
    <div className="min-w-0 space-y-section">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />

      <AdminRoadmapMetricsOverview metrics={metrics} />

      <AdminRoadmapSearchForm
        initialQuery={query}
        initialStatus={roadmapStatus}
      />

      <AdminRoadmapsTable roadmaps={roadmaps} />
    </div>
  );
}
