"use client";

import { FormEvent, ReactNode, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { Goal } from "@/features/goals/goal.types";
import { createGoalAction, updateGoalAction } from "@/features/goals/goal.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Field, FieldGroup } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

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
  const router = useRouter();
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
  const [progressPercent, setProgressPercent] = useState(
    initialState.progressPercent,
  );
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
    setProgressPercent(initialState.progressPercent);
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
            progressPercent,
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
        {trigger ?? <Button type="button">Create Goals</Button>}
      </DialogTrigger>
      <DialogContent className="text-foreground max-w-2xl!">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogTitle>
            {isEditMode ? "Update goal" : "Create a new goal"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Adjust progress, timeline, and status for this goal."
              : "Define a short-term or long-term learning objective."}
          </DialogDescription>
          <FieldGroup>
            <Field>
              <Label htmlFor="title">Goal title</Label> 
              <Input
                id="title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Complete AWS Cloud Practitioner revision"
                required
              />
            </Field>
            <Field>
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What does success look like for this goal?"
                className="resize-none"
                rows={3}
              />
            </Field>

            <FieldGroup className="w-full flex-row">
              <Field className="h-full">
                <div className="flex flex-col justify-between h-full">
                  <Label className="mb-4">Goal type</Label>

                  <Select
                    value={goalType ?? ""}
                    onValueChange={(value) =>
                      setGoalType(value as "short_term" | "long_term")
                    }
                  >
                    <SelectTrigger className="flex w-full h-11! border border-input bg-transparent px-3 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring">
                      <SelectValue placeholder="Goal type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Goal type</SelectLabel>
                        <SelectItem value="short_term">Short term</SelectItem>
                        <SelectItem value="long_term">Long term</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </Field>

              {isEditMode && (
                <Field>
                  <div className="gap-3">
                    <Label className="mb-2">Status</Label>

                    <Select
                      value={status}
                      onValueChange={(value) =>
                        setStatus(
                          value as
                            | "active"
                            | "completed"
                            | "paused"
                            | "archived",
                        )
                      }
                    >
                      <SelectTrigger className="flex w-full h-11! border border-input bg-transparent px-3 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Statuses</SelectLabel>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="paused">Paused</SelectItem>
                          <SelectItem value="archived">Archived</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </Field>
              )}

              <Field>
                <div>
                  <GoalDatePicker
                    type="start"
                    startDate={startDate}
                    setStartDate={setStartDate}
                  />
                </div>
              </Field>

              <Field>
                <div>
                  <GoalDatePicker
                    type="target"
                    targetDate={targetDate}
                    setTargetDate={setTargetDate}
                  />
                </div>
              </Field>
            </FieldGroup>

            {isEditMode && (
              <Field>
                <Label className="mb-2 block">Progress: {progressPercent}%</Label>
                <Slider
                  value={[progressPercent]}
                  onValueChange={(value) =>
                    setProgressPercent(Number(value[0] ?? 0))
                  }
                  min={0}
                  max={100}
                  step={1}
                  className="mx-auto w-full"
                />
              </Field>
            )}
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="hover:bg-foreground/10">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={isPending}
              className="px-4 py-2.5 text-sm font-medium text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending
                ? isEditMode
                  ? "Saving..."
                  : "Creating..."
                : isEditMode
                  ? "Save changes"
                  : "Create goal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    // <section className="rounded-2xl border bg-white p-6 shadow-sm">
    //   <div className="mb-5">
    //     <h2 className="text-xl font-semibold">Create a new goal</h2>
    //     <p className="mt-1 text-sm text-neutral-600">
    //       Define a short-term or long-term learning objective.
    //     </p>
    //   </div>

    //   <form onSubmit={handleSubmit} className="space-y-4">
    //     <div>
    //       <label className="mb-1.5 block text-sm font-medium">Goal title</label>
    //       <Input
    //         type="text"
    //         value={title}
    //         onChange={(event) => setTitle(event.target.value)}
    //         placeholder="Complete AWS Cloud Practitioner revision"
    //         required
    //       />
    //     </div>

    //     <div>
    //       <label className="mb-1.5 block text-sm font-medium">
    //         Description
    //       </label>
    //       <Textarea
    //         value={description}
    //         onChange={(event) => setDescription(event.target.value)}
    //         placeholder="What does success look like for this goal?"
    //         rows={3}
    //       />
    //     </div>

    //     <div className="grid gap-4 md:grid-cols-3">
    //       <div>
    //         <label className="mb-1.5 block text-sm font-medium">
    //           Goal type
    //         </label>

    //         <Select
    //           value={goalType ?? ""}
    //           onValueChange={(value) =>
    //             setGoalType(value as "short_term" | "long_term")
    //           }
    //         >
    //           <SelectTrigger className="flex w-full h-11! rounded-xl border border-input bg-transparent px-3 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring">
    //             <SelectValue placeholder="Goal type" />
    //           </SelectTrigger>
    //           <SelectContent>
    //             <SelectGroup>
    //               <SelectLabel>Goal type</SelectLabel>
    //               <SelectItem value="short_term">Short term</SelectItem>
    //               <SelectItem value="long_term">Long term</SelectItem>
    //             </SelectGroup>
    //           </SelectContent>
    //         </Select>
    //       </div>

    //       <div>
    //         {/* <label className="mb-1.5 block text-sm font-medium">
    //           Start date
    //         </label> */}
    //         <GoalDatePicker
    //           type="start"
    //           startDate={startDate}
    //           setStartDate={setStartDate}
    //         />
    //       </div>

    //       <div>
    //         <GoalDatePicker
    //           type="target"
    //           targetDate={targetDate}
    //           setTargetDate={setTargetDate}
    //         />
    //       </div>
    //     </div>

    //     <Button
    //       type="submit"
    //       disabled={isPending}
    //       className="rounded-xl px-4 py-2.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60"
    //     >
    //       {isPending ? "Creating..." : "Create goal"}
    //     </Button>
    //   </form>
    // </section>
  );
}
