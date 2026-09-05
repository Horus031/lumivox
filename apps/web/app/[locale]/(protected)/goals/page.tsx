import { PageHeader } from "@/features/app-shell/components/page-header";
import { CreateGoalForm } from "@/features/goals/components/create-goal.form";
import { GoalCard } from "@/features/goals/components/goal-card";
import { getGoalsWithProgress } from "@/features/goals/goal.queries";
import { getTranslations } from "next-intl/server";

export default async function GoalsPage() {
  const t = await getTranslations("goals.page");
  const goals = await getGoalsWithProgress();

  return (
    <section>
      <div className="mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <PageHeader
            eyebrow={t("eyebrow")}
            title={t("title")}
            description={t("description")}
          />

          <CreateGoalForm />
        </div>

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">{t("sectionTitle")}</h2>
            <p className="mt-1 text-sm text-neutral-600">
              {t("recorded", { count: goals.length })}
            </p>
          </div>

          {goals.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-background p-10 text-center">
              <h3 className="text-lg font-semibold">{t("emptyTitle")}</h3>
              <p className="mt-2 text-sm text-neutral-600">
                {t("emptyDescription")}
              </p>
            </div>
          ) : (
            <div className="space-y-4 grid grid-cols-1 lg:space-y-0 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2">
              {goals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} />
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
