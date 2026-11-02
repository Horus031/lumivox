import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const container = "supabase_db_lumivox-proj";
const owner = randomUUID();
const email = `attendance-cc-${owner}@example.invalid`;
const title = "Attendance concurrency verification fixture";

const reportPath = resolve(
  root,
  "docs/learning-schedule/phase-05-attendance-cross-boundary.json",
);

const q = (value) => `'${String(value).replaceAll("'", "''")}'`;

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

class Connection {
  constructor(name) {
    this.name = name;
    this.active = null;
    this.stderr = [];
    this.closed = false;

    this.child = spawn(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-X",
        "-A",
        "-t",
        "-q",
        "-U",
        "postgres",
        "-d",
        "postgres",
      ],
      {
        cwd: root,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    createInterface({ input: this.child.stdout }).on("line", (line) => {
      if (!this.active) return;

      if (line === this.active.marker) {
        const pending = this.active;
        this.active = null;
        clearTimeout(pending.timer);

        pending.resolve({
          text: pending.lines.join("\n"),
          errors: this.stderr.splice(0),
        });
      } else {
        this.active.lines.push(line);
      }
    });

    createInterface({ input: this.child.stderr }).on("line", (line) =>
      this.stderr.push(line),
    );

    this.child.on("error", (error) => this.fail(error));

    this.child.on("exit", (code) => {
      if (!this.closed) {
        this.fail(new Error(`${name}: psql exited with code ${code}`));
      }
    });
  }

  fail(error) {
    if (!this.active) return;

    const pending = this.active;
    this.active = null;
    clearTimeout(pending.timer);
    pending.reject(error);
  }

  exec(sql) {
    assert(!this.active, `${this.name}: command already active`);

    return new Promise((resolveCommand, reject) => {
      const marker = `__LS_DONE_${randomUUID().replaceAll("-", "")}`;

      const timer = setTimeout(() => {
        this.fail(new Error(`${this.name}: command exceeded 15 seconds`));
      }, 15000);

      this.active = {
        marker,
        timer,
        lines: [],
        resolve: resolveCommand,
        reject,
      };

      this.stderr.length = 0;

      this.child.stdin.write(
        `${sql}\n` +
          "\\echo __LS_SQLSTATE :SQLSTATE\n" +
          "\\echo __LS_LAST_ERROR :LAST_ERROR_MESSAGE\n" +
          `\\echo ${marker}\n`,
      );
    }).then((result) => {
      const lines = result.text.split("\n");

      const state = lines
        .findLast((x) => x.startsWith("__LS_SQLSTATE "))
        ?.split(" ")[1];

      const message = lines
        .findLast((x) => x.startsWith("__LS_LAST_ERROR "))
        ?.slice("__LS_LAST_ERROR ".length);

      return {
        state,
        message: state === "00000" ? null : message,
        text: lines
          .filter(
            (x) =>
              !x.startsWith("__LS_SQLSTATE ") &&
              !x.startsWith("__LS_LAST_ERROR "),
          )
          .join("\n")
          .trim(),
        errors: result.errors,
      };
    });
  }

  async ok(sql) {
    const result = await this.exec(sql);

    assert.equal(
      result.state,
      "00000",
      `${this.name}: ${result.state}: ` +
        `${result.message ?? ""}\n${result.errors.join("\n")}`,
    );

    return result.text;
  }

  async json(sql) {
    return JSON.parse(await this.ok(sql));
  }

  async init() {
    await this.ok(`
      \\set ON_ERROR_STOP off
      \\set VERBOSITY verbose
      SET application_name =
        ${q(`lumivox-attendance-cc-${this.name}`)};
      SET lock_timeout = '5s';
      SET statement_timeout = '10s';
    `);

    this.pid = Number(await this.ok("SELECT pg_backend_pid();"));
  }

  async begin(role = "authenticated") {
    assert(
      ["authenticated", "service_role"].includes(role),
      "Unexpected test role",
    );

    await this.ok(`
      BEGIN;
      SET LOCAL ROLE ${role};
      ${
        role === "authenticated"
          ? `
        SET LOCAL "request.jwt.claim.sub" = ${q(owner)};
        SET LOCAL "request.jwt.claim.role" = 'authenticated';
      `
          : ""
      }
    `);
  }

  async close() {
    if (this.closed) return;

    this.closed = true;

    if (this.active) {
      this.fail(new Error(`${this.name}: closing active command`));
    }

    this.child.stdin.end("ROLLBACK;\n\\q\n");

    await Promise.race([
      new Promise((done) => this.child.once("exit", done)),
      wait(2000),
    ]);

    if (this.child.exitCode === null) {
      this.child.kill();
    }
  }
}

const [a, b, observer] = [
  new Connection("A"),
  new Connection("B"),
  new Connection("observer"),
];

const report = {
  baseline: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  startedAt: new Date().toISOString(),
  container,
  runs: [],
};

let taskId = null;
let userCreated = false;
let failure = null;

async function cleanupTask() {
  if (!taskId) return;

  const existing = await observer.json(`
    SELECT coalesce(
      (
        SELECT to_jsonb(t)
        FROM public.tasks t
        WHERE t.id = ${q(taskId)}
      ),
      'null'::jsonb
    );
  `);

  assert(
    !existing || (existing.user_id === owner && existing.title === title),
    "Refusing to delete a Task outside this fixture",
  );

  await observer.ok(`
    DELETE FROM public.tasks
    WHERE id = ${q(taskId)}
      AND user_id = ${q(owner)};
  `);
}

async function setup(sourceStatus) {
  await cleanupTask();

  taskId = randomUUID();

  const scheduleId = randomUUID();
  const sessionId = randomUUID();

  // Past missed/skipped fixtures are two days old,
  // safely within the seven-local-day recovery window.
  // Other sessions are currently in their attendance window.
  const historical = ["missed", "skipped"].includes(sourceStatus);

  await observer.ok(`
    INSERT INTO public.tasks (
      id, user_id, title, status
    )
    VALUES (
      ${q(taskId)}, ${q(owner)}, ${q(title)}, 'todo'
    );

    INSERT INTO public.task_study_schedules (
      id, task_id, user_id,
      starts_on, ends_on, timezone
    )
    SELECT
      ${q(scheduleId)},
      ${q(taskId)},
      ${q(owner)},
      (now() AT TIME ZONE z)::date - 10,
      (now() AT TIME ZONE z)::date + 1,
      z
    FROM (
      SELECT CASE
        WHEN EXTRACT(HOUR FROM now() AT TIME ZONE 'UTC')
             BETWEEN 6 AND 17
        THEN 'UTC'
        ELSE 'Etc/GMT+12'
      END AS z
    ) t;

    INSERT INTO public.task_study_sessions (
      id, user_id, task_id, schedule_id,
      schedule_revision, logical_occurrence_key,
      local_date, local_start_time, local_end_time,
      timezone, scheduled_start_at, scheduled_end_at,
      status, updated_at
    )
    SELECT
      ${q(sessionId)},
      ${q(owner)},
      ${q(taskId)},
      ${q(scheduleId)},
      1,
      'attendance-cc',
      (x.starts_at AT TIME ZONE s.timezone)::date,
      (x.starts_at AT TIME ZONE s.timezone)::time,
      (x.ends_at AT TIME ZONE s.timezone)::time,
      s.timezone,
      x.starts_at,
      x.ends_at,
      ${q(sourceStatus)},
      now() - interval '10 minutes'
    FROM public.task_study_schedules s
    CROSS JOIN LATERAL (
      SELECT
        ${
          historical
            ? "now() - interval '2 days'"
            : "now() - interval '20 minutes'"
        } AS starts_at,
        ${
          historical
            ? "now() - interval '2 days' + interval '30 minutes'"
            : "now() + interval '30 minutes'"
        } AS ends_at
    ) x
    WHERE s.id = ${q(scheduleId)};
  `);

  const version = await observer.ok(`
    SELECT updated_at
    FROM public.task_study_sessions
    WHERE id = ${q(sessionId)};
  `);

  return {
    taskId,
    scheduleId,
    sessionId,
    version,
  };
}

function command(name, fixture, key) {
  const { sessionId, version } = fixture;

  const args = `${q(sessionId)},${q(version)},${q(key)}`;

  switch (name) {
    case "start":
      return `SELECT public.ls_start_study_session(${args});`;
    case "complete":
      return `SELECT public.ls_complete_study_session(${args});`;
    case "skip":
      return `SELECT public.ls_skip_study_session(${args},NULL);`;
    case "recover":
      return `SELECT public.ls_recover_study_session(${args});`;
    default:
      throw new Error(`Unknown attendance command: ${name}`);
  }
}

async function snapshot(fixture) {
  return observer.json(`
    SELECT jsonb_build_object(
      'session', (
        SELECT to_jsonb(s)
        FROM public.task_study_sessions s
        WHERE s.id = ${q(fixture.sessionId)}
      ),
      'taskStatus', (
        SELECT status::text
        FROM public.tasks
        WHERE id = ${q(fixture.taskId)}
      ),
      'events', coalesce((
        SELECT jsonb_agg(
          to_jsonb(e)
          ORDER BY e.created_at, e.id
        )
        FROM public.task_study_session_events e
        WHERE e.session_id = ${q(fixture.sessionId)}
      ), '[]'::jsonb)
    );
  `);
}

async function observeBlocker() {
  const deadline = Date.now() + 3500;

  while (Date.now() < deadline) {
    const blockers = await observer.json(`
      SELECT to_json(
        pg_blocking_pids(${b.pid})
      );
    `);

    if (blockers.includes(a.pid)) {
      return blockers;
    }

    await wait(30);
  }

  throw new Error("Worker B was not observed waiting for worker A");
}

async function prepareOverdue(fixture) {
  // This fixture is older than the 60-minute grace cutoff.
  // Capture one instant: separate clock_timestamp() calls can differ by
  // microseconds and violate the exact UTC/local canonicalization guard.
  // Derive every wall-clock field in the historical Session timezone.
  await observer.ok(`
    WITH fixture_clock AS MATERIALIZED (
      SELECT pg_catalog.clock_timestamp() AS anchor
    ), fixture_times AS (
      SELECT
        anchor - interval '150 minutes' AS starts_at,
        anchor - interval '90 minutes' AS ends_at,
        anchor - interval '10 minutes' AS updated_at
      FROM fixture_clock
    )
    UPDATE public.task_study_sessions s
    SET
      scheduled_start_at = t.starts_at,
      scheduled_end_at = t.ends_at,
      local_date = (t.starts_at AT TIME ZONE s.timezone)::date,
      local_start_time = (t.starts_at AT TIME ZONE s.timezone)::time,
      local_end_time = (t.ends_at AT TIME ZONE s.timezone)::time,
      updated_at = t.updated_at
    FROM fixture_times t
    WHERE s.id = ${q(fixture.sessionId)}
      AND s.user_id = ${q(owner)}
      AND s.status = 'scheduled';
  `);

  const version = await observer.ok(`
    SELECT updated_at
    FROM public.task_study_sessions
    WHERE id = ${q(fixture.sessionId)};
  `);

  return { ...fixture, version };
}

function assertSessionAudit(final, status, eventType) {
  assert(final.session, "Missing final session");

  assert.equal(
    final.session.status,
    status,
    `Unexpected final status: ${status}`,
  );

  assert.equal(
    final.events.length,
    1,
    "Expected exactly one authoritative event",
  );

  assert.equal(final.events[0].event_type, eventType, "Wrong audit event type");

  assert.equal(final.session.actual_study_minutes, null);
  assert.equal(final.session.id, final.events[0].session_id);

  if (status === "completed") {
    assert(final.session.completed_at !== null);
  } else {
    assert.equal(final.session.completed_at, null);
  }
}

async function runSweepFirst(secondCommand, expectedSqlstate) {
  const fixture = await prepareOverdue(await setup("scheduled"));

  // Worker A is trusted, just like the Cron processor.
  await a.begin("service_role");

  const sweep = await a.json(`
    SELECT public.ls_mark_missed_batch(100);
  `);

  assert.equal(sweep.marked, 1);
  assert.equal(sweep.examined, 1);

  // Keep A uncommitted so its Task lock remains held.
  await b.begin("authenticated");

  const pending = b.exec(command(secondCommand, fixture, randomUUID()));

  pending.catch(() => {});

  const blockers = await observeBlocker();

  // B must not continue until A commits.
  await a.ok("COMMIT;");

  const second = await pending;

  assert.equal(
    second.state,
    expectedSqlstate,
    `${secondCommand}: unexpected ${JSON.stringify(second)}`,
  );

  await b.ok("ROLLBACK;");

  const final = await snapshot(fixture);

  assertSessionAudit(final, "missed", "marked_missed");

  assert.equal(final.taskStatus, "todo");
  assert.equal(final.events[0].event_key, `ls:missed:${fixture.sessionId}`);

  report.runs.push({
    name: `sweep-first-vs-${secondCommand}`,
    status: "PASS",
    blockers,
    sweep,
    secondSqlstate: second.state,
    final,
  });

  process.stdout.write(`PASS sweep-first-vs-${secondCommand}\n`);
}

async function runTaskCloseFirst(secondCommand) {
  const fixture = await setup("scheduled");

  await a.begin("authenticated");

  // This fires the existing ls_task_closed_sync trigger.
  await a.ok(`
    UPDATE public.tasks
    SET status = 'completed'
    WHERE id = ${q(fixture.taskId)}
      AND user_id = ${q(owner)};
  `);

  // Task and Schedule changes remain uncommitted.
  await b.begin("authenticated");

  const pending = b.exec(command(secondCommand, fixture, randomUUID()));

  pending.catch(() => {});

  const blockers = await observeBlocker();

  await a.ok("COMMIT;");

  const second = await pending;

  assert.equal(
    second.state,
    "22023",
    `Task close race: unexpected ${JSON.stringify(second)}`,
  );

  await b.ok("ROLLBACK;");

  const final = await snapshot(fixture);

  assert.equal(final.taskStatus, "completed");

  // The fixture session has already started.
  // Task Close cancels future unstarted scheduled
  // occurrences, not historical/current sessions.
  assert.equal(final.session.status, "scheduled");
  assert.equal(final.events.length, 0);
  assert.equal(final.session.completed_at, null);

  const scheduleStatus = await observer.ok(`
    SELECT status
    FROM public.task_study_schedules
    WHERE id = ${q(fixture.scheduleId)};
  `);

  assert.equal(scheduleStatus, "closed");

  report.runs.push({
    name: `task-close-first-vs-${secondCommand}`,
    status: "PASS",
    blockers,
    secondSqlstate: second.state,
    final,
    scheduleStatus,
  });

  process.stdout.write(`PASS task-close-first-vs-${secondCommand}\n`);
}

async function runAttendanceThenClose(attendanceCommand, finalStatus) {
  const fixture = await setup("scheduled");

  await a.begin("authenticated");

  const returnedId = await a.ok(
    command(attendanceCommand, fixture, randomUUID()),
  );

  assert.equal(returnedId, fixture.sessionId);

  await b.begin("authenticated");

  const pending = b.exec(`
    UPDATE public.tasks
    SET status = 'completed'
    WHERE id = ${q(fixture.taskId)}
      AND user_id = ${q(owner)};
  `);

  pending.catch(() => {});

  const blockers = await observeBlocker();

  await a.ok("COMMIT;");

  const second = await pending;

  assert.equal(
    second.state,
    "00000",
    `Task Close failed: ${JSON.stringify(second)}`,
  );

  await b.ok("COMMIT;");

  const final = await snapshot(fixture);

  assert.equal(final.taskStatus, "completed");
  assertSessionAudit(
    final,
    finalStatus,
    attendanceCommand === "complete" ? "completed" : "skipped",
  );

  const scheduleStatus = await observer.ok(`
    SELECT status
    FROM public.task_study_schedules
    WHERE id = ${q(fixture.scheduleId)};
  `);

  assert.equal(scheduleStatus, "closed");

  report.runs.push({
    name: `${attendanceCommand}-first-then-task-close`,
    status: "PASS",
    blockers,
    secondSqlstate: second.state,
    final,
    scheduleStatus,
  });

  process.stdout.write(`PASS ${attendanceCommand}-first-then-task-close\n`);
}

async function runLockedTaskThenSweep() {
  const fixture = await prepareOverdue(await setup("scheduled"));

  await a.begin("authenticated");

  await a.ok(`
    SELECT id
    FROM public.tasks
    WHERE id = ${q(fixture.taskId)}
    FOR UPDATE;
  `);

  await b.begin("service_role");

  const skippedStartedAt = performance.now();
  const skippedBatch = await b.json(`
    SELECT public.ls_mark_missed_batch(100);
  `);
  const skippedElapsedMs = performance.now() - skippedStartedAt;

  assert.equal(skippedBatch.marked, 0);
  assert.equal(skippedBatch.examined, 1);
  // Finish while A still holds the lock, well below lock_timeout (5s).
  assert(skippedElapsedMs < 2000, "SKIP LOCKED batch did not return promptly");

  await b.ok("COMMIT;");

  // The Task is still locked by A; no missed event yet.
  // Use A's own transaction to inspect its locked row,
  // then release the lock.
  const before = await a.json(`
    SELECT jsonb_build_object(
      'status', status,
      'eventCount', (
        SELECT count(*)
        FROM public.task_study_session_events
        WHERE session_id = ${q(fixture.sessionId)}
      )
    )
    FROM public.task_study_sessions
    WHERE id = ${q(fixture.sessionId)};
  `);

  assert.equal(before.status, "scheduled");
  assert.equal(before.eventCount, 0);

  await a.ok("COMMIT;");

  // Retry in a new trusted transaction.
  await b.begin("service_role");

  const retriedBatch = await b.json(`
    SELECT public.ls_mark_missed_batch(100);
  `);

  assert.equal(retriedBatch.marked, 1);

  await b.ok("COMMIT;");

  const final = await snapshot(fixture);

  assertSessionAudit(final, "missed", "marked_missed");

  report.runs.push({
    name: "locked-task-sweep-retry",
    status: "PASS",
    skippedBatch,
    skippedElapsedMs,
    skippedMaxElapsedMs: 2000,
    retriedBatch,
    final,
  });

  process.stdout.write("PASS locked-task-sweep-retry\n");
}

async function runRace({
  name,
  source,
  first,
  second,
  exactKey = false,
  expectedStatus,
  expectedFinalStatus,
  expectedEvents,
}) {
  const fixture = await setup(source);

  const keyA = randomUUID();
  const keyB = exactKey ? keyA : randomUUID();

  await a.begin();

  // A takes the Task lock, then executes its full command.
  // Its uncommitted transaction retains all row locks.
  await a.ok(`
    SELECT id
    FROM public.tasks
    WHERE id = ${q(fixture.taskId)}
    FOR UPDATE;
  `);

  const firstId = await a.ok(command(first, fixture, keyA));

  assert.equal(
    firstId,
    fixture.sessionId,
    `${name}: first command returned unexpected ID`,
  );

  await b.begin();

  const pending = b.exec(command(second, fixture, keyB));

  // Prevent unhandled rejection while awaiting the blocker.
  pending.catch(() => {});

  const blockers = await observeBlocker();

  await a.ok("COMMIT;");

  const secondResult = await pending;

  assert.equal(
    secondResult.state,
    expectedStatus,
    `${name}: unexpected SQLSTATE ` + JSON.stringify(secondResult),
  );

  if (secondResult.state === "00000") {
    assert.equal(
      secondResult.text,
      fixture.sessionId,
      `${name}: retry returned different ID`,
    );

    await b.ok("COMMIT;");
  } else {
    await b.ok("ROLLBACK;");
  }

  const final = await snapshot(fixture);

  assert.equal(
    final.session.status,
    expectedFinalStatus,
    `${name}: incorrect final Session state`,
  );

  assert.equal(
    final.events.length,
    expectedEvents,
    `${name}: incorrect audit count`,
  );

  assert.equal(
    final.taskStatus,
    "todo",
    `${name}: Task status unexpectedly changed`,
  );

  assert.equal(
    final.session.actual_study_minutes,
    null,
    `${name}: fake Focus minutes recorded`,
  );

  const keys = final.events.map((event) => event.event_key);

  assert.equal(new Set(keys).size, keys.length, `${name}: duplicate event key`);

  if (expectedFinalStatus === "completed") {
    assert(final.session.completed_at, `${name}: missing completed_at`);
  } else {
    assert.equal(
      final.session.completed_at,
      null,
      `${name}: unexpected completed_at`,
    );
  }

  report.runs.push({
    name,
    status: "PASS",
    blockedBy: blockers,
    first,
    second,
    secondSqlstate: secondResult.state,
    finalStatus: final.session.status,
    eventTypes: final.events.map((e) => e.event_type),
    final,
  });

  process.stdout.write(`PASS ${name}\n`);
}

try {
  await Promise.all([a, b, observer].map((connection) => connection.init()));

  assert.equal(
    new Set([a.pid, b.pid, observer.pid]).size,
    3,
    "Harness does not have three independent DB backends",
  );

  report.backendPids = { a: a.pid, b: b.pid, observer: observer.pid };

  await observer.ok(`
    INSERT INTO auth.users(id,email)
    VALUES (${q(owner)},${q(email)});

    INSERT INTO public.profiles(id)
    VALUES (${q(owner)})
    ON CONFLICT DO NOTHING;
  `);

  userCreated = true;

  const sweepGate = await observer.json(`
  SELECT jsonb_build_object(
    'enabled', enabled
  )
  FROM public.ls_missed_sweep_control
  WHERE singleton = true;
`);

  assert.deepEqual(
    sweepGate,
    { enabled: false },
    "Missed Sweep Cron gate must remain disabled",
  );
  report.sweepGateBefore = sweepGate.enabled;

  const job = await observer.json(`
  SELECT jsonb_build_object(
    'jobname', jobname,
    'schedule', schedule,
    'active', active
  )
  FROM cron.job
  WHERE jobname = 'lumivox-learning-schedule-missed-5m';
`);

  assert.deepEqual(job, {
    jobname: "lumivox-learning-schedule-missed-5m",
    schedule: "*/5 * * * *",
    active: true,
  });

  for (let iteration = 1; iteration <= 3; iteration++) {
    await runSweepFirst("complete", "22023");
    await runSweepFirst("start", "22023");
    await runSweepFirst("skip", "PT409");
    await runSweepFirst("recover", "PT409");

    await runTaskCloseFirst("start");
    await runTaskCloseFirst("complete");
    await runTaskCloseFirst("skip");

    await runAttendanceThenClose("complete", "completed");
    await runAttendanceThenClose("skip", "skipped");

    await runLockedTaskThenSweep();
  }

  report.status = "PASS";
} catch (error) {
  failure = error;
  report.status = "FAIL";
  report.failure = String(error.stack ?? error);
} finally {
  // Abort unfinished worker transactions before cleanup.
  for (const connection of [a, b]) {
    await connection.exec("ROLLBACK;").catch(() => {});
  }

  if (userCreated) {
    try {
      await cleanupTask();

      await observer.ok(`
        DELETE FROM auth.users
        WHERE id = ${q(owner)}
          AND email = ${q(email)};
      `);

      const remaining = Number(
        await observer.ok(`
        SELECT count(*)
        FROM auth.users
        WHERE id = ${q(owner)};
      `),
      );

      assert.equal(remaining, 0);

      const transactions = Number(
        await observer.ok(`
        SELECT count(*)
        FROM pg_stat_activity
        WHERE pid IN (${a.pid},${b.pid})
          AND xact_start IS NOT NULL;
      `),
      );

      assert.equal(transactions, 0);

      report.openWorkerTransactions = transactions;

      const remainingLocks = Number(
        await observer.ok(`
  SELECT count(*)
  FROM pg_locks
  WHERE pid IN (${a.pid}, ${b.pid});
`),
      );

      assert.equal(remainingLocks, 0, "Worker locks survived cleanup");

      report.remainingWorkerLocks = remainingLocks;

      const finalGate = await observer.json(`
        SELECT jsonb_build_object('enabled', enabled)
        FROM public.ls_missed_sweep_control WHERE singleton=true;
      `);
      report.sweepGateAfter = finalGate.enabled;
      assert.equal(report.sweepGateAfter, false);

      report.cleanup = "PASS";
    } catch (error) {
      failure ??= error;
      report.status = "FAIL";
      report.cleanup = "FAIL";
      report.cleanupError = String(error.stack ?? error);
    }
  }

  await Promise.all([a, b, observer].map((connection) => connection.close()));

  report.finishedAt = new Date().toISOString();

  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
}

if (failure) {
  process.stderr.write(String(failure.stack ?? failure) + "\n");
  process.exitCode = 1;
} else {
  process.stdout.write(`PASS: ${report.runs.length} attendance races\n`);
}
