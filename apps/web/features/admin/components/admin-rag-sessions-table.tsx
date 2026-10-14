import { ArrowUpRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminTableSection } from "./admin-table-section";

type RagSession = {
  session_id: string; user_id: string; user_name: string | null; user_email: string | null;
  context_mode: string; selected_document_count: number; top_k: number | null;
  message_count: number; assistant_message_count: number; avg_latency_ms: number | null;
  created_at: string; updated_at: string | null;
};

export function AdminRagSessionsTable({ sessions }: { sessions: RagSession[] }) {
  const locale = useLocale();
  const t = useTranslations("admin.ai.sessions");
  const commonT = useTranslations("admin.common");
  const headers = [t("columns.session"), commonT("user"), t("columns.mode"), commonT("messages"), t("columns.latency"), commonT("updated"), commonT("actions")];
  return (
    <AdminTableSection title={t("title")} empty={sessions.length === 0} emptyMessage={t("empty")} className="min-w-240">
      <thead className="border-b border-border bg-muted text-label text-secondary-text"><tr>{headers.map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody className="divide-y divide-border">
        {sessions.map((session) => (
          <tr key={session.session_id} className="hover:bg-muted/50">
            <td className="max-w-48 [overflow-wrap:anywhere]">
              <Link href={`/admin/ai/sessions/${session.session_id}`} className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{session.session_id.slice(0, 8)}</Link>
              <p className="mt-1 font-mono text-caption text-muted-foreground">{session.session_id}</p>
            </td>
            <td className="max-w-52 [overflow-wrap:anywhere]"><p className="text-label font-medium text-foreground">{session.user_name ?? t("fallbackUser", { id: session.user_id.slice(0, 8) })}</p><p className="mt-1 text-caption text-muted-foreground">{session.user_email ?? session.user_id}</p></td>
            <td><Badge variant="outline" className={session.context_mode === "document_rag" ? "border-info/25 bg-info/10 text-foreground" : "bg-muted text-foreground"}>{commonT(`contextModes.${session.context_mode}`)}</Badge><p className="mt-1 text-caption text-muted-foreground">{t("documentMeta", { count: session.selected_document_count, topK: session.top_k ?? commonT("na") })}</p></td>
            <td className="text-caption tabular-nums text-secondary-text"><p>{t("totalMessages", { count: session.message_count })}</p><p>{t("assistantMessages", { count: session.assistant_message_count })}</p></td>
            <td className="text-caption tabular-nums text-secondary-text">{t("latencyMs", { count: session.avg_latency_ms ?? 0 })}</td>
            <td className="text-caption tabular-nums text-secondary-text">{new Date(session.updated_at ?? session.created_at).toLocaleString(locale)}</td>
            <td><Button asChild variant="ghost" size="icon"><Link href={`/admin/ai/sessions/${session.session_id}`} aria-label={`${commonT("view")}: ${session.session_id}`} title={commonT("view")}><ArrowUpRight aria-hidden="true" /></Link></Button></td>
          </tr>
        ))}
      </tbody>
    </AdminTableSection>
  );
}
