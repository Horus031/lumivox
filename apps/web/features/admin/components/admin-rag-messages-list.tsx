"use client";

import { useLocale, useTranslations } from "next-intl";

type RagMessage = {
  message_id: string;
  role: string;
  content: string;
  context_mode: string | null;
  selected_document_ids: string[] | null;
  top_k: number | null;
  prompt_variant: string | null;
  sources: unknown;
  source_count: number;
  latency_ms: number | null;
  created_at: string;
};

type AdminRagMessagesListProps = {
  messages: RagMessage[];
};

export function AdminRagMessagesList({
  messages,
}: AdminRagMessagesListProps) {
  const locale = useLocale();
  const t = useTranslations("admin.ai.messages");
  const commonT = useTranslations("admin.common");

  return (
    <section className="rounded-2xl border bg-surface p-6 shadow-sm">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h2 className="mt-2 text-2xl font-bold text-foreground">
          {t("title")}
        </h2>
      </div>

      {messages.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {messages.map((message) => (
            <article
              key={message.message_id}
              className={`rounded-2xl border p-4 ${
                message.role === "assistant"
                  ? ""
                  : "bg-surface"
              }`}
            >
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                <div>
                  <p className="font-semibold text-foreground">
                    {commonT(`roles.${message.role}`)}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(message.created_at))}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-overlay px-3 py-1 text-foreground">
                    {message.context_mode
                      ? commonT(`contextModes.${message.context_mode}`)
                      : commonT("na")}
                  </span>

                  <span className="rounded-full bg-overlay px-3 py-1 text-foreground">
                    {commonT("topK")}: {message.top_k ?? commonT("na")}
                  </span>

                  <span className="rounded-full bg-overlay px-3 py-1 text-foreground">
                    {commonT("sources")}: {message.source_count}
                  </span>

                  <span className="rounded-full bg-overlay px-3 py-1 text-foreground">
                    {commonT("latency")}: {message.latency_ms ?? 0} ms
                  </span>
                </div>
              </div>

              <p className="mt-4 whitespace-pre-wrap rounded-xl bg-surface text-sm leading-6 text-foreground">
                {message.content}
              </p>

              {message.role === "assistant" && message.sources ? (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {t("viewRawSources")}
                  </summary>

                  <pre className="mt-3 overflow-x-auto rounded-xl bg-neutral-950 p-4 text-xs text-neutral-100">
                    {JSON.stringify(message.sources, null, 2)}
                  </pre>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
