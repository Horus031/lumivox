import { authenticateReminderDispatcher } from "@/features/learning-schedule/notifications/resend-dispatch-endpoint";
import { consumeUnsubscribeHash } from "@/features/learning-schedule/notifications/unsubscribe-persistence";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const reply = (status: number, unavailable = false) => new Response(null, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(unavailable ? { "x-lumivox-unsubscribe-result": "unavailable" } : {}),
    },
  });
  if (!authenticateReminderDispatcher(request.headers.get("authorization"), process.env.UNSUBSCRIBE_BRIDGE_SECRET)) {
    return reply(401);
  }
  const hash = request.headers.get("x-lumivox-unsubscribe-hash");
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return reply(400);
  try {
    return await consumeUnsubscribeHash(hash) ? reply(204) : reply(404, true);
  } catch {
    return reply(503);
  }
}
