"use server";

import { requireUser } from "@/lib/auth/require-user";

export async function searchWorkspaceGoals(search: string) {
  if (typeof search !== "string") throw new Error("Invalid goal search.");
  const { supabase, user } = await requireUser();
  const query = search.trim().slice(0, 120).replace(/[\\%_]/g, "\\$&");
  const goals = supabase.from("goals").select("id,title")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(8);

  const { data, error } = await (query ? goals.ilike("title", `%${query}%`) : goals.eq("status", "active"));
  if (error) throw new Error("Failed to search Workspace goals.");
  return data;
}
