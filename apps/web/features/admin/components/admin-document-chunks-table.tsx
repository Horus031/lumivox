"use client";

import { useTranslations } from "next-intl";

type DocumentChunk = {
  chunk_id: string;
  chunk_index: number;
  content: string;
  content_char_count: number;
  token_estimate: number | null;
  embedding_model: string | null;
  status: string;
  has_embedding: boolean;
  created_at: string;
};

type AdminDocumentChunksTableProps = {
  chunks: DocumentChunk[];
};

export function AdminDocumentChunksTable({
  chunks,
}: AdminDocumentChunksTableProps) {
  const t = useTranslations("admin.documents.chunks");
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

      {chunks.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {chunks.map((chunk) => (
            <details
              key={chunk.chunk_id}
              className="rounded-2xl border bg-surface p-4"
            >
              <summary className="cursor-pointer">
                <span className="font-semibold text-foreground">
                  {t("chunkNumber", { index: chunk.chunk_index })}
                </span>

                <span className="ml-3 text-sm text-muted-foreground">
                  {t("chunkMeta", {
                    chars: chunk.content_char_count,
                    tokens: chunk.token_estimate ?? 0,
                    embedding: chunk.has_embedding
                      ? t("embedded")
                      : t("noEmbedding"),
                  })}
                </span>
              </summary>

              <div className="mt-4 rounded-xl bg-surface p-4">
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                  {chunk.content}
                </p>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                {t("model")}: {chunk.embedding_model ?? commonT("na")} -{" "}
                {commonT("status")}: {chunk.status}
              </p>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
