import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type EmptySourceAnswer = {
  message_id: string;
  session_id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  content: string;
  context_mode: string;
  top_k: number | null;
  prompt_variant: string | null;
  latency_ms: number | null;
  created_at: string;
};

type AdminRagEmptySourceListProps = {
  answers: EmptySourceAnswer[];
};

export function AdminRagEmptySourceList({
  answers,
}: AdminRagEmptySourceListProps) {
  const locale = useLocale();
  const t = useTranslations("admin.ai.emptySources");
  const commonT = useTranslations("admin.common");

  return (
    <section className="rounded-2xl shadow-sm">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-red-500">
          {t("eyebrow")}
        </p>

        <h2 className="mt-2 text-2xl font-bold text-foreground">
          {t("title")}
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          {t("description")}
        </p>
      </div>

      {answers.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {answers.map((answer) => (
            <article
              key={answer.message_id}
              className="rounded-2xl border bg-red-50/40 p-4 dark:border-red-900 dark:bg-red-950/20"
            >
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                <div>
                  <p className="font-semibold text-neutral-950 dark:text-neutral-50">
                    {answer.user_name ??
                      t("fallbackUser", { id: answer.user_id.slice(0, 8) })}
                  </p>

                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {answer.user_email ?? answer.user_id} -{" "}
                    {new Date(answer.created_at).toLocaleString(locale)}
                  </p>

                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {t("metadata", {
                      topK: answer.top_k ?? commonT("na"),
                      prompt: answer.prompt_variant ?? commonT("na"),
                      latency: answer.latency_ms ?? 0,
                    })}
                  </p>
                </div>

                <Link
                  href={`/admin/ai/sessions/${answer.session_id}`}
                  className="rounded-xl border px-3 py-2 text-sm font-medium transition hover:bg-white dark:border-red-900 dark:hover:bg-red-950/40"
                >
                  {t("reviewSession")}
                </Link>
              </div>

              <p className="mt-4 line-clamp-4 whitespace-pre-wrap rounded-xl bg-white p-4 text-sm leading-6 text-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
                {answer.content}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
