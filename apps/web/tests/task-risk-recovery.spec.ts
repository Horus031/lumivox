import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../types/database.types";
import { submitLoginForm } from "./helpers/auth";

const api = process.env.TASK_RISK_E2E_SUPABASE_URL;
const key = process.env.TASK_RISK_E2E_SERVICE_KEY;
const mode = process.env.TASK_RISK_E2E_FOCUS_MODE;

test.skip(!api || !key, "Opt in with an isolated loopback Supabase project.");

const cases = [
  { action: "start_focus", label: "Start Focus", focus: "legacy" },
  { action: "start_focus", label: "Start Focus", focus: "v2" },
  { action: "split_task", label: "Break into subtasks" },
  { action: "reschedule", label: "Review deadline" },
  { action: "reduce_scope", label: "Reduce task scope" },
] as const;

for (const scenario of cases) {
  test(`Recovery receipt through the browser: ${"focus" in scenario ? scenario.focus : scenario.action}`, async ({ page, baseURL }) => {
    test.skip("focus" in scenario && mode !== scenario.focus, "Run separately against the selected Focus mode.");
    if ("focus" in scenario) test.setTimeout(90_000);
    for (const target of [api!, baseURL!]) {
      expect(["127.0.0.1", "localhost", "[::1]"]).toContain(new URL(target).hostname);
    }
    const admin = createClient<Database>(api!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    const email = `risk-recovery-${randomUUID()}@example.invalid`;
    const password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    const user = created.data.user!.id;
    let fixtureModelId: string | undefined;
    try {
      expect((await admin.from("profiles").upsert({ id: user, onboarding_completed: true })).error).toBeNull();
      const title = "Phase 6 recovery fixture";
      const dueAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const task = await admin.from("tasks").insert({ title, user_id: user, due_at: dueAt, estimated_minutes: 60 })
        .select("id").single();
      expect(task.error).toBeNull();
      const taskId = task.data!.id;
      const rev = await admin.from("native_task_risk_input_revisions").select("revision").eq("user_id", user).single();
      const model = await admin.from("ml_model_versions").select("id").eq("model_key", "native_task_delay_risk_classifier")
        .eq("is_active", true).maybeSingle();
      expect(rev.error).toBeNull();
      expect(model.error).toBeNull();
      if (!model.data) {
        const registered = await admin.from("ml_model_versions").insert({
          model_key: "native_task_delay_risk_classifier", version: randomUUID(), algorithm: "logistic_regression_balanced",
          artifact_path: "fixture", training_dataset: "fixture", is_active: true,
        }).select("id").single();
        expect(registered.error).toBeNull();
        fixtureModelId = registered.data!.id;
      }
      expect((await admin.from("deadline_risk_predictions").insert({
        user_id: user, task_id: taskId, model_version_id: model.data?.id ?? fixtureModelId!, input_mode: "lumivox_native_features",
        risk_probability: 0.76, predicted_label: true, feature_payload: {},
        prediction_metadata: {
          prediction_mode: "native_ml", feature_schema_version: "native-task-risk-v2",
          input_revision: rev.data!.revision, due_at: dueAt, risk_band: "high", risk_score: 76,
          reason_summaries: [],
          recommended_actions: [{
            action_id: scenario.action, label: scenario.label, description: "Local test suggestion",
            action_type: scenario.action, priority: 1, payload: {},
          }],
        },
      })).error).toBeNull();

      await page.goto("/en/auth/login");
      await submitLoginForm(page, email, password);
      await expect(page).toHaveURL(/\/(dashboard|workspace)(?:\?|$)/, { timeout: 30_000 });
      await page.goto(`/en/workspace?task=${taskId}&tab=risk`);
      await expect(page.getByRole("tab", { name: "Risk", exact: true })).toBeVisible();
      await page.getByRole("article").filter({ has: page.getByRole("heading", { name: scenario.label, exact: true }) })
        .getByRole("button", { name: "Review action" }).click();

      if ("focus" in scenario) {
        await expect(page).toHaveURL(/\/focus\?.*recoveryAttemptId=/, { timeout: 45_000 });
        await expect(page.getByRole("heading", { name: scenario.focus === "v2" ? "Build your focus session" : "Start a focus session" })).toBeVisible();
        await page.getByRole("button", { name: "Start focus session", exact: true }).click();
      } else if (scenario.action === "split_task") {
        await page.getByPlaceholder("Add a smaller step...").fill("Commit one step");
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

      const getAttempt = () => admin.from("task_risk_recovery_attempts")
        .select("status,action_type,receipt_recorded_at,applied_entity_id,original_due_at")
        .eq("user_id", user).eq("task_id", taskId).single();
      await expect.poll(async () => (await getAttempt()).data?.receipt_recorded_at).toBeTruthy();
      expect((await admin.rpc("reconcile_task_risk_recovery", { p_limit: 50 })).error).toBeNull();
      const attempt = await getAttempt();
      expect(attempt.error).toBeNull();
      expect(attempt.data).toMatchObject({ status: "applied", action_type: scenario.action });
      expect(Date.parse(attempt.data!.original_due_at)).toBe(Date.parse(dueAt));

      if ("focus" in scenario) {
        const sessions = await admin.from("focus_sessions").select("id,session_mode").eq("task_id", taskId);
        expect(sessions.data).toEqual([{ id: attempt.data!.applied_entity_id, session_mode: scenario.focus === "v2" ? "pomodoro" : "legacy" }]);
      } else if (scenario.action === "split_task") {
        const children = await admin.from("tasks").select("id,title").eq("parent_task_id", taskId);
        expect(children.data).toEqual([{ id: attempt.data!.applied_entity_id, title: "Commit one step" }]);
      } else {
        const updated = await admin.from("tasks").select("due_at,estimated_minutes").eq("id", taskId).single();
        if (scenario.action === "reschedule") expect(Date.parse(updated.data!.due_at!)).not.toBe(Date.parse(dueAt));
        else expect(updated.data!.estimated_minutes).toBe(30);
      }
    } finally {
      expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
      if (fixtureModelId) expect((await admin.from("ml_model_versions").delete().eq("id", fixtureModelId)).error).toBeNull();
    }
  });
}
