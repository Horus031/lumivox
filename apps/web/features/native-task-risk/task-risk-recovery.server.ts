import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export function recoveryWriter() {
  if (typeof window !== "undefined") throw new Error("Recovery writer is server-only");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Recovery tracking unavailable");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
