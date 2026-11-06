// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleStudyReminderWebhook, parseStudyReminderEvent, reminderRecipientFingerprint, webhookBodyLimit } from "./resend-webhook";

// Ephemeral test-only keys. Not environment variables, live signing secrets or API keys.
const secretBytes = Buffer.alloc(32, 19);
const signingSecret = `whsec_${secretBytes.toString("base64")}`;
const identityKey = "test-only-recipient-hmac-key-32-bytes";
const payload = { type: "email.delivered", created_at: "2026-11-06T00:00:00Z",
  data: { email_id: "email-fixture", to: ["owner@example.invalid"], subject: "must not persist" } };
function request(value: unknown = payload, options: { timestamp?: number; signature?: string; id?: string; mutate?: boolean } = {}) {
  const body = JSON.stringify(value);
  const id = options.id ?? "msg_fixture";
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = options.signature ?? `v1,${createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
  return new Request("http://localhost/api/webhooks/resend/study-reminders", {
    method: "POST", body: options.mutate ? body + " " : body,
    headers: { "svix-id": id, "svix-timestamp": String(timestamp), "svix-signature": signature },
  });
}
afterEach(() => vi.unstubAllGlobals());
describe("8B signed webhook boundary (real SDK verifier, local HMAC signatures)", () => {
  it.each(["Permanent", "Transient", "Undetermined"])("8C retains typed bounce proof %s without raw bounce message", type => {
    const event = parseStudyReminderEvent({ ...payload, type: "email.bounced", data: { ...payload.data, bounce: { type, message: "private", subType: "General" } } }, "msg", identityKey);
    expect(event.bounceKind).toBe(type); expect(JSON.stringify(event)).not.toContain("private");
  });
  it("8C rejects malformed bounce classification instead of inventing hard bounce", () => {
    expect(() => parseStudyReminderEvent({ ...payload, type: "email.bounced", data: { ...payload.data, bounce: { type: "unknown" } } }, "msg", identityKey)).toThrow();
  });
  it("RW-01 rejects forged signature before any DB call", async () => {
    const persist = vi.fn();
    expect((await handleStudyReminderWebhook(request(payload, { signature: "v1,bad" }), { signingSecret, identityKey, persist })).status).toBe(401);
    expect(persist).not.toHaveBeenCalled();
  });
  it.each([{ timestamp: 1 }, { timestamp: Math.floor(Date.now() / 1000) + 600 }, { mutate: true }, { id: "bad header id" }])("rejects expired/future/tampered/invalid headers %j", async options => {
    const persist = vi.fn();
    expect((await handleStudyReminderWebhook(request(payload, options), { signingSecret, identityKey, persist })).status).toBe(401);
    expect(persist).not.toHaveBeenCalled();
  });
  it("RW-02/14 verifies raw body and persists safe projection with zero outbound requests", async () => {
    const fetch = vi.fn(() => { throw new Error("unexpected network"); }); vi.stubGlobal("fetch", fetch);
    const persist = vi.fn().mockResolvedValue(undefined);
    expect((await handleStudyReminderWebhook(request(), { signingSecret, identityKey, persist })).status).toBe(200);
    expect(persist.mock.calls[0][0]).toEqual({ eventId: "msg_fixture", messageId: "email-fixture", eventType: "email.delivered",
      eventAt: payload.created_at, recipientFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), payloadFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.stringify(persist.mock.calls)).not.toContain("owner@example.invalid");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("RW-03 duplicate persistence is acknowledged after each command completes", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    for (let i = 0; i < 2; i++) expect((await handleStudyReminderWebhook(request(), { signingSecret, identityKey, persist })).status).toBe(200);
    expect(persist.mock.calls[0]).toEqual(persist.mock.calls[1]);
  });
  it("RW-04 integrity conflict is not acknowledged", async () => {
    const persist = vi.fn().mockRejectedValue({ code: "22023", message: "private" });
    const response = await handleStudyReminderWebhook(request(), { signingSecret, identityKey, persist });
    expect(response.status).toBe(409); expect(await response.text()).not.toContain("private");
  });
  it("RW-13 DB failure is retryable and sanitized", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("private recipient DB failure"));
    const response = await handleStudyReminderWebhook(request(), { signingSecret, identityKey, persist });
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("recipient");
  });
  it("does not return success before persistence commit", async () => {
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    let completed = false;
    const response = handleStudyReminderWebhook(request(), { signingSecret, identityKey, persist: () => barrier }).then(result => { completed = true; return result; });
    await new Promise(resolve => setTimeout(resolve, 10)); expect(completed).toBe(false);
    release(); expect((await response).status).toBe(200);
  });
  it.each(["email.sent", "email.delivered", "email.delivery_delayed", "email.bounced", "email.complained", "email.failed", "email.suppressed"])("accepts supported %s only after verification", async type => {
    const persist = vi.fn().mockResolvedValue(undefined);
    expect((await handleStudyReminderWebhook(request({ ...payload, type }), { signingSecret, identityKey, persist })).status).toBe(200);
  });
  it.each([
    { ...payload, type: "email.opened" }, { ...payload, type: "email.clicked" },
    { ...payload, data: { ...payload.data, to: [] } },
    { ...payload, data: { ...payload.data, to: ["a@example.invalid", "b@example.invalid"] } },
    { ...payload, data: { ...payload.data, to: ["invalid"] } },
    { ...payload, created_at: "invalid" }, { ...payload, data: { ...payload.data, email_id: "" } },
  ])("rejects unsupported/malformed/per-recipient ambiguity %j", async value => {
    const persist = vi.fn();
    expect((await handleStudyReminderWebhook(request(value), { signingSecret, identityKey, persist })).status).toBe(400);
    expect(persist).not.toHaveBeenCalled();
  });
  it("bounds chunked bodies without trusting Content-Length", async () => {
    const persist = vi.fn();
    const oversized = new Request("http://localhost", { method: "POST", body: "x".repeat(webhookBodyLimit + 1) });
    expect((await handleStudyReminderWebhook(oversized, { signingSecret, identityKey, persist })).status).toBe(413);
    expect(persist).not.toHaveBeenCalled();
  });
  it("rejects advertised oversize before signature/DB", async () => {
    const req = request(); req.headers.set("content-length", String(webhookBodyLimit + 1));
    const persist = vi.fn();
    expect((await handleStudyReminderWebhook(req, { signingSecret, identityKey, persist })).status).toBe(413);
    expect(persist).not.toHaveBeenCalled();
  });
  it("fingerprints full verified content and canonicalizes property order", () => {
    const a = parseStudyReminderEvent(payload, "msg", identityKey);
    const b = parseStudyReminderEvent({ data: payload.data, created_at: payload.created_at, type: payload.type }, "msg", identityKey);
    expect(a.payloadFingerprint).toBe(b.payloadFingerprint);
    expect(parseStudyReminderEvent({ ...payload, data: { ...payload.data, subject: "changed" } }, "msg", identityKey).payloadFingerprint).not.toBe(a.payloadFingerprint);
  });
  it("recipient HMAC is deterministic, secret keyed and preserves local part", () => {
    expect(reminderRecipientFingerprint("Owner@EXAMPLE.invalid", identityKey)).toBe(reminderRecipientFingerprint("Owner@example.invalid", identityKey));
    expect(reminderRecipientFingerprint("Owner@example.invalid", identityKey)).not.toBe(reminderRecipientFingerprint("owner@example.invalid", identityKey));
    expect(reminderRecipientFingerprint("owner@example.invalid", identityKey)).not.toBe(reminderRecipientFingerprint("owner@example.invalid", identityKey + "rotated"));
  });
});
