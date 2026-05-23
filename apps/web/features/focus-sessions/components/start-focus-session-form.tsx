"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { Database } from "@/types/database.types";
import { createFocusSessionAction } from "@/features/focus-sessions/focus-session.actions";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type Task = Database["public"]["Tables"]["tasks"]["Row"];

type StartFocusSessionFormProps = {
  tasks: Task[];
};

export function StartFocusSessionForm({ tasks }: StartFocusSessionFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [taskId, setTaskId] = useState("");
  const [plannedMinutes, setPlannedMinutes] = useState("25");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
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
    });
  }

  return (
    <section className="rounded-2xl border bg-background p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-xs text-center uppercase font-semibold text-foreground">
          Start a focus session
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Linked task
          </label>

          <Select
            value={taskId ?? ""}
            onValueChange={(value) =>
              value === "no-task" ? setTaskId("") : setTaskId(value)
            }
            defaultValue="no-task"
          >
            <SelectTrigger className="flex w-full h-11! rounded-xl border border-input bg-transparent px-3 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring">
              <SelectValue placeholder="Choose your linked task" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Linked task</SelectLabel>
                <SelectItem value="no-task">No linked task</SelectItem>
                {tasks.map((tasks) => (
                  <SelectItem key={tasks.id} value={tasks.id}>
                    {tasks.title}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {/* <select
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
            className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
          >
            <option value="">No linked task</option>

            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select> */}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Planned duration
          </label>

          <div className="flex flex-wrap gap-2">
            {["25", "45", "60"].map((value) => (
              <Button
                variant="outline"
                key={value}
                type="button"
                onClick={() => setPlannedMinutes(value)}
                className={`border bg-transparent text-primary-foreground px-4 py-2 text-sm font-medium transition ${
                  plannedMinutes === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-foreground hover:text-primary-foreground"
                }`}
              >
                {value} min
              </Button>
            ))}
          </div>

          {/* <div className="mt-3">
            <input
              type="number"
              min={1}
              max={240}
              value={plannedMinutes}
              onChange={(event) => setPlannedMinutes(event.target.value)}
              className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
            />
          </div> */}
        </div>

        <Button
          type="submit"
          disabled={isPending}
          className="w-full px-4 py-2.5 mt-2 text-sm font-medium text-primary-foreground transition  disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Starting..." : "Start focus session"}
        </Button>
      </form>
    </section>
  );
}
