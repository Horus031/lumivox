"use client";

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";

type RagMessage = {
  message_id: string; role: string; content: string; context_mode: string | null;
  selected_document_ids: string[] | null; top_k: number | null; prompt_variant: string | null;
  sources: unknown; source_count: number; latency_ms: number | null; created_at: string;
};

export function AdminRagMessagesList({ messages }: { messages: RagMessage[] }) {
  const locale = useLocale();
  const t = useTranslations("admin.ai.messages");
  const commonT = useTranslations("admin.common");
  const detailT = useTranslations("admin.ai.detail");
  const id = useId();
  return (
    <section className="min-w-0 space-y-3 border-t border-border pt-card">
      <h2 className="text-section font-semibold text-foreground">{t("title")}</h2>
      {messages.length === 0 ? <p className="py-section text-body text-muted-foreground">{t("empty")}</p> : (
        <div className="divide-y divide-border">
          {messages.map((message) => {
            const titleId = `${id}-${message.message_id}`;
            const sourcesId = `${titleId}-sources`;
            const metadata = [
              [detailT("contextMode"), message.context_mode ? commonT(`contextModes.${message.context_mode}`) : commonT("na")],
              [commonT("topK"), message.top_k ?? commonT("na")], [commonT("sources"), message.source_count],
              [commonT("latency"), `${message.latency_ms ?? 0} ms`],
            ];
            return (
              <article key={message.message_id} className="min-w-0 py-card">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <h3 id={titleId} className="text-label font-medium text-foreground">{commonT(`roles.${message.role}`)}</h3>
                  <time dateTime={message.created_at} className="text-caption tabular-nums text-muted-foreground">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.created_at))}</time>
                </div>
                <dl className="mt-3 flex min-w-0 flex-wrap gap-x-4 gap-y-2 text-caption">
                  {metadata.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="mt-0.5 tabular-nums text-secondary-text [overflow-wrap:anywhere]">{value}</dd></div>)}
                </dl>
                <p role="region" aria-labelledby={titleId} tabIndex={0} className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-sm text-body text-foreground [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{message.content}</p>
                {message.role === "assistant" && message.sources ? (
                  <details className="mt-3 min-w-0">
                    <summary id={sourcesId} className="min-h-touch cursor-pointer rounded-sm py-2 text-label font-medium text-secondary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-control">{t("viewRawSources")}</summary>
                    <pre role="region" aria-labelledby={sourcesId} tabIndex={0} className="mt-2 max-h-80 max-w-full overflow-auto rounded-md border border-border bg-muted p-3 text-caption text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{JSON.stringify(message.sources, null, 2)}</pre>
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
