import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import { submitLoginForm } from "./helpers/auth";
import { generateStudyOccurrences } from "../features/learning-schedule/schedule-engine";

const url = process.env.LEARNING_SCHEDULE_TEST_URL, key = process.env.LEARNING_SCHEDULE_TEST_ANON_KEY, service = process.env.LEARNING_SCHEDULE_TEST_SERVICE_KEY;
test.skip(!url || !key || !service, "Opt-in: local Supabase credentials required");
test.describe.configure({ mode: "serial", timeout: 120000 });
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const identities = [0,1].map(() => ({ email: `reminder-ui-${randomUUID()}@example.invalid`, password: randomUUID(), id: "" }));
let admin: SupabaseClient, owner: SupabaseClient, other: SupabaseClient;
const tasks: string[] = [], providerRequests: string[] = [];
let initialJobIds: string[] = [];
let verifiedLocal = false;
let browserErrors: string[] = [];
const report = { baseline: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), startedAt: new Date().toISOString(),
  runs: [] as { name: string; status: string | undefined }[], facts: {} as Record<string, unknown> };
function sql(query: string) { return execFileSync("docker", ["exec", "supabase_db_lumivox-proj", "psql", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", query], { encoding: "utf8", windowsHide: true }).trim(); }
const section = (page: Page) => page.getByTestId("study-notification-settings");
async function preferences(id = identities[0].id) { const r = await admin.from("study_notification_preferences").select("*").eq("user_id",id).maybeSingle(); expect(r.error).toBeNull(); return r.data; }
async function jobs() { const r = await admin.from("study_notification_jobs").select("id,session_id,status,due_at,cancel_requested_at").eq("user_id",identities[0].id).order("id"); expect(r.error).toBeNull(); return r.data!; }
async function saved(page: Page) { await expect(section(page).getByRole("status").filter({ hasText: "Reminder settings saved." })).toBeVisible(); }
async function login(page: Page, index = 0) {
  await page.goto("/en/auth/login"); await submitLoginForm(page, identities[index].email, identities[index].password); await page.waitForURL("**/en/dashboard");
}
test.beforeAll(async ({ baseURL }) => {
  const api = new URL(url!), web = new URL(baseURL!);
  expect(api.protocol).toBe("http:"); expect(api.hostname).toMatch(/^(127\.0\.0\.1|localhost)$/); expect(api.port).toBe("55321");
  expect(web.protocol).toBe("http:"); expect(web.hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  expect(sql("SELECT (SELECT enabled FROM public.study_notification_dispatch_control)||'|'||(SELECT enabled FROM public.ls_missed_sweep_control)")).toBe("false|false");
  // Permission fault injection is only allowed on an empty disposable local DB.
  expect(sql("SELECT (SELECT count(*) FROM auth.users)||'|'||(SELECT count(*) FROM public.tasks)||'|'||(SELECT count(*) FROM public.study_notification_jobs)")).toBe("0|0|0");
  verifiedLocal = true;
  admin = createClient(url!, service!, options);
  for (const identity of identities) {
    const r = await admin.auth.admin.createUser({ email: identity.email, password: identity.password, email_confirm: true }); expect(r.error).toBeNull(); identity.id = r.data.user!.id;
    expect((await admin.from("profiles").upsert({ id: identity.id, onboarding_completed: true })).error).toBeNull();
  }
  owner = createClient(url!,key!,options); other = createClient(url!,key!,options);
  expect((await owner.auth.signInWithPassword(identities[0])).error).toBeNull();
  expect((await other.auth.signInWithPassword(identities[1])).error).toBeNull();
  for (let i = 0; i < 2; i++) {
    const task = await admin.from("tasks").insert({ user_id: identities[0].id, title: `Reminder browser Task ${i+1}`, status: "todo" }).select("id").single(); expect(task.error).toBeNull(); tasks.push(task.data!.id);
    const draft = { startsOn: "2030-01-07", endsOn: "2030-01-07", timezone: "UTC", slots: [{ weekday: 1, startTime: "10:00", endTime: "11:00" }] };
    const schedule = await owner.rpc("ls_create_schedule", { p_task_id: tasks[i], p_starts_on: draft.startsOn, p_ends_on: draft.endsOn, p_timezone: draft.timezone, p_slots: draft.slots, p_occurrences: generateStudyOccurrences(draft) }); expect(schedule.error).toBeNull();
  }
  expect((await other.rpc("ls_set_study_notification_preferences", { p_study_email_enabled: true, p_lead_minutes: 60 })).error).toBeNull();
});
test.beforeEach(async ({ page }) => {
  browserErrors = [];
  page.on("pageerror", error => browserErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /hydration|hydrated|uncaught/i.test(message.text())) browserErrors.push(message.text()); });
  page.on("request", request => { if (/resend|smtp|sendgrid|mailgun/i.test(new URL(request.url()).hostname)) providerRequests.push(new URL(request.url()).origin); });
  await login(page); await page.goto("/en/settings"); await expect(section(page).getByRole("heading", { name: "Study reminders" })).toBeVisible();
});
test.afterEach(async ({ page }, info) => {
  const run = { name: info.title, status: info.status, path: new URL(page.url()).pathname };
  try { expect(browserErrors).toEqual([]); }
  catch (error) { run.status = "failed"; throw error; }
  finally { report.runs.push(run); }
});
test.afterAll(async () => {
  const failures: string[] = [];
  // Restore every fault boundary even if a serial test failed midway.
  if (verifiedLocal) sql("GRANT SELECT ON public.study_notification_preferences TO authenticated; DROP TRIGGER IF EXISTS ns7d_fault ON public.study_notification_preferences; DROP FUNCTION IF EXISTS public.ns7d_fault();");
  if (owner) await owner.auth.signOut(); if (other) await other.auth.signOut();
  for (const identity of identities.filter(i => i.id)) {
    if ((await admin.auth.admin.deleteUser(identity.id)).error) failures.push("Auth cleanup failed");
    for (const table of ["tasks","task_study_schedules","task_study_sessions","study_notification_preferences","study_notification_task_overrides","study_notification_jobs","study_notification_deliveries"]) {
      const r = await admin.from(table).select("user_id", { count: "exact", head: true }).eq("user_id",identity.id);
      if (r.error || r.count !== 0) failures.push(`${table} cleanup incomplete`);
    }
  }
  const gates = sql("SELECT (SELECT enabled FROM public.study_notification_dispatch_control)||'|'||(SELECT enabled FROM public.ls_missed_sweep_control)");
  const cron = Number(sql("SELECT count(*) FROM cron.job WHERE jobname LIKE '%notification%' OR jobname LIKE '%reminder%'"));
  expect(failures).toEqual([]); expect(gates).toBe("false|false"); expect(cron).toBe(0); expect(providerRequests).toEqual([]);
  writeFileSync(resolve("../../docs/learning-schedule/phase-07-reminder-settings-browser.json"), JSON.stringify({ ...report, finishedAt: new Date().toISOString(), cleanup: failures.length ? failures : "PASS", dispatchGate: false, sweepGate: false, reminderCron: cron, providerRequests },null,2)+"\n");
});

test("NS-01 default OFF, explicit draft only, existing profile form independent", async ({ page }) => {
  const form = section(page), toggle = form.getByRole("switch", { name: "Email reminders", exact: false });
  await expect(toggle).not.toBeChecked(); expect(await preferences()).toBeNull(); expect(await jobs()).toHaveLength(0);
  await toggle.focus(); await page.keyboard.press("Space"); await expect(toggle).toBeChecked();
  expect(await preferences()).toBeNull(); await page.keyboard.press("Space"); await expect(toggle).not.toBeChecked();
  await expect(page.getByRole("heading", { name: "Theme preference", exact: true })).toBeVisible();
  await expect(form.getByRole("button", { name: "Save reminder settings", exact: true })).toBeDisabled();
});

test("NS-02/03/10 save consent, reload, keyboard lead change and persisted replan", async ({ page }) => {
  const form = section(page); await form.getByRole("switch", { name: "Email reminders" }).check();
  await form.getByRole("button", { name: "Save reminder settings", exact: true }).focus(); await page.keyboard.press("Enter"); await saved(page);
  expect(await preferences()).toMatchObject({ study_email_enabled: true, lead_minutes: 15 }); expect((await preferences())!.consented_at).not.toBeNull();
  const before = await jobs(); expect(before).toHaveLength(2); expect(before.every(j => j.status === "pending")).toBe(true); initialJobIds = before.map(j => j.id);
  await page.reload(); await expect(form.getByRole("switch", { name: "Email reminders" })).toBeChecked();
  await form.getByRole("radio", { name: "30 minutes", exact: true }).check(); await form.getByRole("button", { name: "Save reminder settings", exact: true }).click(); await saved(page);
  const after = await jobs(); expect(after.map(j => j.id)).toEqual(initialJobIds);
  for (let i=0;i<after.length;i++) expect(Date.parse(after[i].due_at)).toBe(Date.parse(before[i].due_at)-15*60000);
  report.facts.replan = { before: before.map(j=>({id:j.id,due:j.due_at})), after: after.map(j=>({id:j.id,due:j.due_at})) };
});

test("NS-04/09 quiet hours via browser; EN/VI mobile accessible and no overflow", async ({ page }) => {
  const form = section(page); await form.getByRole("switch", { name: "Quiet hours", exact: true }).check();
  await form.getByLabel("Quiet hours start", { exact: true }).fill("22:00"); await form.getByLabel("Quiet hours end", { exact: true }).fill("07:00");
  await form.getByLabel("Quiet hours timezone", { exact: true }).fill("America/New_York");
  await form.getByRole("button", { name: "Save reminder settings", exact: true }).click(); await saved(page);
  expect(await preferences()).toMatchObject({ quiet_hours_enabled: true, quiet_start_local: "22:00:00", quiet_end_local: "07:00:00", timezone: "America/New_York" });
  await page.setViewportSize({width:390,height:844}); const dir=resolve("../../docs/learning-schedule/evidence/step-7d"); mkdirSync(dir,{recursive:true});
  for (const locale of ["en","vi"]) {
    await page.goto(`/${locale}/settings`); await expect(section(page).getByRole("heading",{name:locale==="en"?"Study reminders":"Nhắc lịch học",exact:true})).toBeVisible();
    await expect(section(page).getByLabel(locale==="en"?"Quiet hours timezone":"Múi giờ yên lặng",{exact:true})).toHaveValue("America/New_York");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await section(page).getByRole("button",{name:locale==="en"?"Check latest saved settings":"Kiểm tra cài đặt đã lưu"}).focus();
    await page.keyboard.press("Enter");
    await expect(section(page).getByLabel(locale==="en"?"Quiet hours timezone":"Múi giờ yên lặng",{exact:true})).toBeEnabled();
    await page.evaluate(()=>window.scrollTo(0,0));
    // Keep caret styles unchanged: Playwright's default caret hiding mutates
    // input attributes while a streamed Suspense section may still hydrate.
    await page.screenshot({path:resolve(dir,`reminders-${locale}-mobile.png`),fullPage:true,caret:"initial"});
  }
});

test("NS-06 Task disable is persisted and only suppresses that Task", async ({ page }) => {
  await page.goto(`/en/workspace?task=${tasks[0]}`); const taskControl=page.getByRole("region",{name:"Task reminders",exact:true});
  await expect(taskControl).toBeVisible({timeout:30000}); await expect(taskControl.getByRole("switch")).toBeChecked();
  await taskControl.getByRole("switch").uncheck(); await taskControl.getByRole("button",{name:"Save task reminder setting"}).click();
  await expect(taskControl.getByRole("status")).toHaveText("Reminder settings saved.");
  const sessions=await admin.from("task_study_sessions").select("id,task_id").in("task_id",tasks); expect(sessions.error).toBeNull();
  const result=await jobs(); for(const job of result) expect(job.status).toBe(sessions.data!.find(s=>s.id===job.session_id)!.task_id===tasks[0]?"suppressed":"pending");
  await page.reload(); await expect(taskControl.getByRole("switch")).not.toBeChecked();
});

test("NS-05 persisted opt-out invalidates every pending job; Task true cannot bypass", async ({ page }) => {
  const form=section(page); await form.getByRole("switch",{name:"Email reminders"}).uncheck(); await form.getByRole("button",{name:"Save reminder settings",exact:true}).click(); await saved(page);
  expect(await preferences()).toMatchObject({study_email_enabled:false}); const result=await jobs(); expect(result).toHaveLength(2);
  for(const j of result) { expect(j.status).toBe("suppressed"); expect((await admin.rpc("ls_study_notification_job_is_current",{p_job_id:j.id})).data).toBe(false); }
  await page.goto(`/en/workspace?task=${tasks[0]}`); const control=page.getByRole("region",{name:"Task reminders",exact:true});
  await expect(control.getByText("Global reminders are off. This task setting cannot turn them on.")).toBeVisible();
  await control.getByRole("switch").check(); await control.getByRole("button",{name:"Save task reminder setting"}).click();
  await expect(control.getByRole("status")).toHaveText("Reminder settings saved."); expect((await jobs()).every(j=>j.status==="suppressed")).toBe(true);
  report.facts.optOut={jobs:result.map(j=>({id:j.id,status:j.status,cancellationFence:!!j.cancel_requested_at})),currentJobs:0};
});

test("NS-07 independent owner B browser cannot read/change A preferences", async ({ browser,baseURL }) => {
  const context=await browser.newContext({baseURL}); const page=await context.newPage();
  try {
    await login(page,1); await page.goto("/en/settings"); const form=section(page);
    await expect(form.getByRole("switch",{name:"Email reminders"})).toBeChecked(); await expect(form.getByRole("radio",{name:"1 hour",exact:true})).toBeChecked();
    const denied=await other.from("study_notification_preferences").select("*").eq("user_id",identities[0].id); expect(denied.error).toBeNull(); expect(denied.data).toEqual([]);
    const write=await other.from("study_notification_preferences").update({study_email_enabled:true}).eq("user_id",identities[0].id); expect(write.error?.code).toBe("42501");
    await form.getByRole("radio",{name:"5 minutes",exact:true}).check(); await form.getByRole("button",{name:"Save reminder settings",exact:true}).click(); await saved(page);
    expect(await preferences()).toMatchObject({study_email_enabled:false,lead_minutes:30}); expect(await preferences(identities[1].id)).toMatchObject({lead_minutes:5});
  } finally {await context.close();}
});

test("NS-08 real read failure, Retry, invalid draft and RPC conflict keep honest localized state", async ({ page }) => {
  try {
    sql("REVOKE SELECT ON public.study_notification_preferences FROM authenticated;");
    await page.reload(); await expect(section(page).getByRole("alert")).toContainText("could not be loaded");
    await expect(section(page).getByRole("switch")).toHaveCount(0);
  } finally {sql("GRANT SELECT ON public.study_notification_preferences TO authenticated;");}
  await section(page).getByRole("button",{name:"Check latest saved settings"}).click(); await expect(section(page).getByRole("switch",{name:"Email reminders"})).not.toBeChecked();
  await page.goto("/vi/settings"); const form=section(page); await form.getByRole("switch",{name:"Email nhắc lịch học"}).check();
  await form.getByLabel("Múi giờ yên lặng",{exact:true}).fill("Not/AZone");
  await form.getByRole("button",{name:"Lưu cài đặt nhắc học",exact:true}).click(); await expect(form.getByRole("alert")).toContainText("múi giờ IANA hợp lệ");
  expect((await preferences())!.study_email_enabled).toBe(false);
  await form.getByLabel("Múi giờ yên lặng",{exact:true}).fill("America/New_York");
  sql(`CREATE FUNCTION public.ns7d_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN IF NEW.user_id='${identities[0].id}'::uuid THEN RAISE EXCEPTION 'controlled browser lock conflict' USING ERRCODE='55P03'; END IF; RETURN NEW; END $$; CREATE TRIGGER ns7d_fault BEFORE UPDATE ON public.study_notification_preferences FOR EACH ROW EXECUTE FUNCTION public.ns7d_fault();`);
  try {
    await form.getByRole("button",{name:"Lưu cài đặt nhắc học",exact:true}).click(); await expect(form.getByRole("alert")).toContainText("Lịch học vừa thay đổi cùng lúc");
    await expect(form.getByRole("switch",{name:"Email nhắc lịch học"})).toBeChecked(); expect((await preferences())!.study_email_enabled).toBe(false);
    await expect(form.getByRole("status").filter({hasText:"Đã lưu cài đặt nhắc học."})).toHaveCount(0);
  } finally {sql("DROP TRIGGER IF EXISTS ns7d_fault ON public.study_notification_preferences; DROP FUNCTION IF EXISTS public.ns7d_fault();");}
  await form.getByRole("button",{name:"Kiểm tra cài đặt đã lưu"}).click(); await expect(form.getByRole("switch",{name:"Email nhắc lịch học"})).not.toBeChecked();
});

test("NS-11 delayed real Server Action response prevents duplicate commands/optimistic success", async ({ page }) => {
  const form=section(page); let requests=0, reached=false; let release!:()=>void;
  const barrier=new Promise<void>(resolve=>{release=resolve;});
  const handler: Parameters<Page["route"]>[1] = async route=>{
    if(route.request().method()!=="POST"||!route.request().headers()["next-action"]) {await route.continue();return;}
    requests++; const response=await route.fetch(); reached=true; await barrier; await route.fulfill({response});
  };
  await page.route("**/en/settings",handler);
  try {
    await form.getByRole("switch",{name:"Email reminders"}).check(); await form.getByRole("button",{name:"Save reminder settings",exact:true}).click();
    await expect.poll(()=>reached).toBe(true); await expect(form.locator("form")).toHaveAttribute("aria-busy","true");
    await expect(form.getByRole("button",{name:"Saving reminder settings…"})).toBeDisabled();
    await form.locator("form").evaluate(el=>{(el as HTMLFormElement).requestSubmit();(el as HTMLFormElement).requestSubmit();});
    expect(requests).toBe(1); expect((await preferences())!.study_email_enabled).toBe(true);
    await expect(form.getByRole("status").filter({hasText:"Reminder settings saved."})).toHaveCount(0);
  } finally {release();}
  await saved(page); await page.unroute("**/en/settings",handler); expect(requests).toBe(1); expect(await jobs()).toHaveLength(2);
  report.facts.inFlight={serverActionRequests:requests,dbCommittedBeforeResponse:true,optimisticSuccess:false};
});

test("NS-12 gates OFF, no submissions/email; anonymous settings protection", async ({ browser,baseURL }) => {
  const r=await admin.from("study_notification_deliveries").select("id",{count:"exact",head:true}).in("user_id",identities.map(i=>i.id)); expect(r.error).toBeNull(); expect(r.count).toBe(0);
  expect(providerRequests).toEqual([]); expect(sql("SELECT (SELECT enabled FROM public.study_notification_dispatch_control)||'|'||(SELECT enabled FROM public.ls_missed_sweep_control)")).toBe("false|false");
  const context=await browser.newContext({baseURL}); try {const page=await context.newPage();await page.goto("/en/settings");await expect(page).toHaveURL(/\/en\/auth\/login/);} finally {await context.close();}
  report.facts.deliveryAttempts=0;
});
