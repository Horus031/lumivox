import {
  handleUnsubscribePost,
  unsubscribeGet,
} from "../web/features/learning-schedule/notifications/unsubscribe-service";

export const unsubscribePath = "/api/study-reminders/unsubscribe";

type Ports = {
  isRateLimited(request: Request): Promise<boolean>;
  consume(hash: string): Promise<boolean>;
};

export async function handleIngress(request: Request, ports: Ports) {
  const reply = (body: string, status: number, extra?: Record<string, string>) =>
    new Response(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
        ...extra,
      },
    });

  if (new URL(request.url).pathname !== unsubscribePath) return reply("Not found.", 404);
  if (request.method === "GET") return unsubscribeGet();
  if (request.method !== "POST") return reply("Method not allowed.", 405, { Allow: "GET, POST" });

  try {
    if (await ports.isRateLimited(request)) return reply("Too many requests.", 429);
  } catch {
    return reply("Please try again later.", 503);
  }
  return handleUnsubscribePost(request, ports.consume);
}
