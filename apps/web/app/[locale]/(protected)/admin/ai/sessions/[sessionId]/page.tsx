import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { AdminRagMessagesList } from "@/features/admin/components/admin-rag-messages-list";
import { getAdminRagChatMessages, getAdminRagChatSessionDetail } from "@/features/admin/admin-ai.queries";

export default async function AdminAiSessionDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const [t, commonT, locale] = await Promise.all([getTranslations("admin.ai.detail"), getTranslations("admin.common"), getLocale()]);
  const [session, messages] = await Promise.all([getAdminRagChatSessionDetail(sessionId), getAdminRagChatMessages(sessionId)]);
  if (!session) notFound();
  const metadata = [
    [t("contextMode"), commonT(`contextModes.${session.context_mode}`)],
    [t("selectedDocuments"), session.selected_document_count], [commonT("topK"), session.top_k ?? commonT("na")],
    [t("promptVariant"), session.prompt_variant ?? commonT("na")], [commonT("messages"), messages.length],
    [commonT("created"), new Intl.DateTimeFormat(locale).format(new Date(session.created_at))],
    [commonT("updated"), session.updated_at ? new Intl.DateTimeFormat(locale).format(new Date(session.updated_at)) : commonT("na")],
  ];
  return (
    <div className="min-w-0 space-y-section">
      <PageHeader eyebrow={t("eyebrow")} title={t("title", { id: session.session_id.slice(0, 8) })} description={`${commonT("user")}: ${session.user_name ?? t("fallbackUser", { id: session.user_id.slice(0, 8) })} - ${session.user_email ?? session.user_id}`} action={
        <Button asChild variant="outline"><Link href="/admin/ai"><ArrowLeft aria-hidden="true" />{commonT("backToList")}</Link></Button>
      } />
      <dl className="grid min-w-0 gap-x-section gap-y-4 border-t border-border pt-card sm:grid-cols-2 xl:grid-cols-4">
        {metadata.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-label text-muted-foreground">{label}</dt><dd className="mt-1 text-body font-medium tabular-nums text-foreground [overflow-wrap:anywhere]">{value}</dd></div>)}
      </dl>
      {session.selected_document_ids?.length ? (
        <section className="min-w-0 space-y-3 border-t border-border pt-card">
          <h2 className="text-section font-semibold text-foreground">{t("selectedDocuments")}</h2>
          <ul className="divide-y divide-border">{session.selected_document_ids.map((id) => <li key={id} className="py-2 font-mono text-caption text-secondary-text [overflow-wrap:anywhere]">{id}</li>)}</ul>
        </section>
      ) : null}
      <AdminRagMessagesList messages={messages} />
    </div>
  );
}
