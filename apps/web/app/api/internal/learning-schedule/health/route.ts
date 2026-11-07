import { createClient } from "@supabase/supabase-js";
import { handleOperationalHealth } from "@/features/learning-schedule/operations/operational-health";
import type { Database } from "@/types/database.types";

export const runtime = "nodejs";
export const maxDuration = 5;

export async function GET(request: Request) {
  const response = await handleOperationalHealth(request, process.env, async signal => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing snapshot configuration");
    const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.rpc("ls_learning_schedule_operational_snapshot", {}, { get: true }).abortSignal(signal);
    if (error) throw error;
    return data;
  });
  if (response.status === 503) console.warn("learning_schedule_health", JSON.stringify({ outcome: "snapshot_unavailable" }));
  return response;
}
