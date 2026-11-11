"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTaskAction } from "@/features/tasks/task.actions";
import type { Task } from "@/features/tasks/task.types";

const priorities = ["low", "medium", "high", "critical"] as const;

export function WorkspaceQuickCreateTask({
  goalId,
  withOptions = false,
  compact = false,
}: {
  goalId: string | null;
  withOptions?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("workspace.board");
  const commonT = useTranslations("common");
  const mvp = useTranslations("workspace.mvp");
  const taskT = useTranslations("tasks.form");
  const router = useRouter();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [deadline, setDeadline] = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setOpen(false);
    setTitle("");
    setPriority("medium");
    setDeadline("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || isPending) return;
    startTransition(async () => {
      try {
        const result = await createTaskAction({
          title,
          description: "",
          goalId: goalId ?? "",
          priority,
          estimatedMinutes: undefined,
          dueAt: deadline ? new Date(deadline).toISOString() : "",
        });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        reset();
        router.refresh();
      } catch {
        toast.error(t("createFailed"));
      }
    });
  }

  return (
    <div className={compact ? "min-w-0" : "mb-3"}>
      {open ? (
        <form onSubmit={submit} className="space-y-2">
          <label htmlFor={inputId} className="sr-only">
            {t("taskTitle")}
          </label>
          <Input
            id={inputId}
            autoFocus
            required
            maxLength={160}
            value={title}
            disabled={isPending}
            placeholder={t("taskTitle")}
            onChange={(event) => setTitle(event.target.value)}
          />
          {withOptions && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">{mvp("optionalFields")}</summary>
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="grid min-w-0 gap-1">
                  {mvp("deadlineValue")}
                  <Input type="datetime-local" value={deadline} disabled={isPending} onChange={(event) => setDeadline(event.target.value)} />
                </label>
                <label className="grid gap-1">
                  {taskT("fields.priority")}
                  <select value={priority} disabled={isPending} className="h-9 rounded-md border bg-background px-2" onChange={(event) => {
                    const value = priorities.find((option) => option === event.target.value);
                    if (value) setPriority(value);
                  }}>
                    {priorities.map((option) => <option key={option} value={option}>{taskT(`priorities.${option}`)}</option>)}
                  </select>
                </label>
              </div>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={isPending || !title.trim()}
            >
              {t("addTask")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={reset}
            >
              {commonT("cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size={compact ? "sm" : "default"}
          className="w-full justify-start gap-2 text-secondary-text"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4" />
          {t("addTask")}
        </Button>
      )}
    </div>
  );
}
