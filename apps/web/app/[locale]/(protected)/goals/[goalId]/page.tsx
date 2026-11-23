import { notFound } from "next/navigation";

import { getGoalById } from "@/features/goals/goal.queries";
import { GoalLearningDocuments } from "@/features/learning-documents/components/goal-learning-documents";
import { getTranslations } from "next-intl/server";

type GoalDetailPageProps = {
  params: Promise<{
    goalId: string;
  }>;
};

export default async function GoalDetailPage({ params }: GoalDetailPageProps) {
  const { goalId } = await params;

  const [t, goal] = await Promise.all([
    getTranslations("goals.detail"),
    getGoalById(goalId),
  ]);

  if (!goal) {
    notFound();
  }

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-background p-6 shadow-sm ">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">{goal.title}</h1>

        {goal.description ? (
          <p className="mt-3 max-w-3xl text-muted-foreground">{goal.description}</p>
        ) : null}
      </section>

      <GoalLearningDocuments goalId={goalId} />
    </main>
  );
}
