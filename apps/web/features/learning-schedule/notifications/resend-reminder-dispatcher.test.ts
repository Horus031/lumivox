// @vitest-environment node
import { randomBytes } from "node:crypto";
import { describe,expect,it,vi } from "vitest";
import { dispatchResendReminders,type ResendDispatchStore,type ResendDispatchConfig } from "./resend-reminder-dispatcher";
import { configuredReminderRecipients,resolveReminderContext } from "./resolve-reminder-context";
import { decryptReminderPayload,reminderEncryptionKey,type PayloadSnapshot } from "./resend-payload";
import { handleResendDispatch } from "./resend-dispatch-endpoint";
import { ResendReminderProvider } from "./resend-reminder-provider";

const uuid="8d000000-0000-4000-8000-000000000001",lease="8d000000-0000-4000-8000-000000000002";
const context={userId:uuid,jobId:uuid,sessionId:uuid,taskId:uuid,taskTitle:"Ôn tập",recipient:"Owner@example.invalid",verified:true,locale:"vi",localeConfirmed:true,
 scheduledStartAt:"2030-01-07T10:00:00Z",scheduledEndAt:"2030-01-07T11:00:00Z",timezone:"UTC",leadMinutes:15,idempotencyKey:"persisted-key",lifecycleFingerprint:"policy",eligible:true,suppressed:false,contextHash:"c".repeat(64)};
function fixture() {
 const config:ResendDispatchConfig={enabled:true,allowlist:configuredReminderRecipients(context.recipient),identityKey:randomBytes(32).toString("hex"),encryptionKey:randomBytes(32),from:"Lumivox <study@example.invalid>",trustedOrigin:"https://app.lumivox.test"};
 let snapshot:PayloadSnapshot|null=null;
 const store={gate:vi.fn().mockResolvedValue(true),preview:vi.fn().mockResolvedValue([uuid]),claim:vi.fn().mockResolvedValue([{jobId:uuid,leaseToken:lease}]),resolve:vi.fn().mockResolvedValue(context),load:vi.fn(async()=>snapshot),
  prepare:vi.fn(async(_claim,c,input)=>snapshot??=({job_id:uuid,user_id:uuid,context_hash:c.contextHash,payload_fingerprint:input.fingerprint,recipient_fingerprint:c.recipientFingerprint,locale:c.locale,token_hash:input.tokenHash,encrypted_payload:input.envelope,created_at:new Date().toISOString()} as PayloadSnapshot)),
  authorize:vi.fn().mockResolvedValue({authorized:true,deliveryId:uuid}),record:vi.fn().mockResolvedValue(undefined),reconcile:vi.fn().mockResolvedValue(undefined)} satisfies ResendDispatchStore;
 const transport={send:vi.fn().mockResolvedValue({kind:"accepted",providerMessageId:"resend-fixture"})};
 return {config,store,transport,getSnapshot:()=>snapshot};
}
describe("8D trusted context / immutable worker",()=>{
 it.each(["", "*@gmail.com", "example.com", "a@example.invalid,", "user@example.invalid,*@example.invalid"])("rejects invalid/wildcard allowlist %s",raw=>expect(()=>configuredReminderRecipients(raw)).toThrow());
 it("identity matching preserves local part case and normalizes domain",()=>{
  const f=fixture();const list=configuredReminderRecipients(" Owner@EXAMPLE.invalid ");
  expect(resolveReminderContext(context,list,f.config.identityKey).success).toBe(true);
  expect(resolveReminderContext({...context,recipient:"owner@example.invalid"},list,f.config.identityKey)).toEqual({success:false,reason:"not_allowlisted"});
 });
 it.each([{enabled:false},{gate:false}])("RI-01/02 OFF means no claims/preparation/provider %j",async state=>{
  const f=fixture();if(state.enabled===false) f.config.enabled=false;if(state.gate===false) f.store.gate.mockResolvedValue(false);
  await dispatchResendReminders(f.store,f.transport,f.config);
  expect(f.store.claim).not.toHaveBeenCalled();expect(f.store.prepare).not.toHaveBeenCalled();expect(f.transport.send).not.toHaveBeenCalled();
 });
 it.each([
  {recipient:"other@example.invalid"},{verified:false},{suppressed:true},{locale:null},{localeConfirmed:false},{eligible:false},
 ])("RI-03/04/05 rejects untrusted/incomplete context before handoff %j",async patch=>{
  const f=fixture();f.store.resolve.mockResolvedValue({...context,...patch});await dispatchResendReminders(f.store,f.transport,f.config);
  expect(f.store.authorize).not.toHaveBeenCalled();expect(f.transport.send).not.toHaveBeenCalled();
 });
 it.each(["en","vi"])("RI-06/07 snapshots %s and issuer-owned one-click links",async locale=>{
  const f=fixture();f.store.resolve.mockResolvedValue({...context,locale});const result=await dispatchResendReminders(f.store,f.transport,f.config);
  expect(result.accepted).toBe(1);expect(f.getSnapshot()?.locale).toBe(locale);
  const sent=f.transport.send.mock.calls[0][0];expect(sent.html).toContain(`/${locale}/study-reminders/unsubscribe?token=`);
  expect(sent.unsubscribeUrl).toContain("/api/study-reminders/unsubscribe?token=");
  expect(sent.idempotencyKey).toBe(context.idempotencyKey);expect(f.store.record.mock.calls[0][2]).toBe(f.getSnapshot()?.payload_fingerprint);
  expect(f.getSnapshot()?.encrypted_payload).not.toContain("Owner@example.invalid");
 });
 it("RI-08 preparation retry reuses ciphertext, capability and fingerprint",async()=>{
  const f=fixture();f.store.authorize.mockResolvedValueOnce({authorized:false});
  await dispatchResendReminders(f.store,f.transport,f.config);const before=f.getSnapshot();
  await dispatchResendReminders(f.store,f.transport,f.config);
  expect(f.getSnapshot()).toEqual(before);expect(f.store.prepare).toHaveBeenCalledTimes(1);expect(f.transport.send).toHaveBeenCalledTimes(1);
 });
 it("RI-09 waits for handoff commit before provider",async()=>{
  const f=fixture();let release!:(value:{authorized:boolean;deliveryId:string})=>void;
  f.store.authorize.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const pending=dispatchResendReminders(f.store,f.transport,f.config);await vi.waitFor(()=>expect(f.store.authorize).toHaveBeenCalled());
  expect(f.transport.send).not.toHaveBeenCalled();release({authorized:true,deliveryId:uuid});await pending;
  expect(f.store.record).toHaveBeenCalledWith(expect.anything(),uuid,expect.any(String),{kind:"accepted",providerMessageId:"resend-fixture"});
 });
 it("RI-10 thrown timeout is uncertain; failed persistence never resubmits",async()=>{
  const f=fixture();f.transport.send.mockRejectedValue(new Error("private timeout"));f.store.record.mockRejectedValue(new Error("DB"));
  const result=await dispatchResendReminders(f.store,f.transport,f.config);
  expect(result.held).toBe(1);expect(f.transport.send).toHaveBeenCalledTimes(1);
  expect(f.store.record.mock.calls[0][3]).toEqual({kind:"uncertain",code:"transport_error"});
 });
 it("RI-11 SDK 409 holds the same key without retry",async()=>{
  const f=fixture();const send=vi.fn().mockResolvedValue({data:null,error:{name:"concurrent_idempotent_requests",statusCode:409}});
  await dispatchResendReminders(f.store,new ResendReminderProvider({emails:{send}},f.config.from),f.config);
  expect(send).toHaveBeenCalledTimes(1);expect(send.mock.calls[0][1].idempotencyKey).toBe("persisted-key");
  expect(f.store.record.mock.calls[0][3].kind).toBe("uncertain");
 });
 it("RI-12 opt-out at final authorization prevents submission",async()=>{
  const f=fixture();f.store.authorize.mockResolvedValue({authorized:false});await dispatchResendReminders(f.store,f.transport,f.config);expect(f.transport.send).not.toHaveBeenCalled();
 });
 it("RI-13 post-handoff opt-out does not discard accepted outcome",async()=>{
  const f=fixture();f.transport.send.mockImplementation(async()=>{f.store.resolve.mockResolvedValue({...context,eligible:false});return {kind:"accepted",providerMessageId:"committed-before-optout"};});
  expect((await dispatchResendReminders(f.store,f.transport,f.config)).accepted).toBe(1);expect(f.store.record).toHaveBeenCalledTimes(1);
 });
 it("RI-14 shared authorization winner is the only submitter",async()=>{
  const f=fixture();let won=false;f.store.authorize.mockImplementation(async()=>{if(won)return {authorized:false};won=true;return {authorized:true,deliveryId:uuid};});
  await Promise.all([dispatchResendReminders(f.store,f.transport,f.config),dispatchResendReminders(f.store,f.transport,f.config)]);expect(f.transport.send).toHaveBeenCalledTimes(1);
 });
 it("dry-run reads only, even with sending/DB gates off",async()=>{
  const f=fixture();f.config.enabled=false;const result=await dispatchResendReminders(f.store,f.transport,f.config,{dryRun:true});
  expect(result.eligible).toBe(1);for(const fn of [f.store.claim,f.store.prepare,f.store.authorize,f.store.reconcile,f.transport.send])expect(fn).not.toHaveBeenCalled();
 });
 it("AES-GCM rejects wrong key/job, ciphertext and hash tampering",async()=>{
  const f=fixture();await dispatchResendReminders(f.store,f.transport,f.config);const s=f.getSnapshot()!;
  expect(()=>decryptReminderPayload(s,randomBytes(32))).toThrow();
  expect(()=>decryptReminderPayload({...s,job_id:lease},f.config.encryptionKey)).toThrow();
  expect(()=>decryptReminderPayload({...s,payload_fingerprint:"0".repeat(64)},f.config.encryptionKey)).toThrow();
  expect(()=>decryptReminderPayload({...s,encrypted_payload:s.encrypted_payload+"x"},f.config.encryptionKey)).toThrow();
  expect(()=>reminderEncryptionKey("invalid")).toThrow();
 });
 it("adapter forwards exactly the two trusted unsubscribe headers",async()=>{
  const f=fixture();const send=vi.fn().mockResolvedValue({data:{id:"header-fixture"},error:null});
  await dispatchResendReminders(f.store,new ResendReminderProvider({emails:{send}},f.config.from),f.config);
  expect(send.mock.calls[0][0].headers).toEqual({"List-Unsubscribe":expect.stringMatching(/^<https:\/\/app.lumivox.test\/api\/study-reminders\/unsubscribe\?token=[A-Za-z0-9_-]{43}>$/),"List-Unsubscribe-Post":"List-Unsubscribe=One-Click"});
 });
 it("no arbitrary headers or unsafe unsubscribe URL reaches SDK",async()=>{
  const send=vi.fn();const provider=new ResendReminderProvider({emails:{send}},"test@example.invalid");
  const email={recipient:"owner@example.invalid",from:"test@example.invalid",subject:"test",html:"x",text:"x",idempotencyKey:"key"};
  for(const patch of [{headers:{"X-Private":"bad"}},{unsubscribeUrl:"http://example.invalid"},{unsubscribeUrl:"https://app.test/api/study-reminders/unsubscribe?token=bad\r\nX-Header:yes"},{unsubscribeUrl:`https://app.test/api/study-reminders/unsubscribe?token=${"a".repeat(43)}\r\n`}]) expect((await provider.send({...email,...patch})).kind).toBe("rejected");
  expect(send).not.toHaveBeenCalled();
 });
});
describe("8D authenticated dispatcher boundary",()=>{
 function setup(){const f=fixture();const secret=randomBytes(32).toString("hex");const env={STUDY_REMINDER_DISPATCH_SECRET:secret,STUDY_REMINDER_REAL_SEND_ENABLED:"true",STUDY_REMINDER_TEST_RECIPIENTS:context.recipient,STUDY_REMINDER_RECIPIENT_HMAC_KEY:f.config.identityKey,STUDY_REMINDER_PAYLOAD_ENCRYPTION_KEY:f.config.encryptionKey.toString("base64"),STUDY_REMINDER_FROM:f.config.from,STUDY_REMINDER_TRUSTED_ORIGIN:f.config.trustedOrigin,RESEND_STUDY_REMINDER_API_KEY:"test-only-injected-transport"};return {...f,env,ports:{store:vi.fn(()=>f.store),transport:vi.fn(()=>f.transport),log:vi.fn()}};}
 const request=(secret:string,body:unknown={dryRun:false})=>new Request("http://localhost/api/internal/study-reminders/dispatch",{method:"POST",headers:{Authorization:`Bearer ${secret}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
 it("RI-15 missing/wrong auth returns 401 before DB/SDK",async()=>{
  const f=setup();expect((await handleResendDispatch(request("wrong"),f.env,f.ports)).status).toBe(401);expect(f.ports.store).not.toHaveBeenCalled();expect(f.ports.transport).not.toHaveBeenCalled();
 });
 it("RI-01 feature OFF refuses real send before DB",async()=>{
  const f=setup();f.env.STUDY_REMINDER_REAL_SEND_ENABLED="false";expect((await handleResendDispatch(request(f.env.STUDY_REMINDER_DISPATCH_SECRET),f.env,f.ports)).status).toBe(503);expect(f.ports.store).not.toHaveBeenCalled();
 });
 it.each([{recipient:"attacker@example.invalid"},{dryRun:false,batchSize:6},{dryRun:false,p_allowlisted:true}])("rejects caller-selected payload/oversized batch %j",async raw=>{
  const f=setup();expect((await handleResendDispatch(request(f.env.STUDY_REMINDER_DISPATCH_SECRET,raw),f.env,f.ports)).status).toBe(400);expect(f.ports.store).not.toHaveBeenCalled();
 });
 it("missing allowlist fails closed",async()=>{
  const f=setup();f.env.STUDY_REMINDER_TEST_RECIPIENTS="";expect((await handleResendDispatch(request(f.env.STUDY_REMINDER_DISPATCH_SECRET),f.env,f.ports)).status).toBe(503);expect(f.ports.transport).not.toHaveBeenCalled();
  const debug=setup();expect((await handleResendDispatch(request(debug.env.STUDY_REMINDER_DISPATCH_SECRET),{...debug.env,RESEND_DEBUG:"true"},debug.ports)).status).toBe(503);expect(debug.ports.transport).not.toHaveBeenCalled();
 });
 it("returns/logs counts only; constructs injected transport after handoff",async()=>{
  const f=setup();const response=await handleResendDispatch(request(f.env.STUDY_REMINDER_DISPATCH_SECRET),f.env,f.ports);expect(response.status).toBe(200);
  const output=JSON.stringify({body:await response.json(),logs:f.ports.log.mock.calls});expect(output).not.toContain(context.recipient);expect(output).not.toContain(context.jobId);expect(f.ports.transport).toHaveBeenCalledTimes(1);
 });
 it("dry-run never constructs transport and may use flag OFF",async()=>{
  const f=setup();f.env.STUDY_REMINDER_REAL_SEND_ENABLED="false";const response=await handleResendDispatch(request(f.env.STUDY_REMINDER_DISPATCH_SECRET,{dryRun:true}),f.env,f.ports);expect(response.status).toBe(200);expect(f.ports.transport).not.toHaveBeenCalled();
 });
});

describe("11C.5A uncertain provider outcomes", () => {
  const claim = { jobId: uuid, leaseToken: lease };

  function authorizedFixture() {
    const f = fixture();
    // Model the committed delivery returned by the store. Database durability
    // and lease recovery are covered separately from this dispatcher test.
    const handoff = { status: "unclaimed", deliveryId: uuid };
    f.store.authorize.mockImplementation(async () => {
      if (handoff.status !== "unclaimed") return { authorized: false };
      handoff.status = "submitting";
      return { authorized: true, deliveryId: handoff.deliveryId };
    });
    const send = vi.fn();
    const adapter = new ResendReminderProvider({ emails: { send } }, f.config.from);
    return { ...f, handoff, send, adapter };
  }

  it.each([
    { name: "T01 timeout", fault: () => Promise.reject(new DOMException("SDK timed out", "TimeoutError")), code: "transport_error" },
    { name: "T02 connection reset", fault: () => Promise.reject(Object.assign(new Error("Connection reset"), { code: "ECONNRESET" })), code: "transport_error" },
    { name: "T03 HTTP 503", fault: async () => ({ data: null, error: { name: "application_error", statusCode: 503 } }), code: "provider_unavailable" },
    { name: "T04 missing message ID", fault: async () => ({ data: {}, error: null }), code: "invalid_provider_response" },
  ])("$name records uncertainty once against the committed handoff", async ({ fault, code }) => {
    const f = authorizedFixture();
    f.send.mockImplementation(fault);
    f.store.record.mockImplementation(async () => {
      expect(f.handoff.status).toBe("submitting");
      f.handoff.status = "uncertain";
    });

    const result = await dispatchResendReminders(f.store, f.adapter, f.config);
    expect(result).toMatchObject({ accepted: 0, rejected: 0, uncertain: 1, held: 0 });
    expect(f.store.authorize).toHaveBeenCalledBefore(f.send);
    expect(f.store.record).toHaveBeenCalledExactlyOnceWith(
      claim, uuid, f.getSnapshot()?.payload_fingerprint, { kind: "uncertain", code },
    );
    expect(f.handoff.status).toBe("uncertain");
    expect((await dispatchResendReminders(f.store, f.adapter, f.config)).held).toBe(1);
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.store.record).toHaveBeenCalledTimes(1);
  });

  it("T05 keeps the committed handoff when recording an accepted outcome fails", async () => {
    const f = authorizedFixture();
    f.send.mockResolvedValue({ data: { id: "resend-fixture" }, error: null });
    f.store.record.mockRejectedValue(new Error("Injected database write failure"));

    const result = await dispatchResendReminders(f.store, f.adapter, f.config);
    expect(result).toMatchObject({ accepted: 0, rejected: 0, uncertain: 0, held: 1 });
    expect(f.store.authorize).toHaveBeenCalledBefore(f.send);
    const snapshot = f.getSnapshot();
    expect(snapshot).not.toBeNull();
    expect(f.store.record).toHaveBeenCalledExactlyOnceWith(
      claim, uuid, snapshot?.payload_fingerprint, { kind: "accepted", providerMessageId: "resend-fixture" },
    );
    expect((await dispatchResendReminders(f.store, f.adapter, f.config)).held).toBe(1);
    expect(f.handoff).toEqual({ status: "submitting", deliveryId: uuid });
    expect(f.getSnapshot()).toBe(snapshot);
    expect(f.store.prepare).toHaveBeenCalledTimes(1);
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.store.record).toHaveBeenCalledTimes(1);
  });
});
