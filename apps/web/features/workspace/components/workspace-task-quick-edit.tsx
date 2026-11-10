"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { transitionTaskStatusAction } from "@/features/tasks/task.actions";
import { canDirectlyTransitionTask, DIRECT_TASK_STATUS_TARGETS, isDirectTaskStatusTarget } from "@/features/tasks/task-transition";
import type { TaskSummary } from "../workspace-preview.queries";
import { updateWorkspaceTaskMetadata } from "../workspace-metadata.action";

const priorities = ["low", "medium", "high", "critical"] as const;

function localInputValue(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function WorkspaceTaskQuickEdit({
  task,
  deadlineLabel,
}: {
  task: Pick<TaskSummary, "id" | "title" | "status" | "effective_status" | "priority" | "due_at" | "updated_at">;
  deadlineLabel: string;
}) {
  const t = useTranslations("workspace.mvp");
  const common = useTranslations("common");
  const taskT = useTranslations("tasks.form");
  const router = useRouter();
  const deadlineId = useId();
  const deadlineButton = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<{ expectedStatus: TaskSummary["status"]; expectedUpdatedAt: string; dueAt: string | null } | null>(null);
  const [deadline, setDeadline] = useState("");
  const status = task.status === "overdue" ? "in_progress" : task.status;
  const targets = DIRECT_TASK_STATUS_TARGETS.filter((target) => target !== status && canDirectlyTransitionTask(task.effective_status, target));
  const expected = { taskId: task.id, expectedStatus: task.status, expectedUpdatedAt: task.updated_at };
  const selectClass = "min-h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-70";

  function closeDeadline() {
    setDraft(null);
    deadlineButton.current?.focus();
  }

  function save(action: () => Promise<{ success: boolean; message: string }>, close = false) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.success) {
          if (close) closeDeadline();
          toast.success(result.message);
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error(t("saveFailed"));
      } finally {
        router.refresh();
      }
    });
  }

  function saveDeadline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const date = deadline ? new Date(deadline) : null;
    if (date && !Number.isFinite(date.getTime())) {
      toast.error(t("saveFailed"));
      return;
    }
    if (deadline === localInputValue(draft.dueAt)) {
      closeDeadline();
      return;
    }
    save(() => updateWorkspaceTaskMetadata({
      taskId: task.id, expectedStatus: draft.expectedStatus, expectedUpdatedAt: draft.expectedUpdatedAt,
      change: { field: "deadline", value: date?.toISOString() ?? null },
    }), true);
  }

  return (
    <div className="min-w-0 space-y-2" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t("editStatus", { title: task.title })}
          className={selectClass}
          value={status}
          disabled={pending || !!draft || !targets.length}
          onChange={(event) => {
            const targetStatus = event.target.value;
            if (isDirectTaskStatusTarget(targetStatus)) save(() => transitionTaskStatusAction({ ...expected, targetStatus }));
          }}
        >
          <option value={status}>{taskT(`statuses.${status}`)}</option>
          {targets.map((target) => <option key={target} value={target}>{taskT(`statuses.${target}`)}</option>)}
        </select>
        <select
          aria-label={t("editPriority", { title: task.title })}
          className={selectClass}
          value={task.priority}
          disabled={pending || !!draft}
          onChange={(event) => {
            const value = priorities.find((priority) => priority === event.target.value);
            if (value) save(() => updateWorkspaceTaskMetadata({ ...expected, change: { field: "priority", value } }));
          }}
        >
          {priorities.map((priority) => <option key={priority} value={priority}>{taskT(`priorities.${priority}`)}</option>)}
        </select>
        <Button
          ref={deadlineButton}
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={!!draft}
          aria-label={t("editDeadline", { title: task.title })}
          aria-disabled={pending}
          onClick={() => {
            if (pending) return;
            if (draft) closeDeadline();
            else {
              setDeadline(localInputValue(task.due_at));
              setDraft({ expectedStatus: task.status, expectedUpdatedAt: task.updated_at, dueAt: task.due_at });
            }
          }}
        >
          {deadlineLabel}
        </Button>
      </div>
      {draft && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={saveDeadline} onKeyDown={(event) => {
          if (event.key === "Escape" && !pending) closeDeadline();
        }}>
          <label htmlFor={deadlineId} className="grid min-w-0 gap-1 text-sm">
            {t("deadlineValue")}
            <Input id={deadlineId} type="datetime-local" autoFocus value={deadline} onChange={(event) => setDeadline(event.target.value)} disabled={pending} />
          </label>
          <Button type="submit" size="sm" disabled={pending}>{common("save")}</Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={closeDeadline}>{common("cancel")}</Button>
        </form>
      )}
    </div>
  );
}
