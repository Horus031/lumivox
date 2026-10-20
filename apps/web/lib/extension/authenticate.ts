import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export function extractExtensionBearer(
  authorization: string | null,
): string | null {
  if (!authorization) return null;

  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match || match[1].length > 4096) return null;

  return match[1];
}

export async function authenticateExtension(request: Request) {
  const token = extractExtensionBearer(request.headers.get("authorization"));

  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase configuration unavailable");
  }

  // Separate, request-scoped client. Never use a service-role key.
  const supabase = createClient<Database>(url, key, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) return null;

  return {
    userId: data.user.id,
    supabase,
  };
}
