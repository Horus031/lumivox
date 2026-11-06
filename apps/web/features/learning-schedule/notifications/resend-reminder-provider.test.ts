// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReminderEmail } from "./reminder-provider.types";
import { ResendReminderProvider } from "./resend-reminder-provider";
import { renderReminderEmail } from "./reminder-email-template";

const sender="Lumivox <reminders@lumivox.it.com>"; // Fixture policy, not a claim of mailbox approval.
const email: ReminderEmail={recipient:"verified-fixture@example.invalid",from:sender,subject:"Study reminder",html:"<p>Study reminder</p>",text:"Study reminder",
  idempotencyKey:"study-reminder:v1:7e000000-0000-4000-8000-000000000001:1"};
const id="49a3999c-0ce1-4ea6-ab68-afcd6dc2e794";
const error=(statusCode:number,name:string)=>({data:null,error:{statusCode,name,message:"PRIVATE provider detail for verified-fixture@example.invalid"},headers:null});
describe("8A injected Resend transport (no real sends)",()=>{
  const send=vi.fn(), network=vi.fn(()=>{throw new Error("Real network forbidden");});
  const provider=()=>new ResendReminderProvider({emails:{send}},sender);
  beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal("fetch",network);send.mockResolvedValue({data:{id},error:null,headers:null});});
  afterEach(()=>{expect(network).not.toHaveBeenCalled();vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
  it("RE-06 normalizes accepted ID and forwards exactly the SDK content/key contract",async()=>{
    send.mockResolvedValue({data:{id:`  ${id}  `},error:null,headers:null});
    expect(await provider().send(email)).toEqual({kind:"accepted",providerMessageId:id});
    expect(send).toHaveBeenCalledExactlyOnceWith({from:sender,to:[email.recipient],subject:email.subject,html:email.html,text:email.text},{idempotencyKey:email.idempotencyKey,signal:expect.any(AbortSignal)});
  });
  it("RE-05 forwards the same persisted logical key on explicit retry, with no internal retry/new key",async()=>{
    send.mockResolvedValueOnce(error(429,"rate_limit_exceeded")).mockResolvedValueOnce({data:{id},error:null});
    const adapter=provider(); expect(await adapter.send(email)).toEqual({kind:"rejected",code:"rate_limited",retryable:true}); expect(send).toHaveBeenCalledTimes(1);
    expect(await adapter.send(email)).toEqual({kind:"accepted",providerMessageId:id});
    expect(send.mock.calls.map(call=>call[1].idempotencyKey)).toEqual([email.idempotencyKey,email.idempotencyKey]);
  });
  it.each([[400,"validation_error"],[422,"missing_required_field"],[422,"invalid_parameter"]])("RE-07 rejects validation %i/%s without retry",async(status,name)=>{
    send.mockResolvedValue(error(status as number,name as string)); expect(await provider().send(email)).toEqual({kind:"rejected",code:"validation_rejected",retryable:false});expect(send).toHaveBeenCalledTimes(1);
  });
  it.each([401,403,404,405])("does not retry configuration rejection %i",async status=>{
    send.mockResolvedValue(error(status,"validation_error")); expect(await provider().send(email)).toEqual({kind:"rejected",code:"configuration_rejected",retryable:false});
  });
  it.each([500,502,503,504])("RE-08 HTTP %i is uncertain, not safely retryable",async status=>{
    send.mockResolvedValue(error(status,"application_error"));expect(await provider().send(email)).toEqual({kind:"uncertain",code:"provider_unavailable"});expect(send).toHaveBeenCalledTimes(1);
  });
  it("RE-08 thrown timeout after possible acceptance is uncertain, without leaking diagnostics",async()=>{
    send.mockRejectedValue(new Error("timeout with PRIVATE recipient verified-fixture@example.invalid"));
    expect(await provider().send(email)).toEqual({kind:"uncertain",code:"transport_error"});expect(send).toHaveBeenCalledTimes(1);
  });
  it("RE-08 SDK transport error with null status is uncertain, not a malformed rejection",async()=>{
    send.mockResolvedValue({data:null,error:{name:"application_error",statusCode:null,message:"PRIVATE network detail"},headers:null});
    expect(await provider().send(email)).toEqual({kind:"uncertain",code:"transport_error"});expect(send).toHaveBeenCalledTimes(1);
  });
  it("RE-08 passes a 10s deadline signal and treats a controlled abort as uncertain",async()=>{
    const controller=new AbortController();const timeout=vi.spyOn(AbortSignal,"timeout").mockReturnValueOnce(controller.signal);
    send.mockImplementation((_payload,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener("abort",()=>reject(options.signal.reason),{once:true})));
    const pending=provider().send(email);controller.abort(new DOMException("controlled timeout","TimeoutError"));
    expect(await pending).toEqual({kind:"uncertain",code:"transport_error"});expect(timeout).toHaveBeenCalledWith(10000);expect(send).toHaveBeenCalledTimes(1);
  });
  it("RE-09 payload/key mismatch is a nonretryable contract failure",async()=>{
    send.mockResolvedValue(error(409,"invalid_idempotent_request"));expect(await provider().send(email)).toEqual({kind:"rejected",code:"idempotency_payload_mismatch",retryable:false});
  });
  it("RE-09 concurrent same-key request requires reconciliation, not a new key/retry loop",async()=>{
    send.mockResolvedValue(error(409,"concurrent_idempotent_requests"));expect(await provider().send(email)).toEqual({kind:"uncertain",code:"idempotency_in_flight"});expect(send).toHaveBeenCalledTimes(1);
  });
  it.each([[409,"resource_locked"],[429,"unknown_rate_error"],[408,"timeout"]])("unknown %i/%s fails closed as uncertain",async(status,name)=>{
    send.mockResolvedValue(error(status as number,name as string));expect(await provider().send(email)).toEqual({kind:"uncertain",code:"provider_outcome_unknown"});
  });
  it.each(["daily_quota_exceeded","monthly_quota_exceeded"])("quota %s requires operator action, not short automatic backoff",async name=>{
    send.mockResolvedValue(error(429,name));expect(await provider().send(email)).toEqual({kind:"rejected",code:"quota_exceeded",retryable:false});
  });
  it.each([undefined,null,{}, {data:null,error:null},{data:{id:""},error:null},{data:{id:"bad\nID"},error:null}, {data:{id},error:{name:"validation_error",statusCode:422}}, {data:null,error:{name:"unknown"}}])("malformed/ambiguous provider response %j never claims acceptance",async response=>{
    send.mockResolvedValue(response);expect(await provider().send(email)).toEqual({kind:"uncertain",code:"invalid_provider_response"});
  });
  it.each([{recipient:"bad"},{recipient:[email.recipient]},{subject:"Subject\r\nBcc: private@example.invalid"},{idempotencyKey:""},{idempotencyKey:"x".repeat(257)},
    {headers:{"X-Private":"SECRET"}},{documentContent:"SECRET"},{attachments:[]},{privateNotes:"SECRET"}])("RE-10 rejects invalid/private input before client %j",async patch=>{
    expect(await provider().send({...email,...patch})).toEqual({kind:"rejected",code:"invalid_request",retryable:false});expect(send).not.toHaveBeenCalled();
  });
  it("rejects an unapproved sender and malformed configured sender without leaking it",async()=>{
    expect(await provider().send({...email,from:"Attacker <other@example.invalid>"})).toEqual({kind:"rejected",code:"sender_not_approved",retryable:false});
    expect(()=>new ResendReminderProvider({emails:{send}},"sender\r\nBcc: victim@example.invalid")).toThrow("Invalid configured reminder sender");expect(send).not.toHaveBeenCalled();
  });
  it("RE-10 renders EN/VI then transports only approved fields, never documents/recipient in result",async()=>{
    for(const locale of ["en","vi"] as const){
      const content=renderReminderEmail({taskId:"7e000000-0000-4000-8000-000000000001",taskTitle:"Owned task",locale,timezone:"UTC",leadMinutes:15,
        scheduledStartAt:"2026-11-07T12:00:00Z",scheduledEndAt:"2026-11-07T13:00:00Z"},{trustedOrigin:"https://app.lumivox.test",unsubscribeUrl:"https://app.lumivox.test/unsubscribe?token=fixture"});
      const result=await provider().send({...email,...content});expect(result).toEqual({kind:"accepted",providerMessageId:id});
      expect(JSON.stringify(result)).not.toContain(email.recipient); expect(send.mock.lastCall![0]).toEqual({from:sender,to:[email.recipient],...content});
    }
  });
  it("RE-11/12 importing/constructing is inert even with env activation/key present",async()=>{
    vi.stubEnv("RESEND_API_KEY","fixture-only-not-a-real-key");vi.stubEnv("STUDY_REMINDER_SETTINGS_ENABLED","true");
    vi.resetModules();const adapterModule=await import("./resend-reminder-provider");new adapterModule.ResendReminderProvider({emails:{send}},sender);
    expect(send).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();
  });
  it("does not allow construction at a browser boundary",()=>{
    vi.stubGlobal("window",{});expect(()=>provider()).toThrow("server-only");expect(send).not.toHaveBeenCalled();
  });
});
