import { PageHeader } from "@/features/app-shell/components/page-header";
import { CreateGoalForm } from "@/features/goals/components/create-goal.form";
import { GoalCard } from "@/features/goals/components/goal-card";
import { getGoals } from "@/features/goals/goal.queries";

export default async function GoalsPage() {
  const goals = await getGoals();

  return (
    <section className="px-4 py-6 md:px-6 lg:px-8 lg:py-8 xl:px-0">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex items-center justify-between">
          <PageHeader
            eyebrow="Lumivox"
            title="Goals"
            description="Create, monitor, and update learning goals that provide structure for behavioural analytics and PBI computation."
          />

          <CreateGoalForm />
        </div>

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Your goals</h2>
            <p className="mt-1 text-sm text-neutral-600">
              {goals.length} goal{goals.length === 1 ? "" : "s"} recorded.
            </p>
          </div>

          {goals.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-white p-10 text-center">
              <h3 className="text-lg font-semibold">No goals created yet</h3>
              <p className="mt-2 text-sm text-neutral-600">
                Your first goal will appear here after creation.
              </p>
            </div>
          ) : (
            <div className="space-y-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2">
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
