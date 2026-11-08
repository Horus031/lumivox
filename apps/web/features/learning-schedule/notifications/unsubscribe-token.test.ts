// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { generateUnsubscribeToken, hashUnsubscribeToken, issueStudyReminderUnsubscribe, renderIssuedReminderEmail } from "./unsubscribe-token";
const identity={userId:"8c000000-0000-4000-8000-000000000001",expectedEmail:"test@example.invalid",recipientFingerprint:"a".repeat(64),locale:"vi" as const};
describe("8C opaque unsubscribe issuer",()=>{
  it("generates canonical 256-bit random tokens; stores SHA-256 only",()=>{
    const generated=Array.from({length:64},generateUnsubscribeToken);
    expect(new Set(generated.map(x=>x.token)).size).toBe(64);
    for(const {token,hash} of generated) {
      expect(Buffer.from(token,"base64url")).toHaveLength(32);
      expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
      expect(hash).not.toContain(token);
    }
  });
  it.each([null,undefined,{},"", "a".repeat(42),"a".repeat(44),"A".repeat(42)+"B","https://example.test", " "+"a".repeat(43)])("rejects noncanonical/invalid input %j",value=>{
    expect(hashUnsubscribeToken(value)).toBeNull();
  });
  it("returns trusted localized links only after hash persistence",async()=>{
    const persist=vi.fn().mockResolvedValue(undefined);
    const result=await issueStudyReminderUnsubscribe(identity,"https://app.lumivox.test",persist);
    const token=new URL(result.oneClickUrl).searchParams.get("token")!;
    expect(result.unsubscribeUrl).toContain("/vi/study-reminders/unsubscribe?");
    expect(result.oneClickUrl).toContain("/api/study-reminders/unsubscribe?");
    expect(persist.mock.calls[0][0]).toEqual({userId:identity.userId,expectedEmail:identity.expectedEmail,recipientFingerprint:identity.recipientFingerprint,tokenHash:hashUnsubscribeToken(token),replace:false});
    expect(JSON.stringify(persist.mock.calls)).not.toContain(token);
  });
  it.each(["http://app.test","https://user:pass@app.test","https://app.test/path","https://app.test?token=caller","https://app.test/#fragment"])("rejects untrusted origin %s before issuing",async origin=>{
    const persist=vi.fn();await expect(issueStudyReminderUnsubscribe(identity,origin,persist)).rejects.toThrow();expect(persist).not.toHaveBeenCalled();
  });
  it("failed persistence never returns a live-looking link",async()=>{
    await expect(issueStudyReminderUnsubscribe(identity,"https://app.lumivox.test",async()=>{throw new Error("DB unavailable");})).rejects.toThrow();
  });
  it("replacement is an explicit trusted issuer command",async()=>{
    const persist=vi.fn().mockResolvedValue(undefined);
    await issueStudyReminderUnsubscribe(identity,"https://app.lumivox.test",persist,true);
    expect(persist.mock.calls[0][0].replace).toBe(true);
  });
  it("production composition renders issuer-owned token links",async()=>{
    const persist=vi.fn().mockResolvedValue(undefined);
    const result=await renderIssuedReminderEmail({taskId:identity.userId,taskTitle:"Ôn tập",locale:"vi",scheduledStartAt:"2030-01-07T10:00:00Z",scheduledEndAt:"2030-01-07T11:00:00Z",timezone:"UTC",leadMinutes:15},identity,"https://app.lumivox.test",persist);
    expect(result.html).toContain("/vi/study-reminders/unsubscribe?token=");
    expect(result.text).toContain("/vi/study-reminders/unsubscribe?token=");
    expect(result.oneClickUrl).toContain("/api/study-reminders/unsubscribe?token=");
  });
});
