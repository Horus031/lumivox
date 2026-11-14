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

const reportPath = resolve(root, "docs/learning-schedule/phase-05-lifecycle-concurrency.json");

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
      ["exec", "-i", container, "psql", "-X", "-A", "-t", "-q", "-U", "postgres", "-d", "postgres"],
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

    createInterface({ input: this.child.stderr }).on("line", (line) => this.stderr.push(line));

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

      const state = lines.findLast((x) => x.startsWith("__LS_SQLSTATE "))?.split(" ")[1];

      const message = lines
        .findLast((x) => x.startsWith("__LS_LAST_ERROR "))
        ?.slice("__LS_LAST_ERROR ".length);

      return {
        state,
        message: state === "00000" ? null : message,
        text: lines
          .filter((x) => !x.startsWith("__LS_SQLSTATE ") && !x.startsWith("__LS_LAST_ERROR "))
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
      `${this.name}: ${result.state}: ` + `${result.message ?? ""}\n${result.errors.join("\n")}`,
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
    assert(["authenticated", "service_role"].includes(role), "Unexpected test role");

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

    await Promise.race([new Promise((done) => this.child.once("exit", done)), wait(2000)]);

    if (this.child.exitCode === null) {
      this.child.kill();
    }
  }
}

const [a, b, observer] = [new Connection("A"), new Connection("B"), new Connection("observer")];

const report = {
  baseline: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
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
        ${historical ? "now() - interval '2 days'" : "now() - interval '20 minutes'"} AS starts_at,
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

async function prepareFutureLifecycle(fixture) {
  await observer.ok(`
    WITH plan AS MATERIALIZED (
      SELECT
        timezone,
        (
          pg_catalog.clock_timestamp()
          AT TIME ZONE timezone
        )::date + 1 AS local_day
      FROM public.task_study_schedules
      WHERE id = ${q(fixture.scheduleId)}
    ),
    instants AS (
      SELECT
        local_day,
        (local_day + time '19:00')
          AT TIME ZONE timezone AS starts_at,
        (local_day + time '20:00')
          AT TIME ZONE timezone AS ends_at
      FROM plan
    )
    UPDATE public.task_study_sessions s
    SET
      local_date = i.local_day,
      local_start_time = time '19:00',
      local_end_time = time '20:00',
      scheduled_start_at = i.starts_at,
      scheduled_end_at = i.ends_at,
      updated_at = (
        SELECT pg_catalog.clock_timestamp()
      ) - interval '10 minutes'
    FROM instants i
    WHERE s.id = ${q(fixture.sessionId)}
      AND s.user_id = ${q(owner)}
      AND s.status = 'scheduled';
  `);

  const version = await observer.ok(`
    SELECT updated_at
    FROM public.task_study_sessions
    WHERE id = ${q(fixture.sessionId)};
  `);

  const state = await snapshot(fixture);

  assert(
    Date.parse(state.session.scheduled_start_at) > Date.now(),
    "LC-05 must use a future scheduled session",
  );

  return { ...fixture, version };
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

function closeTaskCommand(fixture) {
  return `
    UPDATE public.tasks
    SET status = 'completed'
    WHERE id = ${q(fixture.taskId)}
      AND user_id = ${q(owner)}
    RETURNING id;
  `;
}

async function readScheduleStatus(fixture) {
  return observer.ok(`
    SELECT status
    FROM public.task_study_schedules
    WHERE id = ${q(fixture.scheduleId)};
  `);
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

async function runLifecycleRace(scenario, iteration) {
  let fixture = await setup(scenario.source);

  if (scenario.future) {
    fixture = await prepareFutureLifecycle(fixture);
  }

  const name = `${scenario.name}/iteration-${iteration}`;
  const eventKey = randomUUID();

  const sqlFor = (operation) =>
    operation === "close" ? closeTaskCommand(fixture) : command(operation, fixture, eventKey);

  // A executes the first operation but does not commit.
  await a.begin("authenticated");

  const firstResult = await a.ok(sqlFor(scenario.first));

  assert.equal(
    firstResult,
    scenario.first === "close" ? fixture.taskId : fixture.sessionId,
    `${name}: wrong first result`,
  );

  // B issues the competing operation on a distinct backend.
  await b.begin("authenticated");

  const pending = b.exec(sqlFor(scenario.second));

  pending.catch(() => {});

  const blockers = await observeBlocker();

  // Release A only after observer confirms the wait.
  await a.ok("COMMIT;");

  const secondResult = await pending;

  assert.equal(
    secondResult.state,
    scenario.expectedSecondSqlstate,
    `${name}: wrong SQLSTATE ${JSON.stringify(secondResult)}`,
  );

  if (secondResult.state === "00000") {
    assert.equal(
      secondResult.text,
      scenario.second === "close" ? fixture.taskId : fixture.sessionId,
      `${name}: wrong second result`,
    );

    await b.ok("COMMIT;");
  } else {
    await b.ok("ROLLBACK;");
  }

  const beforeReplay = await snapshot(fixture);
  const scheduleStatus = await readScheduleStatus(fixture);

  assert.equal(beforeReplay.taskStatus, "completed", `${name}: Task was not closed`);

  assert.equal(scheduleStatus, "closed", `${name}: Schedule was not closed`);

  assert.equal(
    beforeReplay.session.status,
    scenario.expectedSessionStatus,
    `${name}: wrong Session status`,
  );

  assert.deepEqual(
    beforeReplay.events.map((e) => e.event_type),
    scenario.expectedEventTypes,
    `${name}: wrong audit history`,
  );

  assert.equal(
    beforeReplay.session.actual_study_minutes,
    null,
    `${name}: study minutes were fabricated`,
  );

  assert.equal(
    beforeReplay.session.completed_at !== null,
    scenario.expectedSessionStatus === "completed",
    `${name}: wrong completed_at state`,
  );

  const eventKeys = beforeReplay.events.map((event) => event.event_key);

  assert.equal(new Set(eventKeys).size, eventKeys.length, `${name}: duplicate audit key`);

  if (scenario.future) {
    assert.equal(
      beforeReplay.session.cancellation_reason,
      "task_closed",
      `${name}: missing Task Close cancellation reason`,
    );

    assert.equal(
      beforeReplay.events[0].event_key,
      `ls:task-close:${fixture.sessionId}`,
      `${name}: wrong cancellation event key`,
    );

    assert.equal(beforeReplay.events[0].from_status, "scheduled");

    assert.equal(beforeReplay.events[0].to_status, "cancelled");
  }

  let exactReplay = null;

  if (scenario.retryFirstCommand) {
    // The parent Task is now completed and Schedule closed.
    // Exact retry must still recognize the committed event.
    await b.begin("authenticated");

    const replayResult = await b.ok(sqlFor(scenario.first));

    assert.equal(replayResult, fixture.sessionId, `${name}: exact replay lost committed identity`);

    await b.ok("COMMIT;");

    const afterReplay = await snapshot(fixture);

    // Stronger than checking only event count:
    // every session field and audit event remains unchanged.
    assert.deepEqual(afterReplay, beforeReplay, `${name}: exact replay mutated persisted history`);

    exactReplay = "PASS";
  }

  report.runs.push({
    name,
    status: "PASS",
    blockers,
    first: scenario.first,
    second: scenario.second,
    secondSqlstate: secondResult.state,
    taskStatus: beforeReplay.taskStatus,
    scheduleStatus,
    sessionStatus: beforeReplay.session.status,
    eventTypes: beforeReplay.events.map((e) => e.event_type),
    exactReplay,
    final: beforeReplay,
  });

  process.stdout.write(`PASS ${name}\n`);
}

const scenarios = [
  {
    name: "LC-01-start-first-task-close",
    source: "scheduled",
    first: "start",
    second: "close",
    expectedSecondSqlstate: "00000",
    expectedSessionStatus: "in_progress",
    expectedEventTypes: ["started"],
    retryFirstCommand: true,
  },
  {
    name: "LC-02-recovery-first-task-close",
    source: "missed",
    first: "recover",
    second: "close",
    expectedSecondSqlstate: "00000",
    expectedSessionStatus: "completed",
    expectedEventTypes: ["recovered"],
    retryFirstCommand: true,
  },
  {
    name: "LC-03-task-close-first-recovery",
    source: "missed",
    first: "close",
    second: "recover",
    expectedSecondSqlstate: "22023",
    expectedSessionStatus: "missed",
    expectedEventTypes: [],
  },
  {
    name: "LC-04-skip-first-task-close",
    source: "missed",
    first: "skip",
    second: "close",
    expectedSecondSqlstate: "00000",
    expectedSessionStatus: "skipped",
    expectedEventTypes: ["skipped"],
    retryFirstCommand: true,
  },
  {
    name: "LC-05-task-close-first-future-skip",
    source: "scheduled",
    future: true,
    first: "close",
    second: "skip",
    expectedSecondSqlstate: "22023",
    expectedSessionStatus: "cancelled",
    expectedEventTypes: ["cancelled"],
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

  report.backendPids = {
    a: a.pid,
    b: b.pid,
    observer: observer.pid,
  };

  const gate = await observer.json(`
  SELECT pg_catalog.jsonb_build_object(
    'enabled', enabled
  )
  FROM public.ls_missed_sweep_control
  WHERE singleton = true;
`);

  assert.deepEqual(gate, { enabled: false }, "Sweep gate must remain OFF");

  for (let iteration = 1; iteration <= 3; iteration++) {
    for (const scenario of scenarios) {
      await runLifecycleRace(scenario, iteration);
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
  process.stdout.write(`PASS: ${report.runs.length} lifecycle races\n`);
}
