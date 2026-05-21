"use client";

import { useCallback, useMemo, useState } from "react";

import type { TaskWithGoal } from "@/features/tasks/task.types";
import type { Goal } from "@/features/goals/goal.types";
import { TaskFiltersBar } from "./task-filters-bar";
import { TasksTable } from "./tasks-table";
import { TaskPagination } from "./task-pagination";

type Filters = {
  q: string;
  status?: string;
  priority?: string;
  goalId?: string;
};

type TasksClientProps = {
  initialTasks: TaskWithGoal[];
  goals: Goal[];
  page: number;
  totalPages: number;
  totalCount: number;
  initialFilters: Filters;
};

export default function TasksClient({
  initialTasks,
  goals,
  page,
  totalPages,
  totalCount,
  initialFilters,
}: TasksClientProps) {
  const [filters, setFilters] = useState<Filters>(initialFilters);

  const onApply = useCallback((f: Filters) => {
    setFilters(f);
  }, []);

  const onReset = useCallback(() => {
    setFilters({ q: "" });
  }, []);

  const filteredTasks = useMemo(() => {
    return initialTasks.filter((t) => {
      if (filters.q && !t.title.toLowerCase().includes(filters.q.toLowerCase()) && !(t.description || "").toLowerCase().includes(filters.q.toLowerCase())) {
        return false;
      }

      if (filters.status && t.status !== filters.status) return false;
      if (filters.priority && t.priority !== filters.priority) return false;
      if (filters.goalId && t.goal_id !== filters.goalId) return false;

      return true;
    });
  }, [initialTasks, filters]);

  const hasFilters = Boolean(filters.q || filters.status || filters.priority || filters.goalId);

  return (
    <section className="space-y-4 p-4 border-0 border-none md:p-5">
      <TaskFiltersBar goals={goals} initialFilters={initialFilters} onApply={onApply} onReset={onReset} />

      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Tasks</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {filteredTasks.length} task{filteredTasks.length === 1 ? "" : "s"} shown
            {hasFilters ? " (filtered)" : ""} — {totalCount} total recorded.
          </p>
        </div>

        <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
      </div>

      <TasksTable tasks={filteredTasks} goals={goals} />

      <TaskPagination page={page} totalPages={totalPages} hasFilters={hasFilters} filters={{ q: filters.q, status: filters.status, priority: filters.priority, goalId: filters.goalId }} />
    </section>
  );
}
