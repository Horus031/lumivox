import { describe, expect, it } from "vitest";
import { renderReminderEmail, type TrustedReminderTemplateContext } from "./reminder-email-template";

const context: TrustedReminderTemplateContext = { taskId: "7e000000-0000-4000-8000-000000000001", taskTitle: "Review React Hooks",
  locale: "en", scheduledStartAt: "2026-11-07T12:00:00Z", scheduledEndAt: "2026-11-07T13:00:00Z", timezone: "Asia/Ho_Chi_Minh", leadMinutes: 15 };
const config = { trustedOrigin: "https://app.lumivox.test", unsubscribeUrl: "https://app.lumivox.test/reminder-unsubscribe?token=fixture-only&scope=study" };
describe("8A reminder email templates", () => {
  it("RE-01 renders English subject, HTML and meaningful plain text", () => {
    const result = renderReminderEmail(context,config);
    expect(result.subject).toBe("Your study session starts soon");
    for (const body of [result.html,result.text]) {
      expect(body).toContain("Review React Hooks"); expect(body).toContain("November 7, 2026"); expect(body).toContain("19:00–20:00 · Asia/Ho_Chi_Minh");
      expect(body).toContain("15 minutes"); expect(body).toContain(`/en/workspace?task=${context.taskId}`); expect(body).toContain("/en/settings");
    }
    expect(result.text).not.toContain("<html"); expect(result.html).toContain('lang="en" dir="ltr"');
    expect(result.html).toContain("token=fixture-only&amp;scope=study");
  });
  it("RE-02 renders Vietnamese, the Session timezone and trusted locale links", () => {
    const result = renderReminderEmail({...context,locale:"vi",taskTitle:"Ôn tập React Hooks"},config);
    expect(result.subject).toBe("Buổi học của bạn sắp bắt đầu");
    for (const body of [result.html,result.text]) { expect(body).toContain("7 tháng 11, 2026"); expect(body).toContain("19:00–20:00"); expect(body).toContain("15 phút"); expect(body).toContain("/vi/settings"); }
    expect(result.html).toContain('lang="vi" dir="ltr"');
  });
  it("RE-03 escapes every HTML-sensitive title character without changing plain text", () => {
    const title = `<img src=x onerror="evil()"> & ' <script>alert(1)</script>`;
    const result = renderReminderEmail({...context,taskTitle:title},config);
    expect(result.html).not.toContain("<img"); expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;img src=x onerror=&quot;evil()&quot;&gt; &amp; &#39;");
    expect(result.text).toContain(title);
  });
  it.each([
    {trustedOrigin:"http://app.lumivox.test"}, {trustedOrigin:"https://app.lumivox.test/path"},
    {trustedOrigin:"https://user:pass@app.lumivox.test"}, {trustedOrigin:"https://app.lumivox.test?host=evil"},
    {unsubscribeUrl:"https://app.lumivox.test.evil/unsubscribe"}, {unsubscribeUrl:"javascript:alert(1)"},
    {unsubscribeUrl:"//evil.test/unsubscribe"}, {unsubscribeUrl:"http://app.lumivox.test/unsubscribe"},
    {unsubscribeUrl:"https://user:pass@app.lumivox.test/unsubscribe"}, {unsubscribeUrl:"https://app.lumivox.test/unsubscribe#token"},
  ])("RE-04 rejects unsafe origin/link configuration %j", patch => {
    expect(()=>renderReminderEmail(context,{...config,...patch})).toThrow("Invalid trusted reminder links");
  });
  it("RE-04/10 cannot inject arbitrary task/Host-header links or private documents", () => {
    for (const extra of [{ taskUrl:"https://evil.test" }, { host:"evil.test" }, { documentContent:"PRIVATE_DOCUMENT" }, { privateNotes:"PRIVATE_NOTES" }, { prompt:"PRIVATE_PROMPT" }, { recipient:"private@example.invalid" }]) {
      expect(()=>renderReminderEmail({...context,...extra},config)).toThrow("Invalid reminder template context");
    }
    const result=renderReminderEmail(context,config); expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|recipient|attachments|tracking/);
  });
  it.each([{locale:"fr"},{timezone:"Not/AZone"},{timezone:"+07:00"},{timezone:"CST"},{leadMinutes:10},
    {scheduledStartAt:"2026-11-07T19:00:00"},{scheduledEndAt:"2026-11-07T11:00:00Z"},{taskTitle:"Header\r\nBcc: private@example.invalid"}])("rejects an unconfirmed/invalid context %j", patch => {
    expect(()=>renderReminderEmail({...context,...patch},config)).toThrow(/Invalid reminder/);
  });
  it("uses the Session zone's calendar date, not the UTC date/device zone", () => {
    const result=renderReminderEmail({...context,scheduledStartAt:"2026-11-07T18:00:00Z",scheduledEndAt:"2026-11-07T19:00:00Z"},config);
    expect(result.text).toContain("November 8, 2026"); expect(result.text).toContain("01:00–02:00");
  });
  it.each([
    ["2030-11-03T05:00:00Z","2030-11-03T05:30:00Z","01:00–01:30"],
    ["2030-11-03T06:00:00Z","2030-11-03T06:30:00Z","01:00–01:30"],
    ["2030-03-10T06:30:00Z","2030-03-10T07:30:00Z","01:30–03:30"],
  ])("formats DST instants %s in the Session zone", (scheduledStartAt,scheduledEndAt,expected) => {
    expect(renderReminderEmail({...context,scheduledStartAt,scheduledEndAt,timezone:"America/New_York"},config).text).toContain(expected);
  });
  it("rejects a cross-local-day interval rather than showing a misleading date", () => {
    expect(()=>renderReminderEmail({...context,scheduledStartAt:"2026-11-07T16:30:00Z",scheduledEndAt:"2026-11-07T17:30:00Z"},config)).toThrow("one local day");
  });
  it("is deterministic and provides accessible HTML plus settings/unsubscribe contract", () => {
    const first=renderReminderEmail(context,config); expect(renderReminderEmail(context,config)).toEqual(first);
    const doc=new DOMParser().parseFromString(first.html,"text/html");
    expect(doc.documentElement.lang).toBe("en"); expect(doc.body.firstElementChild?.getAttribute("lang")).toBe("en");
    expect(doc.body.firstElementChild?.getAttribute("dir")).toBe("ltr"); expect(doc.querySelectorAll("h1")).toHaveLength(1);
    expect(doc.querySelectorAll('table:not([role="presentation"])')).toHaveLength(0);
    expect([...doc.querySelectorAll("a")].every(a=>!!a.textContent?.trim())).toBe(true);
    expect(doc.querySelectorAll("a")).toHaveLength(3); expect(first.text).toContain("Unsubscribe from study reminders");
    expect(doc.querySelectorAll("img,script,iframe")).toHaveLength(0);
  });
});
