"use client";

import type { FormEvent } from "react";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GoalOption } from "@/features/goals/goal.types";
import { createTaskAction } from "@/features/tasks/task.actions";

import { TaskModalShell } from "./task-modal-shell";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TaskDatePicker } from "./task-date-picker";
import { GoalPicker } from "@/features/goals/components/goal-picker";
import { Label } from "@/components/ui/label";

type CreateTaskModalProps = {
  defaultGoal?: GoalOption | null;
};

export function CreateTaskModal({ defaultGoal = null }: CreateTaskModalProps) {
  const t = useTranslations("tasks.form");
  const commonT = useTranslations("common");
  const router = useRouter();
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState(defaultGoal);
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [dueAt, setDueAt] = useState<Date | undefined>(undefined);
  const [dueTime, setDueTime] = useState("10:30");

  function combineDateAndTime(date: Date | undefined, time: string) {
    if (!date) {
      return "";
    }

    const [hours = 0, minutes = 0, seconds = 0] = time.split(":").map((value) => Number(value));

    const nextDate = new Date(date);
    nextDate.setHours(hours, minutes, seconds, 0);

    return nextDate.toISOString();
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setGoal(defaultGoal);
    setPriority("medium");
    setEstimatedMinutes("");
    setDueAt(undefined);
    setDueTime("10:30");
  }

  function handleClose() {
    if (isPending) {
      return;
    }

    setIsOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await createTaskAction({
        title,
        description,
        goalId: goal?.id ?? "",
        priority,
        estimatedMinutes: estimatedMinutes.trim() === "" ? undefined : Number(estimatedMinutes),
        dueAt: combineDateAndTime(dueAt, dueTime),
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      resetForm();
      setIsOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)} type="button" size="icon" aria-label={t("trigger")} title={t("trigger")}>
        <Plus aria-hidden="true" />
      </Button>

      <TaskModalShell
        open={isOpen}
        onClose={handleClose}
        title={t("createTitle")}
        description={t("createDescription")}
      >
        <form onSubmit={handleSubmit} aria-busy={isPending} className="min-w-0 space-y-card">
          <fieldset disabled={isPending} className="min-w-0 space-y-card">
            <div className="space-y-2">
              <Label htmlFor={`${id}-title`}>{t("fields.title")}</Label>
              <Input
                id={`${id}-title`}
                maxLength={160}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("placeholders.title")}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${id}-description`}>{t("fields.description")}</Label>
              <Textarea
                id={`${id}-description`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                maxLength={1200}
                className="resize-none"
                placeholder={t("placeholders.description")}
              />
            </div>

            <div className="grid min-w-0 gap-card sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${id}-linkedGoal`}>{t("fields.linkedGoal")}</Label>
                <GoalPicker id={`${id}-linkedGoal`} value={goal} onChange={setGoal} disabled={isPending} />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${id}-priority`}>{t("fields.priority")}</Label>

                <Select
                  disabled={isPending}
                  value={priority ?? ""}
                  onValueChange={(value) =>
                    setPriority(value as "low" | "medium" | "high" | "critical")
                  }
                >
                  <SelectTrigger id={`${id}-priority`} className="w-full">
                    <SelectValue placeholder={t("fields.priority")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>{t("fields.priority")}</SelectLabel>
                      <SelectItem value="low">{t("priorities.low")}</SelectItem>
                      <SelectItem value="medium">{t("priorities.medium")}</SelectItem>
                      <SelectItem value="high">{t("priorities.high")}</SelectItem>
                      <SelectItem value="critical">{t("priorities.critical")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${id}-estimatedMinutes`}>{t("fields.estimatedMinutes")}</Label>
                <Input
                  id={`${id}-estimatedMinutes`}
                  type="number"
                  min={0}
                  step={1}
                  value={estimatedMinutes}
                  onChange={(event) => setEstimatedMinutes(event.target.value)}
                  placeholder="90"
                />
              </div>

              <div className="space-y-2">
                <TaskDatePicker
                  disabled={isPending}
                  dueAt={dueAt}
                  setDueAt={setDueAt}
                  dueTime={dueTime}
                  setDueTime={setDueTime}
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
                {commonT("cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                <Plus aria-hidden="true" />
                {isPending ? t("creating") : t("createSubmit")}
              </Button>
            </div>
          </fieldset>
        </form>
      </TaskModalShell>
    </>
  );
}
