import { requireUser } from "@/lib/auth/require-user";

export async function getAvailableFocusTasks() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title")
    .in("status", ["todo", "in_progress", "overdue"])
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to fetch available focus tasks: ${error.message}`);
  }

  return data ?? [];
}
