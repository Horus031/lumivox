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
// LOCAL ONLY: disposable, uniquely owned fixtures; no provider or network SDK.
const email = `notification-cc-${owner}@example.invalid`;
const title = "Notification lifecycle concurrency fixture";

const reportPath = resolve(root, "docs/learning-schedule/phase-07-notification-concurrency.json");

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
        ${q(`lumivox-notification-cc-${this.name}`)};
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
let fixture;

const preference = (enabled) => `SELECT public.ls_set_study_notification_preferences(${enabled});`;
const reschedule =
  () => `SELECT public.ls_reschedule_session(${q(fixture.session)},${q(fixture.version)},
  '2030-01-08','18:00','19:00','2030-01-08T18:00Z','2030-01-08T19:00Z',${q(randomUUID())});`;

async function gates() {
  const result = await observer.json(`SELECT json_build_object(
    'dispatch',(SELECT enabled FROM public.study_notification_dispatch_control),
    'sweep',(SELECT enabled FROM public.ls_missed_sweep_control));`);
  assert.deepEqual(result, { dispatch: false, sweep: false });
  return result;
}

async function cleanupTask() {
  // Both predicates are required: never remove a user's unrelated records.
  await observer.ok(`DELETE FROM public.tasks WHERE user_id=${q(owner)} AND title=${q(title)};`);
}

async function setup(enabled = true) {
  await cleanupTask();
  await a.begin();
  await a.ok(preference(false));
  await a.ok("COMMIT;");
  const task = randomUUID(),
    schedule = randomUUID(),
    session = randomUUID();
  await observer.ok(`
    INSERT INTO public.tasks(id,user_id,title,status) VALUES(${q(task)},${q(owner)},${q(title)},'todo');
    INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone)
      VALUES(${q(schedule)},${q(owner)},${q(task)},'2030-01-07','2030-01-14','UTC');
    INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,
      logical_occurrence_key,local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
      VALUES(${q(session)},${q(owner)},${q(task)},${q(schedule)},1,'cc-original',
        '2030-01-07','10:00','11:00','UTC','2030-01-07T10:00Z','2030-01-07T11:00Z');
  `);
  fixture = {
    task,
    schedule,
    session,
    version: await observer.ok(
      `SELECT updated_at FROM public.task_study_sessions WHERE id=${q(session)};`,
    ),
  };
  if (enabled) {
    await a.begin();
    await a.ok(preference(true));
    await a.ok("COMMIT;");
  }
  assert.equal(
    Number(
      await observer.ok(
        `SELECT count(*) FROM public.study_notification_jobs WHERE user_id=${q(owner)};`,
      ),
    ),
    enabled ? 1 : 0,
  );
}

async function blocked(waiter, blocker) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const pids = await observer.json(`SELECT to_json(pg_blocking_pids(${waiter.pid}));`);
    if (pids.includes(blocker.pid))
      return { waiter: waiter.pid, blocker: blocker.pid, observed: pids };
    await wait(20);
  }
  throw new Error(`${waiter.name} did not visibly block on ${blocker.name}`);
}

async function finalState(expectedJobs) {
  const state = await observer.json(`SELECT json_build_object(
    'enabled',(SELECT study_email_enabled FROM public.study_notification_preferences WHERE user_id=${q(owner)}),
    'sessionStart',(SELECT scheduled_start_at FROM public.task_study_sessions WHERE id=${q(fixture.session)}),
    'events',(SELECT count(*) FROM public.task_study_session_events WHERE session_id=${q(fixture.session)} AND event_type='rescheduled'),
    'jobs',(SELECT count(*) FROM public.study_notification_jobs WHERE user_id=${q(owner)}),
    'suppressed',(SELECT count(*) FROM public.study_notification_jobs WHERE user_id=${q(owner)} AND status='suppressed'),
    'current',(SELECT count(*) FROM public.study_notification_jobs WHERE user_id=${q(owner)} AND public.ls_study_notification_job_is_current(id)),
    'deliveries',(SELECT count(*) FROM public.study_notification_deliveries WHERE user_id=${q(owner)}));`);
  assert.equal(state.enabled, false);
  assert.equal(Date.parse(state.sessionStart), Date.parse("2030-01-08T18:00Z"));
  assert.equal(state.events, 1);
  assert.equal(state.jobs, expectedJobs);
  assert.equal(state.suppressed, expectedJobs);
  assert.equal(state.current, 0);
  assert.equal(state.deliveries, 0);
  return state;
}

try {
  await Promise.all([a.init(), b.init(), observer.init()]);
  report.gatesBefore = await gates();
  await observer.ok(`INSERT INTO auth.users(id,email) VALUES(${q(owner)},${q(email)});
    INSERT INTO public.profiles(id) VALUES(${q(owner)}) ON CONFLICT DO NOTHING;`);
  for (let repeat = 1; repeat <= 4; repeat++) {
    for (const order of ["reschedule-first", "opt-out-first"]) {
      await setup();
      await a.begin();
      await b.begin();
      const first = await a.exec(order === "reschedule-first" ? reschedule() : preference(false));
      assert.equal(first.state, "00000", first.message);
      const pending = b.exec(order === "reschedule-first" ? preference(false) : reschedule());
      const blocker = await blocked(b, a);
      await a.ok("COMMIT;");
      const second = await pending;
      assert.equal(second.state, "00000", second.message);
      await b.ok("COMMIT;");
      report.runs.push({
        repeat,
        order,
        blocker,
        states: [first.state, second.state],
        final: await finalState(1),
      });
    }
  }
  // Force the reverse FK-lock hazard: opt-in waits first for the owner gate,
  // then reschedule holds the Session lock. Enqueue must fail NOWAIT, release
  // its entire transaction, and allow reschedule to commit without deadlock.
  await setup(false);
  await observer.ok(`BEGIN; SELECT public.ls_notification_lock_owner(${q(owner)});`);
  await b.begin();
  const optIn = b.exec(preference(true));
  const optInBlocker = await blocked(b, observer);
  await a.begin();
  const move = a.exec(reschedule());
  const moveBlocker = await blocked(a, observer);
  await observer.ok("COMMIT;");
  const failedOptIn = await optIn;
  assert.equal(failedOptIn.state, "55P03", failedOptIn.message);
  await b.ok("ROLLBACK;");
  const moved = await move;
  assert.equal(moved.state, "00000", moved.message);
  await a.ok("COMMIT;");
  report.runs.push({
    order: "opt-in-FK-fail-fast",
    blockers: [optInBlocker, moveBlocker],
    states: [failedOptIn.state, moved.state],
    final: await finalState(0),
  });
  // Retry the full command after contention clears, not a partial sub-operation.
  await b.begin();
  await b.ok(preference(true));
  await b.ok("COMMIT;");
  report.retry = await observer.json(`SELECT json_build_object('pending',count(*),'due',min(due_at))
    FROM public.study_notification_jobs WHERE user_id=${q(owner)} AND status='pending';`);
  assert.equal(report.retry.pending, 1);
  assert.equal(Date.parse(report.retry.due), Date.parse("2030-01-08T17:45Z"));
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = String(error.stack ?? error);
  process.exitCode = 1;
} finally {
  // Release test transactions before cleanup, including on assertion failure.
  await Promise.all([a.close(), b.close()]);
  try {
    await observer.ok("ROLLBACK;");
    await cleanupTask();
    await observer.ok(`DELETE FROM auth.users WHERE id=${q(owner)} AND email=${q(email)};`);
    report.cleanup = await observer.json(`SELECT json_build_object(
      'users',(SELECT count(*) FROM auth.users WHERE id=${q(owner)}),
      'tasks',(SELECT count(*) FROM public.tasks WHERE user_id=${q(owner)}),
      'jobs',(SELECT count(*) FROM public.study_notification_jobs WHERE user_id=${q(owner)}),
      'deliveries',(SELECT count(*) FROM public.study_notification_deliveries WHERE user_id=${q(owner)}));`);
    assert.deepEqual(report.cleanup, { users: 0, tasks: 0, jobs: 0, deliveries: 0 });
    report.gatesAfter = await gates();
  } catch (error) {
    report.cleanupError = String(error);
    report.result = "FAIL";
    process.exitCode = 1;
  }
  await observer.close();
  report.finishedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
