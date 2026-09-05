import { PageHeader } from "@/features/app-shell/components/page-header";
import { getGoals } from "@/features/goals/goal.queries";
import { CreateTaskModal } from "@/features/tasks/components/create-task-modal";
import TasksClient from "@/features/tasks/components/tasks-client";
import { getTasksPage } from "@/features/tasks/task.queries";
import type { Task } from "@/features/tasks/task.types";
import { getTranslations } from "next-intl/server";

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
  const t = await getTranslations("tasks.page");
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
    <section>
      <div className="mx-auto space-y-16">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
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
