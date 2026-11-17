import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { submitLoginForm } from "./helpers/auth";
import {
  acceptanceConfig, cleanFixture, makeFixture, requireSetting, sqlValue, validateFixtureAccount, validateNativeRegistry,
  type AcceptanceConfig,
} from "./helpers/task-risk-acceptance-db";

test.skip(process.env.TASK_RISK_ACCEPTANCE !== "1", "Opt-in Recovery staging/QA acceptance");
test.describe.configure({ mode: "default", timeout: 250_000 });
test.use({ trace: "off", video: "off", screenshot: "off", serviceWorkers: "block", actionTimeout: 20_000, navigationTimeout: 30_000 });

const scenarios = [
  { name: "Legacy Focus", action: "start_focus", label: "Start Focus", focus: "legacy" },
  { name: "Focus V2", action: "start_focus", label: "Start Focus", focus: "v2" },
  { name: "Split Task", action: "split_task", label: "Break into subtasks" },
  { name: "Reschedule", action: "reschedule", label: "Review deadline" },
  { name: "Reduce Scope", action: "reduce_scope", label: "Reduce task scope" },
  { name: "Native ML and historical pair", action: "split_task", label: "Break into subtasks" },
  { name: "Redis quota isolation", action: "split_task", label: "Break into subtasks" },
] as const;

type Observation = {
  id: string;
  status: string;
  action: string;
  original_due: string;
  applied_entity: string | null;
  receipt_entity: string | null;
  receipt_time: string | null;
  entity_same_xid: boolean | null;
  confirmed_at_receipt_time: boolean | null;
  cron_success_after_receipt: boolean;
  child_count: number;
  focus_count: number;
  focus_mode: string | null;
  due: string;
  estimate: number;
};

function observation(cfg: AcceptanceConfig, id: string) {
  const task = `${sqlValue(id)}::uuid`;
  return cfg.sql<Observation | null>(`
    select coalesce((
      select jsonb_build_object(
       'id',a.id,'status',a.status,'action',a.action_type,'original_due',a.original_due_at,
       'applied_entity',a.applied_entity_id,'receipt_entity',r.entity_id,'receipt_time',r.recorded_at,
       'entity_same_xid',case a.action_type
         when 'start_focus' then f.xmin=r.xmin
         when 'split_task' then child.xmin=r.xmin
         else t.xmin=r.xmin end,
       'confirmed_at_receipt_time',a.applied_at=r.recorded_at,
       'cron_success_after_receipt',exists(
        select 1 from cron.job j join cron.job_run_details d on d.jobid=j.jobid
        where j.jobname='task-risk-recovery-reconcile' and d.status='succeeded' and d.end_time>=r.recorded_at),
       'child_count',(select count(*) from public.tasks where parent_task_id=a.task_id and user_id=a.user_id),
       'focus_count',(select count(*) from public.focus_sessions where task_id=a.task_id and user_id=a.user_id),
       'focus_mode',f.session_mode,'due',t.due_at,'estimate',t.estimated_minutes
      )
      from public.task_risk_recovery_attempts a
      join public.tasks t on (t.id,t.user_id)=(a.task_id,a.user_id)
      left join task_risk_private.receipts r
        on (r.attempt_id,r.user_id,r.task_id,r.action_type)=(a.id,a.user_id,a.task_id,a.action_type)
      left join public.focus_sessions f on f.id=r.entity_id and (f.task_id,f.user_id)=(a.task_id,a.user_id)
      left join public.tasks child on child.id=r.entity_id and (child.parent_task_id,child.user_id)=(a.task_id,a.user_id)
      where a.task_id=${task} and a.user_id=${cfg.owner} and a.receipt_required
    ),'null'::jsonb);
  `);
}

async function login(page: Page, cfg: AcceptanceConfig) {
  const bypass = process.env.TASK_RISK_ACCEPTANCE_VERCEL_BYPASS;
  let health = await page.request.get(new URL("/api/health", cfg.app).toString(), {
    maxRedirects: 0,
    headers: bypass && cfg.target !== "rehearsal" ? {
      "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true",
    } : undefined,
  });
  if (bypass && cfg.target !== "rehearsal" && [302, 303, 307, 308].includes(health.status())) {
    const location = health.headers().location;
    if (!location) throw new Error("Vercel protection redirect did not provide a destination");
    const destination = new URL(location, cfg.app);
    if (destination.origin !== cfg.app.origin || destination.pathname !== "/api/health") {
      throw new Error("Vercel protection redirect left the approved health endpoint");
    }
    // The cookie is now in this browser context. Do not forward the header.
    health = await page.request.get(destination.toString(), { maxRedirects: 0 });
  }
  expect(health.status(), "Expected the approved deployment health endpoint").toBe(200);
  const deployment = await health.json();
  expect(deployment).toMatchObject({ service: "lumivox-web", status: "ok", revision: cfg.revision });
  if (cfg.target !== "rehearsal") expect(["preview", "staging", "test"]).toContain(deployment.environment);

  await page.route("**/auth/v1/token**", async (route) => {
    if (new URL(route.request().url()).origin !== cfg.api.origin) return route.abort();
    await route.continue();
  });
  await page.goto("/en/auth/login");
  expect(new URL(page.url()).origin).toBe(cfg.app.origin);
  const signIn = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === cfg.api.origin && url.pathname === "/auth/v1/token" &&
      url.searchParams.get("grant_type") === "password";
  });
  await submitLoginForm(page, cfg.email, requireSetting("TASK_RISK_ACCEPTANCE_PASSWORD"));
  expect((await signIn).status(), "Dedicated account reached the intended Supabase project").toBe(200);
  await expect(page).toHaveURL(/\/(dashboard|workspace)(?:\?|$)/, { timeout: 30_000 });
}

function verifyPrivileges(cfg: AcceptanceConfig, id: string) {
  const stranger = randomUUID();
  expect(cfg.sql<{ cross_owner: number; browser_worker: boolean; anon_worker: boolean; service_worker: boolean }>(`
    begin read only;
    set local role authenticated;
    do $do$ begin perform set_config('request.jwt.claim.sub',${sqlValue(stranger)},true); end $do$;
    select jsonb_build_object(
      'cross_owner',(select count(*) from public.task_risk_recovery_attempts where id=${sqlValue(id)}::uuid),
      'browser_worker',has_function_privilege('authenticated','public.reconcile_task_risk_recovery(integer)','EXECUTE'),
      'anon_worker',has_function_privilege('anon','public.reconcile_task_risk_recovery(integer)','EXECUTE'),
      'service_worker',has_function_privilege('service_role','public.reconcile_task_risk_recovery(integer)','EXECUTE')
    );
    rollback;
  `, "transaction")).toEqual({ cross_owner: 0, browser_worker: false, anon_worker: false, service_worker: true });
}

function pairedPrediction(cfg: AcceptanceConfig, attempt: string) {
  return cfg.sql<{ id: string; linked_request: boolean; revision_matches: boolean; model: string; native: boolean } | null>(`
    select coalesce((
      select jsonb_build_object('id',p.id,'linked_request',j.request_id=p.id and j.started_at is not null,
        'revision_matches',p.prediction_metadata->'input_revision'=to_jsonb(v.revision),'model',p.model_version_id,
        'native',p.prediction_metadata->>'prediction_mode'='native_ml'
          and not (p.prediction_metadata ? 'phase7_fixture') and p.created_at>a.applied_at)
      from public.task_risk_recovery_attempts a
      join public.deadline_risk_predictions p
        on (p.id,p.user_id,p.task_id)=(a.reassessment_prediction_id,a.user_id,a.task_id)
      join task_risk_private.reassessments j on (j.attempt_id,j.user_id,j.task_id,j.request_id)=(a.id,a.user_id,a.task_id,p.id)
      join public.native_task_risk_input_revisions v on v.user_id=a.user_id
      where a.id=${sqlValue(attempt)}::uuid and a.user_id=${cfg.owner}
    ),'null'::jsonb);
  `);
}

async function saturateQuota(cfg: AcceptanceConfig) {
  const url = requireSetting("TASK_RISK_ACCEPTANCE_REDIS_URL");
  if (new URL(url).protocol !== "https:" || cfg.target === "rehearsal") throw new Error("Quota injection requires a configured hosted Redis");
  const limiter = new Ratelimit({
    redis: new Redis({ url, token: requireSetting("TASK_RISK_ACCEPTANCE_REDIS_TOKEN") }),
    limiter: Ratelimit.slidingWindow(10, "1 h"), prefix: "lumivox:ratelimit",
  });
  let allowed = true;
  for (let i = 0; i < 11 && allowed; i++) {
    allowed = (await limiter.limit(`task-risk-recovery:${cfg.actor}`)).success;
  }
  expect(allowed, "Dedicated account reached configured quota").toBe(false);
}

for (const scenario of scenarios) {
  test(`Staging Recovery acceptance — ${scenario.name}`, async ({ page, baseURL }, testInfo) => {
    test.skip("focus" in scenario && process.env.TASK_RISK_ACCEPTANCE_FOCUS_MODE !== scenario.focus,
      "Run against a deployment configured for the requested Focus mode");
    test.skip(scenario.name === "Native ML and historical pair" && process.env.TASK_RISK_ACCEPTANCE_NATIVE_ML !== "1",
      "Opt in to live Native ML");
    test.skip(scenario.name === "Redis quota isolation" && process.env.TASK_RISK_ACCEPTANCE_REDIS_QUOTA !== "1",
      "Opt in to saturating the dedicated account's hosted Redis quota");

    const cfg = acceptanceConfig(baseURL);
    validateFixtureAccount(cfg);
    await login(page, cfg);
    validateNativeRegistry(cfg);
    if ("focus" in scenario) {
      await page.goto("/en/focus");
      await expect(page.getByRole("heading", {
        name: scenario.focus === "v2" ? "Build your focus session" : "Start a focus session",
        exact: true,
      }), "The deployed Focus creation mode must match this acceptance lane").toBeVisible();
    }
    const taskId = randomUUID();
    await testInfo.attach("fixture-id", { body: taskId, contentType: "text/plain" });
    try {
      const fixture = makeFixture(cfg, taskId, scenario.action, scenario.label);
      expect(fixture, "Active Native ML registry entry is required").not.toBeNull();
      const workspace = `/en/workspace?task=${taskId}&tab=risk`;
      await page.goto(workspace);
      await expect(page.getByText("No recovery actions yet.", { exact: true })).toBeVisible();
      await expect(page.getByText("Loading full task details...", { exact: true })).toHaveCount(0);
      await page.getByRole("article").filter({ has: page.getByRole("heading", { name: scenario.label, exact: true }) })
        .getByRole("button", { name: "Review action" }).click();
      await expect.poll(() => observation(cfg, taskId), { timeout: 20_000 }).toMatchObject({
        status: "initiated", action: scenario.action, receipt_time: null,
      });

      if ("focus" in scenario) {
        await expect(page).toHaveURL(/\/focus\?.*recoveryAttemptId=/);
        await expect(page.getByRole("heading", {
          name: scenario.focus === "v2" ? "Build your focus session" : "Start a focus session",
          exact: true,
        })).toBeVisible();
        await page.getByRole("button", { name: "Start focus session", exact: true }).click();
      } else if (scenario.action === "split_task") {
        await page.getByPlaceholder("Add a smaller step...").fill("Phase 7 committed subtask");
        await page.getByRole("button", { name: "Add", exact: true }).click();
      } else {
        if (scenario.action === "reschedule") {
          const time = page.locator('input[type="time"]');
          await time.fill((await time.inputValue()).startsWith("10:15") ? "11:15" : "10:15");
        } else {
          await page.getByLabel("Estimated minutes").fill("30");
        }
        await page.getByRole("button", { name: "Save", exact: true }).click();
      }

      await expect.poll(() => observation(cfg, taskId)?.entity_same_xid, { timeout: 15_000 }).toBe(true);
      await expect.poll(() => observation(cfg, taskId), { timeout: 125_000, intervals: [1000, 2500, 4000] })
        .toMatchObject({ status: "applied", confirmed_at_receipt_time: true, cron_success_after_receipt: true });
      const applied = observation(cfg, taskId)!;
      expect(Date.parse(applied.original_due)).toBe(Date.parse(fixture.due));
      if ("focus" in scenario) {
        expect(applied).toMatchObject({ focus_count: 1, child_count: 0, focus_mode: scenario.focus === "v2" ? "pomodoro" : "legacy" });
        expect(applied.applied_entity).toBe(applied.receipt_entity);
      } else if (scenario.action === "split_task") {
        expect(applied).toMatchObject({ child_count: 1, focus_count: 0 });
        expect(applied.applied_entity).toBe(applied.receipt_entity);
      } else {
        expect(applied).toMatchObject({ child_count: 0, focus_count: 0, receipt_entity: taskId, applied_entity: null });
        if (scenario.action === "reschedule") expect(Date.parse(applied.due)).not.toBe(Date.parse(fixture.due));
        else expect(applied.estimate).toBe(30);
      }
      verifyPrivileges(cfg, applied.id);

      if (scenario.name === "Native ML and historical pair") {
        await page.goto(workspace);
        await page.getByRole("button", { name: "Reassess risk" }).click();
        await expect.poll(() => pairedPrediction(cfg, applied.id), { timeout: 30_000 }).toMatchObject({
          linked_request: true, revision_matches: true, model: fixture.model, native: true,
        });
        const paired = pairedPrediction(cfg, applied.id)!;
        expect(paired.id).not.toBe(fixture.fixture_prediction);
        const comparison = page.getByText(/^Historical reassessment:/);
        await expect(comparison).toBeVisible();
        const before = await comparison.textContent();

        // Advance the latest snapshot with a marked fixture after actual ML inference.
        const newer = cfg.sql<string | null>(`
          with added as (
            insert into public.deadline_risk_predictions(
              user_id,task_id,model_version_id,input_mode,risk_probability,predicted_label,
              decision_threshold,feature_payload,prediction_metadata,created_at
            )
            select user_id,task_id,model_version_id,input_mode,1-risk_probability,
              1-risk_probability >= decision_threshold,decision_threshold,feature_payload,
              prediction_metadata || '{"phase7_fixture":true,"phase7_fixture_kind":"later_snapshot"}'::jsonb,
              clock_timestamp()
            from public.deadline_risk_predictions
            where id=${sqlValue(paired.id)}::uuid and user_id=${cfg.owner}
              and task_id=${sqlValue(taskId)}::uuid and created_at<clock_timestamp()
            returning id
          )
          select to_json((select id from added));
        `, "transaction");
        expect(newer).toBeTruthy();
        expect(newer).not.toBe(paired.id);
        expect(cfg.sql<string | null>(`
          select to_json((select id from public.deadline_risk_predictions
            where user_id=${cfg.owner} and task_id=${sqlValue(taskId)}::uuid
            order by created_at desc,id desc limit 1));
        `)).toBe(newer);
        await page.goto(workspace);
        await expect(page.getByText(/^Historical reassessment:/)).toHaveText(before!);
      }

      if (scenario.name === "Redis quota isolation") {
        await saturateQuota(cfg);
        await page.goto(workspace);
        await page.getByRole("button", { name: "Reassess risk" }).click();
        await expect(page.getByRole("status").filter({ hasText: /Reassessment is unavailable/ })).toBeVisible();
        expect(cfg.sql<number>(`
          select to_json(count(*)) from task_risk_private.reassessments where attempt_id=${sqlValue(applied.id)}::uuid;
        `)).toBe(0);
        await page.getByRole("tab", { name: /Subtasks/ }).click();
        await page.getByPlaceholder("Add a smaller step...").fill("Ordinary subtask after quota");
        await page.getByRole("button", { name: "Add", exact: true }).click();
        await expect(page.getByText("Ordinary subtask after quota", { exact: true })).toBeVisible();
        await page.goto(`/en/focus?taskId=${taskId}`);
        await page.getByRole("button", { name: "Start focus session", exact: true }).click();
        await expect.poll(() => observation(cfg, taskId)?.focus_count, { timeout: 15_000 }).toBe(1);
        expect(observation(cfg, taskId)?.receipt_entity).toBe(applied.receipt_entity);
      }

      await testInfo.attach("recovery-evidence", {
        body: JSON.stringify({ environment: cfg.target, revision: cfg.revision, scenario: scenario.name,
          atomic_receipt: true, automatic_cron: true, native_reassessment: scenario.name === "Native ML and historical pair" }),
        contentType: "application/json",
      });
    } finally {
      cleanFixture(cfg, taskId);
    }
  });
}
