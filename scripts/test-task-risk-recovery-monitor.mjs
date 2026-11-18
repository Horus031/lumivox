import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const target = new URL(process.env.TASK_RISK_TEST_DATABASE_URL ?? "invalid");
assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Faults require a disposable local database");
const binary = process.env.TASK_RISK_TEST_PSQL || "psql";
const env = {
  ...process.env,
  PGHOST: target.hostname.replace(/[\[\]]/g, ""), PGPORT: target.port || "5432",
  PGDATABASE: target.pathname.slice(1), PGUSER: decodeURIComponent(target.username),
  PGPASSWORD: decodeURIComponent(target.password), PGSSLMODE: "disable", PGCONNECT_TIMEOUT: "5",
  TASK_RISK_MONITOR_PSQL: binary,
};
delete env.PGSERVICE;
delete env.PGHOSTADDR;

function sql(query) {
  return execFileSync(binary, ["-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1"], {
    input: query, env, encoding: "utf8", timeout: 15_000, windowsHide: true,
  }).trim();
}

function probe() {
  return spawnSync(process.execPath, [fileURLToPath(new URL("./check-task-risk-recovery-health.mjs", import.meta.url))], {
    env, encoding: "utf8", timeout: 20_000, windowsHide: true,
  });
}

const ids = Array.from({ length: 5 }, randomUUID);
const [owner, task, model, prediction, attempt] = ids;
const snapshot = readFileSync(new URL("./task-risk-recovery-health.sql", import.meta.url), "utf8");
const job = JSON.parse(sql(`select json_build_object('id',jobid,'active',active) from cron.job where jobname='task-risk-recovery-reconcile';`));
assert.equal(job.active, true, "Expected an active isolated reconciliation cron");
assert.equal(sql("select count(*) from public.task_risk_recovery_attempts;"), "0", "Expected empty disposable recovery tables");
try {
  sql(`select cron.alter_job(${Number(job.id)},active := false);`);
  const inactive = probe();
  assert.equal(inactive.status, 1);
  assert.ok(JSON.parse(inactive.stdout).alerts.includes("cron_inactive"));
  console.log("PASS: inactive cron raises exit 1");

  // Simulate one failed cron result inside a transaction and roll it back.
  const failed = JSON.parse(sql(snapshot.replace("begin read only;", `begin;
    update cron.job_run_details set status='failed'
      where runid=(select runid from cron.job_run_details where jobid=${Number(job.id)} order by start_time desc limit 1);`)));
  assert.ok(failed.alerts.includes("cron_failure"));
  console.log("PASS: failed cron history raises cron_failure (rolled back)");

  sql(`
    begin;
    insert into auth.users(id,email) values ('${owner}','phase8-monitor-${owner}@example.invalid');
    insert into public.profiles(id) values ('${owner}') on conflict do nothing;
    insert into public.tasks(id,user_id,title,due_at) values ('${task}','${owner}','Monitor fixture',now()+interval '1 day');
    insert into public.ml_model_versions(id,model_key,version,algorithm,training_dataset,artifact_path)
      values ('${model}','phase8-monitor','fixture-${model}','fixture','fixture','fixture');
    insert into public.deadline_risk_predictions(id,user_id,task_id,model_version_id,input_mode,risk_probability,predicted_label,feature_payload)
      values ('${prediction}','${owner}','${task}','${model}','lumivox_native_features',0.7,true,'{}');
    insert into public.task_risk_recovery_attempts(id,user_id,task_id,source_prediction_id,action_type,idempotency_key,original_due_at)
      values ('${attempt}','${owner}','${task}','${prediction}','split_task','${attempt}',now()+interval '1 day');
    insert into task_risk_private.reassessments(user_id,task_id,attempt_id,reserved_at,started_at)
      values ('${owner}','${task}','${attempt}',now()-interval '12 minutes',now()-interval '11 minutes');
    commit;
  `);
  const overdue = probe();
  assert.equal(overdue.status, 1);
  assert.ok(JSON.parse(overdue.stdout).alerts.includes("worker_claim_overdue"));
  assert.equal(sql(`select finished_at is null from task_risk_private.reassessments where attempt_id='${attempt}';`), "t");
  console.log("PASS: overdue claim raises alert and remains fenced");
} finally {
  sql(`delete from auth.users where id='${owner}'; delete from public.ml_model_versions where id='${model}';`);
  sql(`select cron.alter_job(${Number(job.id)},active := true);`);
}

assert.equal(sql("select count(*) from public.task_risk_recovery_attempts;"), "0");
assert.equal(sql(`select active from cron.job where jobid=${Number(job.id)};`), "t");
console.log("PASS: fixtures removed and isolated cron restored");

