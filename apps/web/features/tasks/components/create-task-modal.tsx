"use client";

import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Goal } from "@/features/goals/goal.types";
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

type CreateTaskModalProps = {
  goals: Goal[];
};

export function CreateTaskModal({ goals }: CreateTaskModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalId, setGoalId] = useState("");
  const [priority, setPriority] = useState<
    "low" | "medium" | "high" | "critical"
  >("medium");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [dueAt, setDueAt] = useState<Date | undefined>(undefined);
  const [dueTime, setDueTime] = useState("10:30");

  function combineDateAndTime(date: Date | undefined, time: string) {
    if (!date) {
      return "";
    }

    const [hours = 0, minutes = 0, seconds = 0] = time
      .split(":")
      .map((value) => Number(value));

    const nextDate = new Date(date);
    nextDate.setHours(hours, minutes, seconds, 0);

    return nextDate.toISOString();
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setGoalId("");
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
        goalId,
        priority,
        estimatedMinutes:
          estimatedMinutes.trim() === "" ? undefined : Number(estimatedMinutes),
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
      <Button
        onClick={() => setIsOpen(true)}
        className="gap-2 px-4"
      >
        <Plus className="h-4 w-4" />
        New task
      </Button>

      <TaskModalShell
        open={isOpen}
        onClose={handleClose}
        title="Create a new task"
        description="Capture a work item, attach a goal if needed, and keep the list focused."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Task title
            </label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Finish the literature review draft"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Description
            </label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              placeholder="Optional notes or execution details"
            ></Textarea>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Linked goal
              </label>
              <Select
                value={goalId ?? ""}
                onValueChange={(value) =>
                  value === "no-goal" ? setGoalId("") : setGoalId(value)
                }
                defaultValue="no-goal"
              >
                <SelectTrigger className="flex w-full h-11! rounded-xl border border-input bg-transparent px-3 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring">
                  <SelectValue placeholder="Linked goal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Linked goal</SelectLabel>
                    <SelectItem value="no-goal">No goal</SelectItem>
                    {goals.map((goal) => (
                      <SelectItem key={goal.id} value={goal.id}>
                        {goal.title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Priority
              </label>

              <Select
                value={priority ?? ""}
                onValueChange={(value) =>
                  setPriority(value as "low" | "medium" | "high" | "critical")
                }
              >
                <SelectTrigger className="flex w-full h-11! rounded-xl border border-input bg-transparent px-3 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring">
                  <SelectValue placeholder="Linked goal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Priorities</SelectLabel>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Estimated minutes
              </label>
              <Input
                type="number"
                min={0}
                value={estimatedMinutes}
                onChange={(event) => setEstimatedMinutes(event.target.value)}
                placeholder="90"
              />
            </div>

            <div className="space-y-2">
                <TaskDatePicker
                  dueAt={dueAt}
                  setDueAt={setDueAt}
                  dueTime={dueTime}
                  setDueTime={setDueTime}
                />

              {/* <Input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              /> */}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              type="submit"
              disabled={isPending}
              className="rounded-full px-5"
            >
              {isPending ? "Creating..." : "Create task"}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isPending}
              className="rounded-full px-5 bg-transparent hover:bg-black/10"
            >
              Cancel
            </Button>
          </div>
        </form>
      </TaskModalShell>
    </>
  );
}
