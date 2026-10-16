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
    <section className="min-w-0 space-y-3 border-t border-border pt-card">
      <h2 className="text-section font-semibold text-foreground">
        {t("title")}
      </h2>

      {chunks.length === 0 ? (
        <div className="py-section">
          <p className="text-body text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {chunks.map((chunk) => (
            <details
              key={chunk.chunk_id}
              className="min-w-0 py-3 [overflow-wrap:anywhere]"
            >
              <summary className="min-h-touch cursor-pointer rounded-sm text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-control">
                <span className="font-medium text-foreground">
                  {t("chunkNumber", { index: chunk.chunk_index })}
                </span>

                <span className="mt-1 block text-caption text-muted-foreground sm:ml-3 sm:inline">
                  {t("chunkMeta", {
                    chars: chunk.content_char_count,
                    tokens: chunk.token_estimate ?? 0,
                    embedding: chunk.has_embedding
                      ? t("embedded")
                      : t("noEmbedding"),
                  })}
                </span>
              </summary>

              <div className="mt-3 max-h-80 overflow-y-auto border-l-2 border-border pl-3">
                <p className="whitespace-pre-wrap text-body text-foreground">
                  {chunk.content}
                </p>
              </div>

              <p className="mt-3 text-caption text-muted-foreground">
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
