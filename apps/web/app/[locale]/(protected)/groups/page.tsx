import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

import { getMyStudyGroups } from "@/features/study-groups/study-group.queries";
import { CreateStudyGroupForm } from "@/features/study-groups/components/create-study-group-form";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";

export default async function GroupsPage() {
  const [memberships, t] = await Promise.all([
    getMyStudyGroups(),
    getTranslations("groups.page"),
  ]);

  return (
    <section className="min-w-0 space-y-section">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} action={<CreateStudyGroupForm />} />

      <section className="min-w-0">
        <h2 className="text-section font-semibold text-foreground">
          {t("myGroups")}
        </h2>

        {memberships.length === 0 ? (
          <div className="mt-card border-y border-border py-section text-center">
            <p className="text-body text-muted-foreground">
              {t("empty")}
            </p>
          </div>
        ) : (
          <div className="mt-card grid gap-card md:grid-cols-2 xl:grid-cols-3">
            {memberships.map((membership) => {
              const group = membership.study_rooms;

              return (
                <article
                  key={membership.id}
                  className="flex min-w-0 flex-col items-start rounded-lg border border-border bg-card p-card"
                >
                  <Badge variant="secondary">
                    {t(`roles.${membership.role}`)}
                  </Badge>

                  <h3 className="mt-2 text-section font-semibold text-foreground [overflow-wrap:anywhere]">
                    {group.title}
                  </h3>

                  {group.description ? (
                    <p className="mt-1 line-clamp-3 text-body text-secondary-text [overflow-wrap:anywhere]" title={group.description}>
                      {group.description}
                    </p>
                  ) : null}

                  <div className="mt-auto pt-card">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/groups/${group.id}`}><ArrowRight aria-hidden="true" />{t("openGroup")}</Link>
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
