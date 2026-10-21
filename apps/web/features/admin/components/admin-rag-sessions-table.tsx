import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type RagSession = {
  session_id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  context_mode: string;
  selected_document_count: number;
  top_k: number | null;
  message_count: number;
  assistant_message_count: number;
  avg_latency_ms: number | null;
  created_at: string;
  updated_at: string | null;
};

type AdminRagSessionsTableProps = {
  sessions: RagSession[];
};

function statusClass(mode: string) {
  if (mode === "document_rag") {
    return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  }

  return "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300";
}

export function AdminRagSessionsTable({
  sessions,
}: AdminRagSessionsTableProps) {
  const locale = useLocale();
  const t = useTranslations("admin.ai.sessions");
  const commonT = useTranslations("admin.common");

  return (
    <section className="rounded-2xl shadow-sm">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h2 className="mt-2 text-2xl font-bold text-foreground">
          {t("title")}
        </h2>
      </div>

      {sessions.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border">
          <table className="min-w-275 w-full text-sm">
            <thead className="bg-surface text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {t("columns.session")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("user")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {t("columns.mode")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("messages")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {t("columns.latency")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("updated")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {commonT("actions")}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y dark:divide-neutral-800">
              {sessions.map((session) => (
                <tr key={session.session_id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {session.session_id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {session.session_id}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {session.user_name ??
                        t("fallbackUser", {
                          id: session.user_id.slice(0, 8),
                        })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {session.user_email ?? session.user_id}
                    </p>
                  </td>

                  <td className="px-4 text-left py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass(
                        session.context_mode,
                      )}`}
                    >
                      {commonT(`contextModes.${session.context_mode}`)}
                    </span>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("documentMeta", {
                        count: session.selected_document_count,
                        topK: session.top_k ?? commonT("na"),
                      })}
                    </p>
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    <p>{t("totalMessages", { count: session.message_count })}</p>
                    <p>
                      {t("assistantMessages", {
                        count: session.assistant_message_count,
                      })}
                    </p>
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    {t("latencyMs", { count: session.avg_latency_ms ?? 0 })}
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    {session.updated_at
                      ? new Date(session.updated_at).toLocaleString(locale)
                      : new Date(session.created_at).toLocaleString(locale)}
                  </td>

                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/ai/sessions/${session.session_id}`}
                      className="rounded-xl border px-3 py-2 text-sm font-medium transition"
                    >
                      {commonT("view")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
