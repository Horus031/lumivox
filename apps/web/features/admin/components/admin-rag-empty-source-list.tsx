import { ArrowUpRight, AlertTriangle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

type EmptySourceAnswer = {
  message_id: string; session_id: string; user_id: string; user_name: string | null;
  user_email: string | null; content: string; context_mode: string; top_k: number | null;
  prompt_variant: string | null; latency_ms: number | null; created_at: string;
};

export function AdminRagEmptySourceList({ answers }: { answers: EmptySourceAnswer[] }) {
  const locale = useLocale();
  const t = useTranslations("admin.ai.emptySources");
  const commonT = useTranslations("admin.common");
  return (
    <section className="min-w-0 space-y-3 border-t border-border pt-card">
      <div className="min-w-0">
        <h2 className="flex items-start gap-2 text-section font-semibold text-foreground"><AlertTriangle className="mt-1 size-icon shrink-0 text-foreground" aria-hidden="true" />{t("title")}</h2>
        <p className="mt-1 text-body text-secondary-text [overflow-wrap:anywhere]">{t("description")}</p>
      </div>
      {answers.length === 0 ? <p className="py-section text-body text-muted-foreground">{t("empty")}</p> : (
        <div className="divide-y divide-border">
          {answers.map((answer) => (
            <article key={answer.message_id} className="min-w-0 py-card">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <h3 className="text-body font-medium text-foreground">{answer.user_name ?? t("fallbackUser", { id: answer.user_id.slice(0, 8) })}</h3>
                  <p className="mt-1 text-caption text-muted-foreground">{answer.user_email ?? answer.user_id} - {new Date(answer.created_at).toLocaleString(locale)}</p>
                  <p className="mt-1 text-caption text-muted-foreground">{t("metadata", { topK: answer.top_k ?? commonT("na"), prompt: answer.prompt_variant ?? commonT("na"), latency: answer.latency_ms ?? 0 })}</p>
                </div>
                <Button asChild variant="ghost" size="icon"><Link href={`/admin/ai/sessions/${answer.session_id}`} aria-label={`${t("reviewSession")}: ${answer.session_id}`} title={t("reviewSession")}><ArrowUpRight aria-hidden="true" /></Link></Button>
              </div>
              <p className="mt-3 line-clamp-4 whitespace-pre-wrap border-l-2 border-warning pl-3 text-body text-secondary-text [overflow-wrap:anywhere]">{answer.content}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
