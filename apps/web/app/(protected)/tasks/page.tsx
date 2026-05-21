import { PageHeader } from "@/features/app-shell/components/page-header";
import { getGoals } from "@/features/goals/goal.queries";
import { CreateTaskModal } from "@/features/tasks/components/create-task-modal";
import TasksClient from "@/features/tasks/components/tasks-client";
import { getTasksPage } from "@/features/tasks/task.queries";
import type { Task } from "@/features/tasks/task.types";

type TasksPageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
    status?: string;
    priority?: string;
    goalId?: string;
  }>;
};

function parsePage(value: string | undefined) {
  const parsed = Number(value ?? "1");

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.floor(parsed);
}

function parseQueryValue(value: string | undefined) {
  return value?.trim() ?? "";
}

function parseTaskStatus(
  value: string | undefined,
): Task["status"] | undefined {
  if (
    value === "todo" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "overdue" ||
    value === "cancelled"
  ) {
    return value;
  }

  return undefined;
}

function parseTaskPriority(
  value: string | undefined,
): Task["priority"] | undefined {
  if (value === "low" || value === "medium" || value === "high" || value === "critical") {
    return value;
  }

  return undefined;
}

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const params = await searchParams;
  const goals = await getGoals();

  const page = parsePage(params.page);
  const query = parseQueryValue(params.q);
  const status = parseTaskStatus(params.status);
  const priority = parseTaskPriority(params.priority);
  const goalId = parseQueryValue(params.goalId);

  const { tasks, totalCount, totalPages } = await getTasksPage({
    page,
    pageSize: 8,
    search: query,
    status,
    priority,
    goalId,
  });

  return (
    <section className="px-4 py-6 md:px-6 lg:px-8 lg:py-8 xl:px-0">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          eyebrow="Lumivox"
          title="Tasks"
          description="Manage actionable work items, connect them to goals, and generate the behavioural records Lumivox analyses."
          action={<CreateTaskModal goals={goals} />}
        />

        <TasksClient
          initialTasks={tasks}
          goals={goals}
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          initialFilters={{ q: query, status, priority, goalId }}
        />
      </div>
    </section>
  );
}
