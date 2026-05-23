import { TaskWithGoal } from "@/features/tasks/task.types";

export function getStatusTone(status: TaskWithGoal["status"]) {
  if (status === "completed")
    return "bg-emerald-500/10 text-emerald-700 border-emerald-500/15";
  if (status === "overdue")
    return "bg-rose-500/10 text-rose-700 border-rose-500/15";
  if (status === "in_progress")
    return "bg-sky-500/10 text-sky-700 border-sky-500/15";
  if (status === "cancelled")
    return "bg-neutral-500/10 text-neutral-500 border-neutral-500/15";
  return "bg-amber-500/10 text-amber-700 border-amber-500/15 ring-amber-500/15";
}

export function getPriorityTone(priority: TaskWithGoal["priority"]) {
  if (priority === "critical")
    return "bg-rose-500/10 text-rose-700 border-rose-500/15";
  if (priority === "high")
    return "bg-orange-500/10 text-orange-700 border-orange-500/15 ring-orange-500/15";
  if (priority === "medium")
    return "bg-sky-500/10 text-sky-700 border-sky-500/15";
  return "bg-neutral-500/10 text-neutral-500 border-neutral-500/15";
}