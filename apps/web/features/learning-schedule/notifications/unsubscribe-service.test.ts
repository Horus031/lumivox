// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateUnsubscribeToken } from "./unsubscribe-token";
import { handleUnsubscribePost, unsubscribeGet } from "./unsubscribe-service";
const {token,hash}=generateUnsubscribeToken();
function post(body="List-Unsubscribe=One-Click",query=`token=${token}`,contentType="application/x-www-form-urlencoded") {
  return new Request(`https://app.lumivox.test/api/study-reminders/unsubscribe?${query}`,{method:"POST",body,headers:{"Content-Type":contentType}});
}
afterEach(()=>vi.unstubAllGlobals());
describe("8C public unsubscribe protocol",()=>{
  it("US-01 GET performs no persistence or identity lookup",()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    expect(unsubscribeGet().status).toBe(200);expect(fetch).not.toHaveBeenCalled();
  });
  it("US-02/06 no cookies/login/redirect; hashes token before trusted command",async()=>{
    const consume=vi.fn().mockResolvedValue(true);
    const response=await handleUnsubscribePost(post(),consume);
    expect(response.status).toBe(200);expect(consume).toHaveBeenCalledWith(hash);
    expect(response.headers.get("Location")).toBeNull();expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
  it("US-03 replay has identical generic response",async()=>{
    const consume=vi.fn().mockResolvedValue(true);
    const a=await handleUnsubscribePost(post(),consume),b=await handleUnsubscribePost(post(),consume);
    expect(await a.text()).toBe(await b.text());
  });
  it.each([false])("US-04/05 expired/revoked/forged hash has same generic rejection",async value=>{
    const response=await handleUnsubscribePost(post(),async()=>value);
    expect(response.status).toBe(400);expect(await response.text()).toBe("Invalid or unavailable link.");
  });
  it.each(["", "List-Unsubscribe=No", "List-Unsubscribe=One-Click&userId=spoofed", "List-Unsubscribe=One-Click&List-Unsubscribe=One-Click"])("invalid form %s never mutates",async body=>{
    const consume=vi.fn();expect((await handleUnsubscribePost(post(body),consume)).status).toBe(400);expect(consume).not.toHaveBeenCalled();
  });
  it.each(["", "token=forged",`token=${token}&token=${token}`])("invalid token query rejected %s",async query=>{
    const consume=vi.fn();expect((await handleUnsubscribePost(post(undefined,query),consume)).status).toBe(400);expect(consume).not.toHaveBeenCalled();
  });
  it("requires form content type",async()=>{
    const consume=vi.fn();expect((await handleUnsubscribePost(post(undefined,undefined,"application/json"),consume)).status).toBe(415);expect(consume).not.toHaveBeenCalled();
  });
  it("bounds actual body bytes",async()=>{
    const consume=vi.fn();expect((await handleUnsubscribePost(post("x".repeat(513)),consume)).status).toBe(413);expect(consume).not.toHaveBeenCalled();
  });
  it("DB failures are retryable and never disclose diagnostic/account data",async()=>{
    const response=await handleUnsubscribePost(post(),async()=>{throw new Error("secret-user@example.invalid");});
    expect(response.status).toBe(503);expect(await response.text()).toBe("Please try again later.");
  });
  it("does not acknowledge before transactional opt-out commits",async()=>{
    let release!:(value:boolean)=>void;let done=false;
    const response=handleUnsubscribePost(post(),()=>new Promise<boolean>(resolve=>{release=resolve;})).then(x=>{done=true;return x;});
    await new Promise(resolve=>setTimeout(resolve,10));expect(done).toBe(false);release(true);expect((await response).status).toBe(200);
  });
  it("EN/VI confirmation copy does not contain token or identity",async()=>{
    const response=await handleUnsubscribePost(post("List-Unsubscribe=One-Click&locale=vi"),async()=>true);
    const text=await response.text();expect(text).toContain("Đã ngừng nhận");expect(text).not.toContain(token);expect(text).not.toContain("@");
  });
});
