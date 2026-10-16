import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

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
    return "border-success/25 bg-success/10 text-foreground";
  }

  return "border-danger/25 bg-danger/10 text-foreground";
}

export function AdminTranslationsTable({
  translations,
}: AdminTranslationsTableProps) {
  const locale = useLocale();
  const id = useId();
  const t = useTranslations("admin.translations.table");
  const commonT = useTranslations("admin.common");

  return (
    <section className="min-w-0 space-y-3 border-t border-border pt-card">
      <div>
        <p className="text-caption text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h2 className="mt-1 text-section font-semibold text-foreground">
          {t("title")}
        </h2>
      </div>

      {translations.length === 0 ? (
        <div className="py-section">
          <p className="text-body text-secondary-text">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {translations.map((translation) => (
            <article
              key={translation.translation_id}
              className="min-w-0 py-card"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={statusClass(translation.status)}>
                      {t(`statuses.${translation.status}`)}
                    </Badge>

                    <span className="text-caption text-muted-foreground [overflow-wrap:anywhere]">
                      {translation.source_locale} → {translation.target_locale}
                    </span>

                    <span className="text-caption text-muted-foreground [overflow-wrap:anywhere]">
                      {translation.entity_type}.{translation.field_name}
                    </span>
                  </div>

                  <p className="mt-2 text-body font-medium text-foreground">
                    {translation.owner_name ?? commonT("unknownOwner")}
                  </p>

                  <p className="text-caption text-muted-foreground">
                    {translation.owner_email ?? translation.owner_id}
                  </p>

                  <p className="mt-3 text-caption text-muted-foreground">
                    {t("entity", { id: translation.entity_id })}
                  </p>

                  <p className="mt-1 text-caption text-muted-foreground">
                    {t("providerMeta", {
                      provider: translation.provider ?? commonT("na"),
                      model: translation.model_name ?? commonT("na"),
                    })}
                  </p>

                  <p className="mt-1 text-caption text-muted-foreground">
                    {t("updated", {
                      value: new Date(translation.updated_at).toLocaleString(
                        locale,
                      ),
                    })}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-1">
                  <AdminTranslationDeleteButton
                    translationId={translation.translation_id}
                  />

                  <AdminClearEntityTranslationsButton
                    entityType={translation.entity_type}
                    entityId={translation.entity_id}
                  />
                </div>
              </div>

              <details className="mt-3 min-w-0">
                <summary id={`${id}-${translation.translation_id}`} className="min-h-touch cursor-pointer rounded-sm py-2 text-label font-medium text-secondary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-control">
                  {t("viewTranslatedText")}
                </summary>

                <div role="region" aria-labelledby={`${id}-${translation.translation_id}`} tabIndex={0} className="mt-2 max-h-80 overflow-y-auto rounded-sm border-l-2 border-border pl-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <p className="whitespace-pre-wrap text-body text-foreground [overflow-wrap:anywhere]">
                    {translation.translated_text}
                  </p>
                </div>
              </details>

              {translation.error_message ? (
                <p className="mt-3 whitespace-pre-wrap border-l-2 border-danger pl-3 text-body text-foreground [overflow-wrap:anywhere]">
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
