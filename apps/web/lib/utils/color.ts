import { TaskWithGoal } from "@/features/tasks/task.types";

export function getStatusTone(status: TaskWithGoal["status"]) {
  if (status === "completed")
    return "bg-success/10 text-foreground border-success/30";
  if (status === "overdue")
    return "bg-danger/10 text-foreground border-danger/30";
  if (status === "in_progress")
    return "bg-info/10 text-foreground border-info/30";
  if (status === "in_review")
    return "bg-info/10 text-foreground border-info/30";
  if (status === "cancelled")
    return "bg-muted text-muted-foreground border-border";
  return "bg-warning/10 text-foreground border-warning/30";
}

export function getPriorityTone(priority: TaskWithGoal["priority"]) {
  if (priority === "critical")
    return "bg-danger/10 text-foreground border-danger/30";
  if (priority === "high")
    return "bg-warning/10 text-foreground border-warning/30";
  if (priority === "medium")
    return "bg-info/10 text-foreground border-info/30";
  return "bg-muted text-muted-foreground border-border";
}
