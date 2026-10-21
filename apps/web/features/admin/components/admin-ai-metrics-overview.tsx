import { AdminMetricCard } from "@/features/admin/components/admin-metric-card";
import { useTranslations } from "next-intl";

type AiMetrics = {
  total_rag_sessions: number;
  total_rag_messages: number;
  general_ai_messages: number;
  document_rag_messages: number;
  grounded_rule_messages: number;
  no_rule_messages: number;
  top_k_3_messages: number;
  top_k_5_messages: number;
  top_k_7_messages: number;
  avg_latency_ms: number | null;
  max_latency_ms: number | null;
  assistant_messages: number;
  user_messages: number;
  messages_with_sources: number;
  document_rag_messages_without_sources: number;
  processed_documents: number;
  failed_documents: number;
  pending_documents: number;
  unsupported_documents: number;
  total_document_chunks: number;
  embedded_document_chunks: number;
};

type AdminAiMetricsOverviewProps = {
  metrics: AiMetrics | null;
};

function value(input: number | null | undefined) {
  return input ?? 0;
}

export function AdminAiMetricsOverview({
  metrics,
}: AdminAiMetricsOverviewProps) {
  const t = useTranslations("admin.ai.metrics");

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <AdminMetricCard
        label={t("ragSessions")}
        value={value(metrics?.total_rag_sessions)}
        description={t("totalMessages", {
          count: value(metrics?.total_rag_messages),
        })}
      />

      <AdminMetricCard
        label={t("generalAi")}
        value={value(metrics?.general_ai_messages)}
        description={t("generalAiDescription")}
      />

      <AdminMetricCard
        label={t("documentRag")}
        value={value(metrics?.document_rag_messages)}
        description={t("documentRagDescription")}
      />

      <AdminMetricCard
        label={t("avgLatency")}
        value={`${value(metrics?.avg_latency_ms)} ms`}
        description={t("maxLatency", { count: value(metrics?.max_latency_ms) })}
      />

      <AdminMetricCard
        label={t("groundedRule")}
        value={value(metrics?.grounded_rule_messages)}
        description={t("groundedRuleDescription")}
      />

      <AdminMetricCard
        label={t("noRule")}
        value={value(metrics?.no_rule_messages)}
        description={t("noRuleDescription")}
      />

      <AdminMetricCard
        label={t("messagesWithSources")}
        value={value(metrics?.messages_with_sources)}
        description={t("messagesWithSourcesDescription")}
      />

      <AdminMetricCard
        label={t("emptySourceRag")}
        value={value(metrics?.document_rag_messages_without_sources)}
        description={t("emptySourceRagDescription")}
      />

      <AdminMetricCard
        label={t("processedDocs")}
        value={value(metrics?.processed_documents)}
        description={t("failedDocs", { count: value(metrics?.failed_documents) })}
      />

      <AdminMetricCard
        label={t("pendingDocs")}
        value={value(metrics?.pending_documents)}
        description={t("unsupportedDocs", {
          count: value(metrics?.unsupported_documents),
        })}
      />

      <AdminMetricCard
        label={t("documentChunks")}
        value={value(metrics?.total_document_chunks)}
        description={t("embeddedChunks", {
          count: value(metrics?.embedded_document_chunks),
        })}
      />

      <AdminMetricCard
        label={t("topKUsage")}
        value={`3:${value(metrics?.top_k_3_messages)} / 5:${value(
          metrics?.top_k_5_messages
        )} / 7:${value(metrics?.top_k_7_messages)}`}
      />
    </section>
  );
}
