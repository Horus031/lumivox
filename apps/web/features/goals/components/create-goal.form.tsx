"use client";

import { FormEvent, ReactNode, useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { Goal } from "@/features/goals/goal.types";
import {
  createGoalAction,
  updateGoalAction,
} from "@/features/goals/goal.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateValue } from "@/lib/utils/date";
import { GoalDatePicker } from "./goal-date-picker";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Save } from "lucide-react";
import { Label } from "@/components/ui/label";


type CreateGoalFormProps = {
  mode?: "create" | "edit";
  goal?: Goal;
  trigger?: ReactNode;
};

function parseDateValue(dateString: string | null): Date | undefined {
  if (!dateString) {
    return undefined;
  }

  const [year, month, day] = dateString.split("T")[0].split("-").map(Number);

  if (!year || !month || !day) {
    return undefined;
  }

  return new Date(year, month - 1, day);
}

export function CreateGoalForm({
  mode = "create",
  goal,
  trigger,
}: CreateGoalFormProps) {
  const t = useTranslations("goals.form");
  const commonT = useTranslations("common");
  const router = useRouter();
  const id = useId();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const isEditMode = mode === "edit";

  const initialState = useMemo(
    () => ({
      title: goal?.title ?? "",
      description: goal?.description ?? "",
      goalType: (goal?.goal_type ?? "short_term") as "short_term" | "long_term",
      status: (goal?.status ?? "active") as
        | "active"
        | "completed"
        | "paused"
        | "archived",
      progressPercent: Number(goal?.progress_percent ?? 0),
      startDate: parseDateValue(goal?.start_date ?? null),
      targetDate: parseDateValue(goal?.target_date ?? null),
    }),
    [goal],
  );

  const [title, setTitle] = useState(initialState.title);
  const [description, setDescription] = useState(initialState.description);
  const [goalType, setGoalType] = useState<"short_term" | "long_term">(
    initialState.goalType,
  );
  const [status, setStatus] = useState<
    "active" | "completed" | "paused" | "archived"
  >(initialState.status);
  // const [progressPercent, setProgressPercent] = useState(
  //   initialState.progressPercent,
  // );
  const [startDate, setStartDate] = useState<Date | undefined>(
    initialState.startDate,
  );
  const [targetDate, setTargetDate] = useState<Date | undefined>(
    initialState.targetDate,
  );

  function resetForm() {
    setTitle(initialState.title);
    setDescription(initialState.description);
    setGoalType(initialState.goalType);
    setStatus(initialState.status);
    // setProgressPercent(initialState.progressPercent);
    setStartDate(initialState.startDate);
    setTargetDate(initialState.targetDate);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (nextOpen) {
      resetForm();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = isEditMode
        ? await updateGoalAction({
            goalId: goal!.id,
            title,
            description,
            goalType,
            status,
            startDate: formatDateValue(startDate),
            targetDate: formatDateValue(targetDate),
          })
        : await createGoalAction({
            title,
            description,
            goalType,
            startDate: formatDateValue(startDate),
            targetDate: formatDateValue(targetDate),
          });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      resetForm();
      setOpen(false);
      router.refresh();
    });
  }

  if (isEditMode && !goal) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? <Button type="button"><Plus aria-hidden="true" />{t("trigger")}</Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-card sm:max-w-xl [&>[data-slot=dialog-close]]:top-1 [&>[data-slot=dialog-close]]:right-1 [&>[data-slot=dialog-close]]:grid [&>[data-slot=dialog-close]]:size-touch [&>[data-slot=dialog-close]]:place-items-center sm:[&>[data-slot=dialog-close]]:size-control">
        <form onSubmit={handleSubmit} aria-busy={isPending} className="min-w-0 space-y-card">
          <DialogTitle className="pr-10 text-section">{isEditMode ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>{isEditMode ? t("editDescription") : t("createDescription")}</DialogDescription>
          <fieldset disabled={isPending} className="min-w-0 space-y-card">
            <div className="space-y-2">
              <Label htmlFor={`${id}-title`}>{t("fields.title")}</Label>
              <Input id={`${id}-title`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("placeholders.title")} required maxLength={160} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-description`}>{t("fields.description")}</Label>
              <Textarea id={`${id}-description`} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("placeholders.description")} rows={3} maxLength={1000} />
            </div>
            <div className="grid min-w-0 gap-card sm:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor={`${id}-type`}>{t("fields.goalType")}</Label>
                <Select value={goalType} disabled={isPending} onValueChange={(value) => setGoalType(value as "short_term" | "long_term")}>
                  <SelectTrigger id={`${id}-type`} className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short_term">{t("goalTypes.short_term")}</SelectItem>
                    <SelectItem value="long_term">{t("goalTypes.long_term")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isEditMode ? (
                <div className="min-w-0 space-y-2">
                  <Label htmlFor={`${id}-status`}>{t("fields.status")}</Label>
                  <Select value={status} disabled={isPending} onValueChange={(value) => setStatus(value as typeof status)}>
                    <SelectTrigger id={`${id}-status`} className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["active", "completed", "paused", "archived"] as const).map((value) => <SelectItem key={value} value={value}>{t(`statuses.${value}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <GoalDatePicker type="start" startDate={startDate} setStartDate={setStartDate} disabled={isPending} />
              <GoalDatePicker type="target" targetDate={targetDate} setTargetDate={setTargetDate} disabled={isPending} />
            </div>
          </fieldset>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" disabled={isPending}>{commonT("cancel")}</Button></DialogClose>
            <Button type="submit" disabled={isPending}>
              {isEditMode ? <Save aria-hidden="true" /> : <Plus aria-hidden="true" />}
              {isPending ? isEditMode ? t("saving") : t("creating") : isEditMode ? t("saveChanges") : t("createSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
