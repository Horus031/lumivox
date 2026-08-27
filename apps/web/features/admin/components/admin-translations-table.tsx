import {
  AdminClearEntityTranslationsButton,
  AdminTranslationDeleteButton,
} from "@/features/admin/components/admin-translation-delete-button";

type AdminTranslation = {
  translation_id: string;
  owner_id: string;
  owner_name: string | null;
  owner_email: string | null;

  entity_type: string;
  entity_id: string;
  field_name: string;

  source_locale: string;
  target_locale: string;
  source_hash: string;
  translated_text: string;

  provider: string | null;
  model_name: string | null;
  status: string;
  error_message: string | null;

  created_at: string;
  updated_at: string;
};

type AdminTranslationsTableProps = {
  translations: AdminTranslation[];
};

function statusClass(status: string) {
  if (status === "completed") {
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  }

  return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
}

export function AdminTranslationsTable({
  translations,
}: AdminTranslationsTableProps) {
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Translation Cache
        </p>

        <h2 className="mt-2 text-2xl font-bold text-neutral-950 dark:text-neutral-50">
          AI content translations
        </h2>
      </div>

      {translations.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed p-8 text-center dark:border-neutral-800">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            No cached translations found.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {translations.map((translation) => (
            <article
              key={translation.translation_id}
              className="rounded-2xl border p-4 dark:border-neutral-800"
            >
              <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass(
                        translation.status
                      )}`}
                    >
                      {translation.status}
                    </span>

                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                      {translation.source_locale} → {translation.target_locale}
                    </span>

                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                      {translation.entity_type}.{translation.field_name}
                    </span>
                  </div>

                  <p className="mt-3 text-sm font-medium text-neutral-950 dark:text-neutral-50">
                    {translation.owner_name ?? "Unknown owner"}
                  </p>

                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {translation.owner_email ?? translation.owner_id}
                  </p>

                  <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                    Entity: {translation.entity_id}
                  </p>

                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Provider: {translation.provider ?? "N/A"} · Model:{" "}
                    {translation.model_name ?? "N/A"}
                  </p>

                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Updated: {new Date(translation.updated_at).toLocaleString()}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <AdminTranslationDeleteButton
                    translationId={translation.translation_id}
                  />

                  <AdminClearEntityTranslationsButton
                    entityType={translation.entity_type}
                    entityId={translation.entity_id}
                  />
                </div>
              </div>

              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  View translated text
                </summary>

                <div className="mt-3 rounded-xl bg-neutral-50 p-4 dark:bg-neutral-900">
                  <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-700 dark:text-neutral-300">
                    {translation.translated_text}
                  </p>
                </div>
              </details>

              {translation.error_message ? (
                <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                  {translation.error_message}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}