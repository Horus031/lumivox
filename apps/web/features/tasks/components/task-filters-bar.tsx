"use client";

import { useCallback, useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { Goal } from "@/features/goals/goal.types";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type Filters = {
  q: string;
  status?: string;
  priority?: string;
  goalId?: string;
};

type TaskFiltersBarProps = {
  goals: Goal[];
  initialFilters: Filters;
  onApply: (filters: Filters) => void;
  onReset?: () => void;
};

export function TaskFiltersBar({
  goals,
  initialFilters,
  onApply,
  onReset,
}: TaskFiltersBarProps) {
  const t = useTranslations("tasks.filters");
  const taskT = useTranslations("tasks.form");
  const [q, setQ] = useState(initialFilters.q ?? "");
  const [status, setStatus] = useState<string | undefined>(
    initialFilters.status,
  );
  const [priority, setPriority] = useState<string | undefined>(
    initialFilters.priority,
  );
  const [goalId, setGoalId] = useState<string | undefined>(
    initialFilters.goalId,
  );

  const hasActiveFilters = Boolean(q || status || priority || goalId);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onApply({ q: q.trim(), status, priority, goalId });
    },
    [q, status, priority, goalId, onApply],
  );

  const handleReset = useCallback(() => {
    setQ("");
    setStatus(undefined);
    setPriority(undefined);
    setGoalId(undefined);
    onReset?.();
  }, [onReset]);

  return (
    <form
      onSubmit={handleSubmit}
      className=""
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_180px_180px_220px_auto]">
        <Label className="relative block">
          <span className="sr-only">{t("searchLabel")}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-10 pr-3"
          />
        </Label>

        <Select
          value={status ?? ""}
          onValueChange={(value) => setStatus(value || undefined)}
        >
          <SelectTrigger className="flex w-full border border-input bg-transparent px-3 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring">
            <SelectValue placeholder={t("allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>{taskT("fields.status")}</SelectLabel>
              <SelectItem value="todo">{taskT("statuses.todo")}</SelectItem>
              <SelectItem value="in_progress">
                {taskT("statuses.in_progress")}
              </SelectItem>
              <SelectItem value="completed">
                {taskT("statuses.completed")}
              </SelectItem>
              <SelectItem value="overdue">
                {taskT("statuses.overdue")}
              </SelectItem>
              <SelectItem value="cancelled">
                {taskT("statuses.cancelled")}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select
          value={priority ?? ""}
          onValueChange={(value) => setPriority(value || undefined)}
        >
          <SelectTrigger className="flex h-11 w-full border border-input bg-transparent px-3 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring">
            <SelectValue placeholder={t("allPriorities")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>{taskT("fields.priority")}</SelectLabel>
              <SelectItem value="low">{taskT("priorities.low")}</SelectItem>
              <SelectItem value="medium">
                {taskT("priorities.medium")}
              </SelectItem>
              <SelectItem value="high">{taskT("priorities.high")}</SelectItem>
              <SelectItem value="critical">
                {taskT("priorities.critical")}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select
          value={goalId ?? ""}
          onValueChange={(value) => setGoalId(value || undefined)}
        >
          <SelectTrigger className="flex h-11 w-full border border-input bg-transparent px-3 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring">
            <SelectValue placeholder={t("allGoals")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>{taskT("fields.linkedGoal")}</SelectLabel>
              {goals.map((goal) => (
                <SelectItem key={goal.id} value={goal.id}>
                  {goal.title}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Button type="submit" className="h-11 px-5">
            {t("apply")}
          </Button>

          {hasActiveFilters ? (
            <Button
              type="button"
              variant="outline"
              className="px-5 h-11"
              onClick={handleReset}
            >
              {t("reset")}
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  );
}
