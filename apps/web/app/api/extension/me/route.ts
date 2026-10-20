import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store",
  "Pragma": "no-cache",
};

function json(
  payload: unknown,
  status: number,
) {
  return NextResponse.json(payload, {
    status,
    headers: HEADERS,
  });
}

function extractBearer(
  header: string | null,
): string | null {
  if (!header) return null;

  const match = /^Bearer ([^\s]+)$/.exec(header);

  if (!match) return null;

  const token = match[1];

  if (token.length > 4096) return null;

  return token;
}

export async function GET(request: Request) {
  const token = extractBearer(
    request.headers.get("authorization"),
  );

  if (!token) {
    return json({ error: "Unauthorized" }, 401);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return json(
      { error: "Authentication unavailable" },
      503,
    );
  }

  try {
    const supabase = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data, error } =
      await supabase.auth.getUser(token);

    if (error || !data.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    return json(
      {
        user: {
          id: data.user.id,
          email: data.user.email ?? "",
        },
      },
      200,
    );
  } catch {
    return json(
      { error: "Authentication unavailable" },
      503,
    );
  }
}