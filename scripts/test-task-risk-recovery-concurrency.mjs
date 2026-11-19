import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";

const url = new URL(process.env.TASK_RISK_TEST_DATABASE_URL ?? "invalid");
assert.equal(url.protocol, "postgresql:");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Use an isolated loopback test database");
const binary = process.env.TASK_RISK_TEST_PSQL ?? "psql";

function connect() {
  const child = spawn(binary, ["-qAtX", "-v", "ON_ERROR_STOP=1"], {
    env: {
      ...process.env,
      PGHOST: url.hostname.replace(/[\[\]]/g, ""), PGPORT: url.port || "5432",
      PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGOPTIONS: "-c statement_timeout=10000 -c idle_in_transaction_session_timeout=20000",
    },
    stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
  });
  let waiting;
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", (error) => waiting?.reject(error));
  child.on("exit", (code) => waiting?.reject(new Error(`psql exited ${code}: ${stderr}`)));
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (line === "__QUERY_END__") {
      const finished = waiting;
      waiting = undefined;
      finished.resolve(finished.lines.join("\n"));
    } else waiting?.lines.push(line);
  });
  return {
    sql(query) {
      assert.equal(waiting, undefined, "One query per connection");
      return new Promise((resolve, reject) => {
        waiting = { resolve, reject, lines: [] };
        child.stdin.write(query + "\n\\echo __QUERY_END__\n");
      });
    },
    close() { child.stdin.end(); },
  };
}

const [owner, task, subtask, model, prediction, attemptA, attemptB] = Array.from({ length: 7 }, randomUUID);
const connections = [connect(), connect(), connect()];
const [a, b, observer] = connections;
const worker = "select public.reconcile_task_risk_recovery(1);";
const reserve = (id) => `select public.reserve_task_risk_reassessment('${owner}','${id}');`;
try {
  // This suite requires a disposable database with no other recovery traffic.
  assert.equal(await observer.sql("select count(*) from public.task_risk_recovery_attempts;"), "0");
  await observer.sql(`
    insert into auth.users(id,email) values ('${owner}','risk-concurrency-${owner}@example.invalid');
    insert into public.profiles(id) values ('${owner}') on conflict do nothing;
    insert into public.tasks(id,user_id,title,due_at,estimated_minutes)
        values ('${task}','${owner}','Concurrency Task',now()+interval '1 day',60);
    insert into public.ml_model_versions(id,model_key,version,algorithm,training_dataset,artifact_path)
        values ('${model}','native_task_delay_risk_classifier','${model}','logistic_regression_balanced','fixture','fixture');
    insert into public.deadline_risk_predictions(id,user_id,task_id,model_version_id,input_mode,risk_probability,predicted_label,feature_payload)
        values ('${prediction}','${owner}','${task}','${model}','lumivox_native_features',0.76,true,'{}');
    insert into public.task_risk_recovery_attempts(id,user_id,task_id,source_prediction_id,action_type,idempotency_key,original_due_at)
        values ('${attemptA}','${owner}','${task}','${prediction}','split_task','${attemptA}',now()+interval '1 day'),
               ('${attemptB}','${owner}','${task}','${prediction}','reduce_scope','${attemptB}',now()+interval '1 day');
  `);

  // Commit the actual mutation and discard the connection before tracking.
  const mutation = connect();
  try {
    await mutation.sql(`begin;
      insert into public.tasks(id,user_id,parent_task_id,title,recovery_attempt_id)
      values ('${subtask}','${owner}','${task}','One committed subtask','${attemptA}');
      commit;`);
  } finally { mutation.close(); }

  assert.equal(await a.sql("begin; " + worker), "1");
  assert.equal(await b.sql(worker), "0");
  await a.sql("commit;");
  assert.equal(await observer.sql(worker), "0");
  assert.equal(await observer.sql(`select count(*) from public.tasks where parent_task_id='${task}';`), "1");
  assert.equal(await observer.sql(`select applied_entity_id from public.task_risk_recovery_attempts where id='${attemptA}';`), subtask);

  await observer.sql(`update public.tasks set estimated_minutes=30,recovery_attempt_id='${attemptB}' where id='${task}';`);
  assert.equal(await observer.sql(worker), "1");
  const pid = await b.sql("select pg_backend_pid();");
  const first = JSON.parse(await a.sql("begin; " + reserve(attemptA)));
  assert.equal(first.kind, "dispatch");
  const contender = b.sql(reserve(attemptB));
  void contender.catch(() => {});
  let blocked = false;
  for (let retry = 0; retry < 30 && !blocked; retry++) {
    blocked = await observer.sql(`select cardinality(pg_blocking_pids(${Number(pid)}))>0;`) === "t";
    if (!blocked) await delay(40);
  }
  assert.ok(blocked, "Second reservation waits on the same Task lock");
  await a.sql("commit;");
  assert.equal(await contender, "");

  const claim = `select public.claim_task_risk_reassessment('${owner}','${task}','${first.id}');`;
  assert.deepEqual((await Promise.all([a.sql(claim), b.sql(claim)])).sort(), ["f", "t"]);
  console.log("PASS: disconnected mutation, two reconciliation workers, shared-Task reservation lock, single ML claim");
} finally {
  await a.sql("rollback;").catch(() => {});
  await observer.sql(`delete from auth.users where id='${owner}'; delete from public.ml_model_versions where id='${model}';`).catch(() => {});
  connections.forEach((connection) => connection.close());
}
