import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import type { Database } from "@/types/database.types";
import { handleResendDispatch } from "@/features/learning-schedule/notifications/resend-dispatch-endpoint";
import { createResendDispatchStore } from "@/features/learning-schedule/notifications/resend-dispatch-store";
import { ResendReminderProvider } from "@/features/learning-schedule/notifications/resend-reminder-provider";
export const runtime = "nodejs";
export const maxDuration = 45;
export async function POST(request: Request) {
  return handleResendDispatch(request, process.env, {
    store: () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error("Missing persistence configuration");
      return createResendDispatchStore(
        createClient<Database>(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        }),
      );
    },
    transport: (key, from) =>
      new ResendReminderProvider(new Resend(key, { baseUrl: "https://api.resend.com" }), from),
    log: (entry) => console.info("study_reminder_dispatch", JSON.stringify(entry)),
  });
}
