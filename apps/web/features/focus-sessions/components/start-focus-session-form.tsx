"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Play } from "lucide-react";
import { toast } from "sonner";

import { createFocusSessionAction } from "@/features/focus-sessions/focus-session.actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FocusTaskOption = { id: string; title: string };
type StartFocusSessionFormProps = { tasks: FocusTaskOption[] };

export function StartFocusSessionForm({ tasks }: StartFocusSessionFormProps) {
  const router = useRouter();
  const t = useTranslations("focus.startForm");
  const [isPending, startTransition] = useTransition();
  const [taskId, setTaskId] = useState("");
  const [plannedMinutes, setPlannedMinutes] = useState("25");
  const id = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const result = await createFocusSessionAction({
          taskId,
          plannedMinutes: Number(plannedMinutes),
        });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        router.refresh();
      } catch {
        toast.error(t("failed"));
      }
    });
  }

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-card">
      <h2 className="mb-4 text-section font-semibold">{t("title")}</h2>
      <form onSubmit={handleSubmit} aria-busy={isPending} className="space-y-card">
        <div>
          <Label htmlFor={`${id}-task`}>{t("linkedTask")}</Label>
          <Select value={taskId || "no-task"} disabled={isPending}
            onValueChange={(value) => setTaskId(value === "no-task" ? "" : value)}>
            <SelectTrigger id={`${id}-task`} className="w-full sm:h-touch lg:h-control">
              <SelectValue placeholder={t("chooseTask")} />
            </SelectTrigger>
            <SelectContent className="w-[var(--radix-select-trigger-width)]">
              <SelectItem value="no-task">{t("noLinkedTask")}</SelectItem>
              {tasks.map((task) => (
                <SelectItem key={task.id} value={task.id} className="whitespace-normal">
                  <span className="min-w-0 [overflow-wrap:anywhere]">{task.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor={`${id}-minutes`}>{t("plannedDuration")}</Label>
          <p id={`${id}-duration-hint`} className="mb-3 text-caption text-muted-foreground">
            {t("plannedDurationSub")}
          </p>
          <div role="group" aria-label={t("plannedDuration")} className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
            {["25", "45", "60"].map((value) => (
              <Button key={value} type="button" variant="ghost" size="sm"
                disabled={isPending} aria-pressed={plannedMinutes === value}
                onClick={() => setPlannedMinutes(value)}
                className={plannedMinutes === value ? "bg-background text-foreground shadow-sm hover:bg-background" : undefined}>
                {t("minutes", { value: Number(value) })}
              </Button>
            ))}
          </div>
          <Input id={`${id}-minutes`} type="number" min={1} max={240} step={1} required
            aria-describedby={`${id}-duration-hint`} placeholder={t("plannedMinutesPlaceholder")}
            value={plannedMinutes} disabled={isPending}
            onChange={(event) => setPlannedMinutes(event.target.value)}
            className="mt-3 sm:h-touch lg:h-control" />
        </div>
        <Button type="submit" disabled={isPending} className="sm:min-h-touch lg:min-h-control">
          <Play aria-hidden="true" />
          {isPending ? t("starting") : t("start")}
        </Button>
      </form>
    </section>
  );
}
