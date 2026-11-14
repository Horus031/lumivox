import { handleUnsubscribePost, unsubscribeGet } from "@/features/learning-schedule/notifications/unsubscribe-service";
import { consumeUnsubscribeHash } from "@/features/learning-schedule/notifications/unsubscribe-persistence";
export const runtime = "nodejs";
export const GET = unsubscribeGet;
export async function POST(request: Request) {
  return handleUnsubscribePost(request, consumeUnsubscribeHash);
}
