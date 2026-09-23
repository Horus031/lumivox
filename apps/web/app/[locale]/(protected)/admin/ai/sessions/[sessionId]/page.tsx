import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { AdminMetricCard } from "@/features/admin/components/admin-metric-card";
import { AdminRagMessagesList } from "@/features/admin/components/admin-rag-messages-list";
import {
  getAdminRagChatMessages,
  getAdminRagChatSessionDetail,
} from "@/features/admin/admin-ai.queries";

type AdminAiSessionDetailPageProps = {
  params: Promise<{
    sessionId: string;
  }>;
};

export default async function AdminAiSessionDetailPage({
  params,
}: AdminAiSessionDetailPageProps) {
  const { sessionId } = await params;
  const [t, commonT, locale] = await Promise.all([
    getTranslations("admin.ai.detail"),
    getTranslations("admin.common"),
    getLocale(),
  ]);

  const [session, messages] = await Promise.all([
    getAdminRagChatSessionDetail(sessionId),
    getAdminRagChatMessages(sessionId),
  ]);

  if (!session) {
    notFound();
  }

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-surface p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          {t("title", { id: session.session_id.slice(0, 8) })}
        </h1>

        <p className="mt-3 max-w-3xl text-muted-foreground">
          {commonT("user")}:{" "}
          {session.user_name ??
            t("fallbackUser", { id: session.user_id.slice(0, 8) })}{" "}
          - {session.user_email ?? session.user_id}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          label={t("contextMode")}
          value={commonT(`contextModes.${session.context_mode}`)}
        />

        <AdminMetricCard
          label={t("selectedDocuments")}
          value={session.selected_document_count}
        />

        <AdminMetricCard
          label={commonT("topK")}
          value={session.top_k ?? commonT("na")}
        />

        <AdminMetricCard
          label={t("promptVariant")}
          value={session.prompt_variant ?? commonT("na")}
        />

        <AdminMetricCard
          label={commonT("messages")}
          value={messages.length}
        />

        <AdminMetricCard
          label={commonT("created")}
          value={new Intl.DateTimeFormat(locale).format(
            new Date(session.created_at)
          )}
        />

        <AdminMetricCard
          label={commonT("updated")}
          value={
            session.updated_at
              ? new Intl.DateTimeFormat(locale).format(
                  new Date(session.updated_at)
                )
              : commonT("na")
          }
        />
      </section>

      {session.selected_document_ids?.length ? (
        <section className="rounded-2xl border bg-surface p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-neutral-950 dark:text-neutral-50">
            {t("selectedDocuments")}
          </h2>

          <div className="mt-4 flex flex-wrap gap-2">
            {session.selected_document_ids.map((documentId) => (
              <span
                key={documentId}
                className="rounded-full bg-surface px-3 py-1 text-xs text-foreground"
              >
                {documentId}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <AdminRagMessagesList messages={messages} />
    </main>
  );
}
