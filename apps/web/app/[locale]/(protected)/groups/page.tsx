import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

import { getMyStudyGroups } from "@/features/study-groups/study-group.queries";
import { CreateStudyGroupForm } from "@/features/study-groups/components/create-study-group-form";

export default async function GroupsPage() {
  const [memberships, t] = await Promise.all([
    getMyStudyGroups(),
    getTranslations("groups.page"),
  ]);

  return (
    <main className="space-y-6 py-4">
      <section className="rounded-2xl border bg-background p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>

        <p className="mt-3 max-w-3xl text-muted-foreground">
          {t("description")}
        </p>
      </section>

      <CreateStudyGroupForm />

      <section className="rounded-2xl border bg-background p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-foreground">
          {t("myGroups")}
        </h2>

        {memberships.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed p-8 text-center">
            <p className="text-sm text-gray-500">
              {t("empty")}
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {memberships.map((membership) => {
              const group = membership.study_rooms;

              return (
                <article
                  key={membership.id}
                  className="rounded-2xl border p-5 dark:border-neutral-800"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t(`roles.${membership.role}`)}
                  </p>

                  <h3 className="mt-2 text-lg font-bold text-foreground">
                    {group.title}
                  </h3>

                  {group.description ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {group.description}
                    </p>
                  ) : null}

                  <Link
                    href={`/groups/${group.id}`}
                    className="mt-4 inline-flex rounded-xl bg-background px-4 py-2 text-sm font-medium text-foreground transition"
                  >
                    {t("openGroup")}
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
