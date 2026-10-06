"use client";

import { useState, useTransition, type FormEvent } from "react";

import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { Textarea } from "@/components/ui/textarea";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { GoalOption } from "@/features/goals/goal.types";

import type { TaskWithGoal } from "@/features/tasks/task.types";

import { updateTaskAction } from "@/features/tasks/task.actions";

import { TaskDatePicker } from "./task-date-picker";

type TaskEditFormProps = {
  task: TaskWithGoal;

  goals: GoalOption[];

  onSaved: () => void;

  onCancel: () => void;

  allowGoalChange?: boolean;
};

function initialDueTime(dueAt: string | null) {
  if (!dueAt) {
    return "10:30";
  }

  const date = new Date(dueAt);

  return [
    String(date.getHours()).padStart(2, "0"),

    String(date.getMinutes()).padStart(2, "0"),
  ].join(":");
}

export function TaskEditForm({
  task,
  goals,
  onSaved,
  onCancel,
  allowGoalChange = true,
}: TaskEditFormProps) {
  const t = useTranslations("tasks.form");

  const commonT = useTranslations("common");

  const router = useRouter();

  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(task.title);

  const [description, setDescription] = useState(task.description ?? "");

  const [goalId, setGoalId] = useState(task.goal_id ?? "");

  const [priority, setPriority] = useState<
    "low" | "medium" | "high" | "critical"
  >(task.priority);

  const [estimatedMinutes, setEstimatedMinutes] = useState(
    task.estimated_minutes?.toString() ?? "",
  );

  const [dueAt, setDueAt] = useState<Date | undefined>(
    task.due_at ? new Date(task.due_at) : undefined,
  );

  const [dueTime, setDueTime] = useState(() => initialDueTime(task.due_at));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await updateTaskAction({
        taskId: task.id,

        title,

        description,

        goalId,

        priority,

        estimatedMinutes:
          estimatedMinutes.trim() === "" ? undefined : Number(estimatedMinutes),

        dueAt: dueAt ? dueAt.toISOString() : "",

        // Status is intentionally NOT editable here.
        //
        // Workflow changes belong to the Kanban transition
        // layer. Metadata editing simply preserves the
        // current persisted status.
        status: task.status,

        expectedStatus: task.status,

        expectedUpdatedAt: task.updated_at,
      });

      if (!result.success) {
        toast.error(result.message);

        return;
      }

      toast.success(result.message);

      onSaved();

      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label>{t("fields.title")}</Label>

        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={160}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>{t("fields.description")}</Label>

        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          maxLength={1200}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {allowGoalChange ? (
          <div className="space-y-2">
            <Label>{t("fields.linkedGoal")}</Label>

            <Select
              value={goalId || "no-goal"}
              onValueChange={(value) =>
                setGoalId(value === "no-goal" ? "" : value)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectGroup>
                  <SelectItem value="no-goal">{t("noGoal")}</SelectItem>

                  {goals.map((goal) => (
                    <SelectItem key={goal.id} value={goal.id}>
                      {goal.title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label>{t("fields.priority")}</Label>

          <Select
            value={priority}
            onValueChange={(value) =>
              setPriority(value as "low" | "medium" | "high" | "critical")
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              <SelectGroup>
                <SelectLabel>{t("fields.priority")}</SelectLabel>

                <SelectItem value="low">{t("priorities.low")}</SelectItem>

                <SelectItem value="medium">{t("priorities.medium")}</SelectItem>

                <SelectItem value="high">{t("priorities.high")}</SelectItem>

                <SelectItem value="critical">
                  {t("priorities.critical")}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t("fields.estimatedMinutes")}</Label>

          <Input
            type="number"
            min={0}
            value={estimatedMinutes}
            onChange={(event) => setEstimatedMinutes(event.target.value)}
          />
        </div>

        <TaskDatePicker
          dueAt={dueAt}
          setDueAt={setDueAt}
          dueTime={dueTime}
          setDueTime={setDueTime}
        />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={onCancel}
        >
          {commonT("cancel")}
        </Button>

        <Button type="submit" disabled={isPending}>
          {isPending ? t("saving") : commonT("save")}
        </Button>
      </div>
    </form>
  );
}
