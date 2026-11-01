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
  "docs/learning-schedule/phase-05-attendance-first-sweep.json",
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


async function prepareBeforeSweepDeadline(fixture) {
  // The grace cutoff is six seconds after the captured
  // PostgreSQL clock instant.
  //
  // All UTC and wall-clock fields share one anchor
  // to satisfy the existing canonicalization guard.
  await observer.ok(`
    WITH anchor AS MATERIALIZED (
      SELECT pg_catalog.clock_timestamp() AS at
    ),
    times AS (
      SELECT
        at - interval '90 minutes'
           + interval '6 seconds' AS starts_at,
        at - interval '60 minutes'
           + interval '6 seconds' AS ends_at,
        at - interval '10 minutes' AS version_at
      FROM anchor
    )
    UPDATE public.task_study_sessions s
    SET
      scheduled_start_at = t.starts_at,
      scheduled_end_at = t.ends_at,
      local_date =
        (t.starts_at AT TIME ZONE s.timezone)::date,
      local_start_time =
        (t.starts_at AT TIME ZONE s.timezone)::time,
      local_end_time =
        (t.ends_at AT TIME ZONE s.timezone)::time,
      updated_at = t.version_at
    FROM times t
    WHERE s.id = ${q(fixture.sessionId)}
      AND s.user_id = ${q(owner)}
      AND s.status = 'scheduled';
  `);

  const timing = await observer.json(`
    SELECT pg_catalog.jsonb_build_object(
      'version', updated_at,
      'deadline',
        scheduled_end_at + interval '60 minutes',
      'startAt', scheduled_start_at,
      'endAt', scheduled_end_at
    )
    FROM public.task_study_sessions
    WHERE id = ${q(fixture.sessionId)};
  `);

  assert(timing, "Fixture not found");

  const remaining = Number(await observer.ok(`
    SELECT EXTRACT(EPOCH FROM (
      ${q(timing.deadline)}::timestamptz
      - pg_catalog.clock_timestamp()
    ));
  `));

  assert(
    remaining > 1,
    "Fixture deadline too close for a valid pre-cutoff command",
  );

  return {
    ...fixture,
    version: timing.version,
    deadline: timing.deadline,
    timing,
  };
}



async function assertNoOtherOverdueCandidates(fixture) {
  const count = Number(await observer.ok(`
    SELECT count(*)
    FROM public.task_study_sessions
    WHERE status = 'scheduled'
      AND scheduled_end_at <=
        pg_catalog.clock_timestamp() - interval '60 minutes'
      AND id <> ${q(fixture.sessionId)};
  `));

  assert.equal(
    count,
    0,
    "Refusing trusted Sweep: unrelated overdue local sessions exist",
  );
}



async function runAttendanceFirstSweep(commandName, iteration) {
  const fixture = await prepareBeforeSweepDeadline(
    await setup("scheduled"),
  );

  const name = `SWR-${commandName}-${iteration}`;
  const eventKey = randomUUID();

  await assertNoOtherOverdueCandidates(fixture);

  // A authenticates as the actual fixture owner.
  await a.begin("authenticated");

  // Attendance must complete before the grace deadline,
  // while A keeps its transaction open afterward.
  const returnedId = await a.ok(
    command(commandName, fixture, eventKey),
  );

  assert.equal(
    returnedId,
    fixture.sessionId,
    `${name}: command returned a different Session ID`,
  );

  const attendanceFinishedAt = await a.ok(`
    SELECT pg_catalog.clock_timestamp();
  `);

  assert(
    Date.parse(attendanceFinishedAt)
      < Date.parse(fixture.deadline),
    `${name}: Attendance did not finish before cutoff`,
  );

  // Observer still sees the committed OLD Session row.
  const beforeCommit = await snapshot(fixture);

  assert.equal(
    beforeCommit.session.status,
    "scheduled",
    `${name}: uncommitted attendance became visible`,
  );

  assert.equal(beforeCommit.events.length, 0);

  // Wait until after deadline while A still owns Task,
  // Schedule and Session locks.
  await observer.ok(`
    SELECT pg_catalog.pg_sleep(
      GREATEST(
        0,
        EXTRACT(EPOCH FROM (
          ${q(fixture.deadline)}::timestamptz
          - pg_catalog.clock_timestamp()
        )) + 0.25
      )
    );
  `);

  const crossing = await observer.json(`
    SELECT pg_catalog.jsonb_build_object(
      'afterDeadline', pg_catalog.clock_timestamp(),
      'deadline', ${q(fixture.deadline)}::timestamptz
    );
  `);

  assert(
    Date.parse(crossing.afterDeadline)
      >= Date.parse(crossing.deadline),
    `${name}: grace cutoff has not passed`,
  );

  // Verify that no unrelated expired candidates exist
  // immediately before the trusted batch.
  await assertNoOtherOverdueCandidates(fixture);

  // B is the trusted Sweep worker.
  await b.begin("service_role");

  const started = performance.now();

  const skipped = await b.json(`
    SELECT public.ls_mark_missed_batch(100);
  `);

  const elapsedMs = performance.now() - started;

  assert.equal(
    skipped.marked,
    0,
    `${name}: Sweep changed a locked attendance Session`,
  );

  assert.equal(
    skipped.examined,
    1,
    `${name}: Sweep did not examine the overdue candidate`,
  );

  assert(
    elapsedMs < 2000,
    `${name}: SKIP LOCKED unexpectedly waited ${elapsedMs} ms`,
  );

  await b.ok("COMMIT;");

  // A has not committed yet: observer still sees scheduled.
  const stillUncommitted = await snapshot(fixture);

  assert.equal(stillUncommitted.session.status, "scheduled");
  assert.equal(stillUncommitted.events.length, 0);

  // Commit the valid attendance transition.
  await a.ok("COMMIT;");

  const afterAttendance = await snapshot(fixture);

  const expected = {
    start: {
      status: "in_progress",
      eventType: "started",
    },
    complete: {
      status: "completed",
      eventType: "completed",
    },
    skip: {
      status: "skipped",
      eventType: "skipped",
    },
  }[commandName];

  assert(expected, `${name}: unknown command`);

  assert.equal(afterAttendance.session.status, expected.status);
  assert.equal(afterAttendance.events.length, 1);

  assert.equal(
    afterAttendance.events[0].event_type,
    expected.eventType,
  );

  assert.equal(
    afterAttendance.events[0].event_key,
    eventKey,
  );

  assert.equal(
    afterAttendance.session.actual_study_minutes,
    null,
  );

  assert.equal(afterAttendance.taskStatus, "todo");

  assert.equal(
    afterAttendance.session.completed_at !== null,
    commandName === "complete",
  );

  // After A commits, a new Sweep pass must still
  // preserve the already-committed Attendance outcome.
  await assertNoOtherOverdueCandidates(fixture);
  await b.begin("service_role");

  const retried = await b.json(`
    SELECT public.ls_mark_missed_batch(100);
  `);

  assert.equal(retried.marked, 0);
  await b.ok("COMMIT;");

  const final = await snapshot(fixture);

  // Comparing full persisted data catches changes to
  // updated_at, completed_at and audit payloads.
  assert.deepEqual(
    final,
    afterAttendance,
    `${name}: repeated Sweep mutated attendance history`,
  );

  assert(
    !final.events.some(e => e.event_type === "marked_missed"),
    `${name}: a false missed audit was generated`,
  );

  report.runs.push({
    name,
    status: "PASS",
    backendPids: {
      attendance: a.pid,
      sweep: b.pid,
      observer: observer.pid,
    },
    attendanceFinishedAt,
    crossing,
    firstSweep: skipped,
    firstSweepElapsedMs: elapsedMs,
    retrySweep: retried,
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

const gate = await observer.json(`
  SELECT pg_catalog.jsonb_build_object(
    'enabled', enabled
  )
  FROM public.ls_missed_sweep_control
  WHERE singleton = true;
`);

assert.deepEqual(
  gate,
  { enabled: false },
  "Cron gate must remain OFF",
);

report.backendPids = {
  a: a.pid,
  b: b.pid,
  observer: observer.pid,
};

report.sweepGateBefore = false;

for (let iteration = 1; iteration <= 3; iteration++) {
  await runAttendanceFirstSweep("start", iteration);
  await runAttendanceFirstSweep("complete", iteration);
  await runAttendanceFirstSweep("skip", iteration);
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
  process.stdout.write(`PASS: ${report.runs.length} attendance-first Sweep races\n`);
}
