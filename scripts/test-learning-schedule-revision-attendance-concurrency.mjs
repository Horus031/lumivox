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
  "docs/learning-schedule/phase-05-revision-attendance-concurrency.json",
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

async function prepareFuture(fixture) {
  // A future session tomorrow from 19:00 to 20:00,
  // always expressed in its saved IANA timezone.
  //
  // Derive local and UTC values from the SAME date/time
  // to satisfy Lumivox's canonicalization constraints.
  await observer.ok(`
    WITH local_plan AS MATERIALIZED (
      SELECT
        s.timezone,
        (
          pg_catalog.clock_timestamp()
            AT TIME ZONE s.timezone
        )::date + 1 AS planned_date
      FROM public.task_study_schedules s
      WHERE s.id = ${q(fixture.scheduleId)}
    ),
    instants AS (
      SELECT
        planned_date,
        timezone,
        (
          (planned_date + time '19:00')
            AT TIME ZONE timezone
        ) AS starts_at,
        (
          (planned_date + time '20:00')
            AT TIME ZONE timezone
        ) AS ends_at
      FROM local_plan
    )
    UPDATE public.task_study_sessions x
    SET
      local_date = t.planned_date,
      local_start_time = time '19:00',
      local_end_time = time '20:00',
      scheduled_start_at = t.starts_at,
      scheduled_end_at = t.ends_at,
      updated_at = pg_catalog.clock_timestamp()
                   - interval '10 minutes'
    FROM instants t
    WHERE x.id = ${q(fixture.sessionId)}
      AND x.user_id = ${q(owner)}
      AND x.status = 'scheduled';
  `);

  const version = await observer.ok(`
    SELECT updated_at
    FROM public.task_study_sessions
    WHERE id = ${q(fixture.sessionId)};
  `);

  const prepared = await snapshot(fixture);

  assert.equal(prepared.session.status, "scheduled");
  assert(
    Date.parse(prepared.session.scheduled_start_at) > Date.now(),
    "Future fixture must start after current time",
  );

  return { ...fixture, version };
}

function reviseCommand(fixture) {
  return `
    WITH plan AS MATERIALIZED (
      SELECT
        s.timezone,
        (
          pg_catalog.clock_timestamp()
            AT TIME ZONE s.timezone
        )::date + 1 AS planned_date
      FROM public.task_study_schedules s
      WHERE s.id = ${q(fixture.scheduleId)}
    ),
    occurrences AS (
      SELECT
        timezone,
        planned_date,
        EXTRACT(ISODOW FROM planned_date)::integer
          AS weekday,
        (
          (planned_date + time '20:00')
            AT TIME ZONE timezone
        ) AS start_at,
        (
          (planned_date + time '21:00')
            AT TIME ZONE timezone
        ) AS end_at
      FROM plan
    )
    SELECT public.ls_revise_schedule(
      ${q(fixture.scheduleId)},
      1,
      planned_date,
      planned_date,
      timezone,
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'weekday', weekday,
          'startTime', '20:00',
          'endTime', '21:00'
        )
      ),
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'localDate', planned_date::text,
          'localStartTime', '20:00',
          'localEndTime', '21:00',
          'timezone', timezone,
          'scheduledStartAt', start_at,
          'scheduledEndAt', end_at,
          'slotIndex', 0,
          'occurrenceKey',
            planned_date::text || '|'
            || weekday::text
            || '|20:00|21:00'
        )
      )
    )
    FROM occurrences;
  `;
}

async function runRevisionRace(scenario, iteration) {
  const fixture = scenario.future
    ? await prepareFuture(await setup("scheduled"))
    : await setup(scenario.source);

  const eventKey = randomUUID();

  const sqlFor = (operation) => {
    if (operation === "revise") {
      return reviseCommand(fixture);
    }

    return command(operation, fixture, eventKey);
  };

  const name = `${scenario.name}/iteration-${iteration}`;

  // A commits first, B is already waiting.
  await a.begin("authenticated");

  const firstResult = await a.ok(sqlFor(scenario.first));

  assert.equal(
    firstResult,
    scenario.first === "revise" ? "2" : fixture.sessionId,
    `${name}: first command returned unexpected result`,
  );

  await b.begin("authenticated");

  const pending = b.exec(sqlFor(scenario.second));

  pending.catch(() => {});

  // Must observe the real PostgreSQL wait.
  const blockers = await observeBlocker();

  await a.ok("COMMIT;");

  const secondResult = await pending;

  assert.equal(
    secondResult.state,
    scenario.secondSqlstate,
    `${name}: unexpected second SQLSTATE: ` + JSON.stringify(secondResult),
  );

  if (secondResult.state === "00000") {
    assert.equal(
      secondResult.text,
      scenario.second === "revise" ? "2" : fixture.sessionId,
      `${name}: wrong second result`,
    );

    await b.ok("COMMIT;");
  } else {
    await b.ok("ROLLBACK;");
  }

  const final = await snapshot(fixture);

  const schedule = await observer.json(`
    SELECT jsonb_build_object(
      'id', id,
      'revision', revision,
      'status', status
    )
    FROM public.task_study_schedules
    WHERE id = ${q(fixture.scheduleId)};
  `);

  const sessions = await observer.json(`
    SELECT coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', id,
          'status', status,
          'revision', schedule_revision,
          'logicalKey', logical_occurrence_key,
          'cancellationReason', cancellation_reason
        )
        ORDER BY schedule_revision, id
      ),
      '[]'::jsonb
    )
    FROM public.task_study_sessions
    WHERE schedule_id = ${q(fixture.scheduleId)};
  `);

  assert.equal(
    final.taskStatus,
    "todo",
    `${name}: parent Task mutated unexpectedly`,
  );

  assert.equal(
    schedule.status,
    "active",
    `${name}: Schedule unexpectedly closed`,
  );

  assert.equal(
    schedule.revision,
    scenario.expectedRevision,
    `${name}: wrong revision`,
  );

  assert.equal(
    sessions.length,
    scenario.expectedSessionCount,
    `${name}: wrong number of sessions`,
  );

  assert.equal(
    final.session.status,
    scenario.expectedOldStatus,
    `${name}: historical session status changed incorrectly`,
  );

  assert.equal(
    final.events.length,
    scenario.expectedOldEvents.length,
    `${name}: unexpected old-session audit count`,
  );

  assert.deepEqual(
    final.events.map((e) => e.event_type),
    scenario.expectedOldEvents,
    `${name}: incorrect audit history`,
  );

  assert.equal(
    final.session.actual_study_minutes,
    null,
    `${name}: fabricated study minutes`,
  );

  if (scenario.expectedOldStatus === "completed") {
    assert(
      final.session.completed_at !== null,
      `${name}: completed_at missing`,
    );
  } else {
    assert.equal(
      final.session.completed_at,
      null,
      `${name}: unexpected completion timestamp`,
    );
  }

  if (scenario.expectedOldStatus === "cancelled") {
    assert.equal(
      final.session.cancellation_reason,
      "schedule_changed",
      `${name}: incorrect cancellation reason`,
    );
  }

  if (scenario.expectedRevision === 2) {
    const newOccurrences = sessions.filter((x) => x.revision === 2);

    assert.equal(
      newOccurrences.length,
      1,
      `${name}: expected one revised occurrence`,
    );

    assert.equal(
      newOccurrences[0].status,
      "scheduled",
      `${name}: revised occurrence must be scheduled`,
    );

    assert.notEqual(
      newOccurrences[0].id,
      fixture.sessionId,
      `${name}: revised occurrence reused historical ID`,
    );
  }

  const eventKeys = final.events.map((e) => e.event_key);

  assert.equal(
    new Set(eventKeys).size,
    eventKeys.length,
    `${name}: duplicate audit event key`,
  );

  report.runs.push({
    name,
    status: "PASS",
    first: scenario.first,
    second: scenario.second,
    blockers,
    secondSqlstate: secondResult.state,
    originalSessionId: fixture.sessionId,
    final,
    schedule,
    sessions,
  });

  process.stdout.write(`PASS ${name}\n`);
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

const scenarios = [
  {
    name: "REV-01 revise-first-vs-future-skip",
    source: "scheduled",
    future: true,
    first: "revise",
    second: "skip",
    secondSqlstate: "22023",
    expectedRevision: 2,
    expectedOldStatus: "cancelled",
    expectedOldEvents: ["cancelled"],
    expectedSessionCount: 2,
  },
  {
    name: "REV-02 future-skip-first-vs-revise",
    source: "scheduled",
    future: true,
    first: "skip",
    second: "revise",
    secondSqlstate: "00000",
    expectedRevision: 2,
    expectedOldStatus: "skipped",
    expectedOldEvents: ["skipped"],
    expectedSessionCount: 2,
  },
  {
    name: "REV-03 start-first-vs-revise",
    source: "scheduled",
    future: false,
    first: "start",
    second: "revise",
    secondSqlstate: "22023",
    expectedRevision: 1,
    expectedOldStatus: "in_progress",
    expectedOldEvents: ["started"],
    expectedSessionCount: 1,
  },
  {
    name: "REV-04 revise-first-vs-recovery",
    source: "missed",
    future: false,
    first: "revise",
    second: "recover",
    secondSqlstate: "00000",
    expectedRevision: 2,
    expectedOldStatus: "completed",
    expectedOldEvents: ["recovered"],
    expectedSessionCount: 2,
  },
  {
    name: "REV-05 recovery-first-vs-revise",
    source: "missed",
    future: false,
    first: "recover",
    second: "revise",
    secondSqlstate: "00000",
    expectedRevision: 2,
    expectedOldStatus: "completed",
    expectedOldEvents: ["recovered"],
    expectedSessionCount: 2,
  },
  {
    name: "REV-06 complete-first-vs-revise",
    source: "scheduled",
    future: false,
    first: "complete",
    second: "revise",
    secondSqlstate: "00000",
    expectedRevision: 2,
    expectedOldStatus: "completed",
    expectedOldEvents: ["completed"],
    expectedSessionCount: 2,
  },
];

try {
  await Promise.all([a, b, observer].map((connection) => connection.init()));

  assert.equal(
    new Set([a.pid, b.pid, observer.pid]).size,
    3,
    "Harness does not have three independent DB backends",
  );

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
    "Cron processing gate must be OFF",
  );

  report.backendPids = {
    a: a.pid,
    b: b.pid,
    observer: observer.pid,
  };

  for (let iteration = 1; iteration <= 3; iteration++) {
    for (const scenario of scenarios) {
      await runRevisionRace(scenario, iteration);
    }
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
  process.stdout.write(
    `PASS: ${report.runs.length} revision-attendance races\n`,
  );
}
