// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
import { POST } from "../../../app/api/webhooks/resend/study-reminders/route";
const key = Buffer.alloc(32, 23);
function request(signed = true) {
  const body = JSON.stringify({
    type: "email.sent",
    created_at: "2026-11-06T00:00:00Z",
    data: { email_id: "route-fixture", to: ["route@example.invalid"] },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new Request("http://localhost/api/webhooks/resend/study-reminders", {
    method: "POST",
    body,
    headers: {
      "svix-id": "msg_route",
      "svix-timestamp": timestamp,
      "svix-signature": signed
        ? `v1,${createHmac("sha256", key).update(`msg_route.${timestamp}.${body}`).digest("base64")}`
        : "v1,invalid",
    },
  });
}
beforeEach(() => {
  vi.stubEnv("RESEND_STUDY_REMINDER_WEBHOOK_SECRET", `whsec_${key.toString("base64")}`);
  vi.stubEnv("STUDY_REMINDER_RECIPIENT_HMAC_KEY", "test-only-identity-key-not-a-real-secret");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-only-no-live-database-access");
  mocks.createClient.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockReturnValue({ abortSignal: vi.fn().mockResolvedValue({ error: null }) });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("route fails closed without dedicated signing configuration", async () => {
  vi.stubEnv("RESEND_STUDY_REMINDER_WEBHOOK_SECRET", "");
  expect((await POST(request())).status).toBe(503);
  expect(mocks.createClient).not.toHaveBeenCalled();
});
it("invalid signatures never construct privileged DB client", async () => {
  expect((await POST(request(false))).status).toBe(401);
  expect(mocks.createClient).not.toHaveBeenCalled();
});
it("signed POST invokes only trusted ingestion with safe arguments", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "ls_notification_ingest_resend",
    expect.objectContaining({
      p_event_id: "msg_route",
      p_message_id: "route-fixture",
      p_event_type: "email.sent",
    }),
  );
  expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("route@example.invalid");
});
it("route propagates failed DB commit as retryable 503", async () => {
  mocks.rpc.mockReturnValue({
    abortSignal: vi.fn().mockResolvedValue({ error: { code: "08006", message: "sensitive" } }),
  });
  expect((await POST(request())).status).toBe(503);
});
