import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { handleUnsubscribePost, unsubscribeGet } from "@/features/learning-schedule/notifications/unsubscribe-service";
export const runtime = "nodejs";
export const GET = unsubscribeGet;
export async function POST(request: Request) {
  return handleUnsubscribePost(request, async hash => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Not configured");
    const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("ls_notification_consume_unsubscribe_token", { p_token_hash: hash }).abortSignal(AbortSignal.timeout(4000));
    if (error) throw new Error("Persistence unavailable");
    return data === true;
  });
}
