"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createGoalAction } from "@/features/goals/goal.actions";
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

export function CreateGoalForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // const [startDateOpen, setStartDateOpen] = useState(false);
  // const [endDateOpen, setEndDateOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalType, setGoalType] = useState<"short_term" | "long_term">(
    "short_term",
  );
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [targetDate, setTargetDate] = useState<Date | undefined>(undefined);

  function resetForm() {
    setTitle("");
    setDescription("");
    setGoalType("short_term");
    setStartDate(undefined);
    setTargetDate(undefined);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await createGoalAction({
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
      router.refresh();
    });
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button">Create Goals</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogTitle>Create a new goal</DialogTitle>
          <DialogDescription>
            Define a short-term or long-term learning objective.
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
                rows={3}
              />
            </Field>

            <FieldGroup className="w-full flex-row">
              <Field>
                <div className="gap-3">
                  <Label className="mb-2">Goal type</Label>

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
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={isPending}
              className="px-4 py-2.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Creating..." : "Create goal"}
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
