"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTaskAction } from "@/features/tasks/task.actions";

export function WorkspaceQuickCreateTask({
  goalId,
}: {
  goalId: string | null;
}) {
  const t = useTranslations("workspace.board");
  const commonT = useTranslations("common");
  const router = useRouter();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || isPending) return;
    startTransition(async () => {
      try {
        const result = await createTaskAction({
          title,
          description: "",
          goalId: goalId ?? "",
          priority: "medium",
          estimatedMinutes: undefined,
          dueAt: "",
        });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        setTitle("");
        setOpen(false);
        router.refresh();
      } catch {
        toast.error(t("createFailed"));
      }
    });
  }

  return (
    <div className="mb-3">
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
          <div className="flex gap-2">
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
              onClick={() => {
                setOpen(false);
                setTitle("");
              }}
            >
              {commonT("cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start gap-2"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4" />
          {t("addTask")}
        </Button>
      )}
    </div>
  );
}
