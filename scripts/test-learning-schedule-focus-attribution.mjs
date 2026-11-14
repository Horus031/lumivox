import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  container = "supabase_db_lumivox-proj";
let owner, otherId;
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const report = {
  baseline: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  startedAt: new Date().toISOString(),
  runs: [],
  http: [],
  cleanup: false,
};
// Fixed LOCAL Docker container/API, empty DB required, unique owned fixtures.
// No Focus timer/API launch workflow, provider send or operational gate change.
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

const [a, b, observer] = ["9a-A", "9a-B", "9a-observer"].map((name) => new Connection(name));
let admin, clientA, clientB;
async function fixture() {
  await observer.ok(`DELETE FROM public.focus_sessions WHERE user_id=${q(owner)};
 DELETE FROM public.tasks WHERE user_id=${q(owner)} AND title='9A concurrency fixture';`);
  const task = randomUUID(),
    schedule = randomUUID(),
    s1 = randomUUID(),
    s2 = randomUUID(),
    focus = randomUUID();
  await observer.ok(`BEGIN;
 INSERT INTO public.tasks(id,user_id,title,status) VALUES(${q(task)},${q(owner)},'9A concurrency fixture','todo');
 INSERT INTO public.task_study_schedules(id,user_id,task_id,starts_on,ends_on,timezone) VALUES(${q(schedule)},${q(owner)},${q(task)},'2030-01-07','2030-01-14','UTC');
 INSERT INTO public.task_study_sessions(id,user_id,task_id,schedule_id,schedule_revision,logical_occurrence_key,local_date,local_start_time,local_end_time,timezone,scheduled_start_at,scheduled_end_at)
 VALUES(${q(s1)},${q(owner)},${q(task)},${q(schedule)},1,'cc-first','2030-01-07','10:00','11:00','UTC','2030-01-07T10:00Z','2030-01-07T11:00Z'),
 (${q(s2)},${q(owner)},${q(task)},${q(schedule)},1,'cc-second','2030-01-14','10:00','11:00','UTC','2030-01-14T10:00Z','2030-01-14T11:00Z');
 INSERT INTO public.focus_sessions(id,user_id,task_id,planned_minutes) VALUES(${q(focus)},${q(owner)},${q(task)},25);COMMIT;`);
  return { task, s1, s2, focus };
}
const link = (f, study = f.s1) => `SELECT public.ls_link_study_focus(${q(study)},${q(f.focus)});`;
async function blocked() {
  const end = Date.now() + 3000;
  while (Date.now() < end) {
    const pids = await observer.json(`SELECT to_json(pg_blocking_pids(${b.pid}));`);
    if (pids.includes(a.pid)) return { waiter: b.pid, blocker: a.pid, observed: pids };
    await wait(20);
  }
  throw new Error("Expected attribution blocker was not observed");
}
async function final(f) {
  const result =
    await observer.json(`SELECT json_build_object('links',(SELECT count(*) FROM public.task_study_focus_attributions WHERE focus_session_id=${q(f.focus)}),
 'study',(SELECT study_session_id FROM public.task_study_focus_attributions WHERE focus_session_id=${q(f.focus)}),
 'studyStatuses',(SELECT json_agg(status ORDER BY id) FROM public.task_study_sessions WHERE id IN (${q(f.s1)},${q(f.s2)})),
 'focusStatus',(SELECT status FROM public.focus_sessions WHERE id=${q(f.focus)}));`);
  assert.equal(result.links, 1);
  assert.deepEqual(result.studyStatuses, ["scheduled", "scheduled"]);
  assert.equal(result.focusStatus, "ongoing");
  return result;
}
try {
  for (const c of [a, b, observer]) await c.init();
  assert.equal(
    await observer.ok("SELECT count(*) FROM auth.users;"),
    "0",
    "Requires disposable empty LOCAL DB",
  );
  assert.equal(
    await observer.ok("SELECT current_database()||':'||current_setting('port');"),
    "postgres:5432",
  );
  assert.equal(
    await observer.ok("SELECT enabled FROM public.study_notification_dispatch_control;"),
    "f",
  );
  assert.equal(await observer.ok("SELECT enabled FROM public.ls_missed_sweep_control;"), "f");
  const cli =
    "C:\\Users\\Dell\\AppData\\Local\\npm-cache\\_npx\\aa8e5c70f9d8d161\\node_modules\\@supabase\\cli-windows-x64\\bin\\supabase.exe";
  const status = JSON.parse(
    execFileSync(cli, ["status", "--output", "json"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  assert.equal(status.API_URL, "http://127.0.0.1:55321");
  const require = createRequire(resolve(root, "apps/web/package.json")),
    { createClient } = require("@supabase/supabase-js");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
  clientA = createClient(status.API_URL, status.ANON_KEY, options);
  clientB = createClient(status.API_URL, status.ANON_KEY, options);
  for (const [which, client] of [
    ["a", clientA],
    ["b", clientB],
  ]) {
    const email = `fa-${which}-${randomUUID()}@example.invalid`,
      password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(created.error, null);
    if (which === "a") owner = created.data.user.id;
    else otherId = created.data.user.id;
    assert.equal((await client.auth.signInWithPassword({ email, password })).error, null);
  }
  for (const kind of ["same-pair", "different-study", "rollback-winner", "busy-focus"])
    for (let repeat = 1; repeat <= 3; repeat++) {
      const f = await fixture();
      let blocker = null,
        elapsedMs = null,
        firstId,
        secondId,
        state;
      if (kind === "busy-focus") {
        await a.ok(`BEGIN;SELECT id FROM public.focus_sessions WHERE id=${q(f.focus)} FOR UPDATE;`);
        await b.begin();
        const started = Date.now();
        const busy = await b.exec(link(f));
        elapsedMs = Date.now() - started;
        state = busy.state;
        assert.equal(state, "55P03");
        assert(elapsedMs < 2000);
        await b.ok("ROLLBACK;");
        await a.ok("COMMIT;");
        assert.equal(
          await observer.ok(
            `SELECT count(*) FROM public.task_study_focus_attributions WHERE focus_session_id=${q(f.focus)};`,
          ),
          "0",
        );
        await b.begin();
        secondId = await b.ok(link(f));
        await b.ok("COMMIT;");
      } else {
        await a.begin();
        firstId = await a.ok(link(f));
        const original = await a.ok(
          `SELECT to_jsonb(x) FROM public.task_study_focus_attributions x WHERE id=${q(firstId)};`,
        );
        await b.begin();
        const pending = b.exec(link(f, kind === "different-study" ? f.s2 : f.s1));
        blocker = await blocked();
        await a.ok(kind === "rollback-winner" ? "ROLLBACK;" : "COMMIT;");
        const result = await pending;
        state = result.state;
        if (kind === "different-study") {
          assert.equal(state, "23505");
          await b.ok("ROLLBACK;");
        } else {
          assert.equal(state, "00000");
          secondId = result.text;
          await b.ok("COMMIT;");
          if (kind === "same-pair") {
            assert.equal(secondId, firstId);
            assert.equal(
              await observer.ok(
                `SELECT to_jsonb(x) FROM public.task_study_focus_attributions x WHERE id=${q(firstId)};`,
              ),
              original,
            );
          } else assert.notEqual(secondId, firstId);
        }
      }
      const outcome = await final(f);
      assert.equal(outcome.study, f.s1);
      report.runs.push({
        case: kind,
        repeat,
        sqlstate: state,
        retrySqlstate: kind === "busy-focus" ? "00000" : null,
        blocker,
        elapsedMs,
        final: outcome,
      });
    }
  const f = await fixture();
  const args = { p_study_session_id: f.s1, p_focus_session_id: f.focus };
  const linked = await clientA.rpc("ls_link_study_focus", args);
  assert.equal(linked.error, null);
  assert(linked.data);
  const replay = await clientA.rpc("ls_link_study_focus", args);
  assert.equal(replay.error, null);
  assert.equal(replay.data, linked.data);
  const conflict = await clientA.rpc("ls_link_study_focus", { ...args, p_study_session_id: f.s2 });
  assert.equal(conflict.error?.code, "23505");
  const cross = await clientB.rpc("ls_link_study_focus", args);
  assert.equal(cross.error?.code, "22023");
  const own = await clientA
    .from("task_study_focus_attributions")
    .select("id")
    .eq("focus_session_id", f.focus);
  assert.equal(own.error, null);
  assert.equal(own.data.length, 1);
  const other = await clientB
    .from("task_study_focus_attributions")
    .select("id")
    .eq("focus_session_id", f.focus);
  assert.equal(other.error, null);
  assert.equal(other.data.length, 0);
  const denied = await clientA.from("task_study_focus_attributions").delete().eq("id", linked.data);
  assert.equal(denied.error?.code, "42501");
  const anonymous = createClient(status.API_URL, status.ANON_KEY, options);
  const anon = await anonymous.rpc("ls_link_study_focus", args);
  assert.equal(anon.error?.code, "42501");
  report.http = [
    { case: "owned link/exact replay", sqlstate: "00000" },
    { case: "different Study conflict", sqlstate: "23505" },
    { case: "cross-owner denial", sqlstate: "22023" },
    { case: "owner read/other isolated", ownerRows: 1, otherRows: 0 },
    { case: "browser mutation denial", sqlstate: "42501" },
    { case: "anonymous denial", sqlstate: "42501" },
  ];
  await final(f);
} finally {
  for (const c of [a, b]) {
    try {
      await c.ok("ROLLBACK;");
    } catch {}
  }
  try {
    if (owner) {
      await observer.ok(
        `DELETE FROM public.focus_sessions WHERE user_id=${q(owner)};DELETE FROM public.tasks WHERE user_id=${q(owner)} AND title='9A concurrency fixture';`,
      );
    }
    if (clientA) await clientA.auth.signOut();
    if (clientB) await clientB.auth.signOut();
    if (owner) assert.equal((await admin.auth.admin.deleteUser(owner)).error, null);
    if (otherId) assert.equal((await admin.auth.admin.deleteUser(otherId)).error, null);
    report.finalCounts = await observer.json(
      `SELECT json_build_object('users',(SELECT count(*) FROM auth.users),'tasks',(SELECT count(*) FROM public.tasks),'studySessions',(SELECT count(*) FROM public.task_study_sessions),'focusSessions',(SELECT count(*) FROM public.focus_sessions),'attributions',(SELECT count(*) FROM public.task_study_focus_attributions));`,
    );
    assert(Object.values(report.finalCounts).every((x) => x === 0));
    report.cleanup = true;
    report.gates = await observer.json(
      `SELECT json_build_object('dispatch',(SELECT enabled FROM public.study_notification_dispatch_control),'sweep',(SELECT enabled FROM public.ls_missed_sweep_control),'reminderCron',(SELECT count(*) FROM cron.job WHERE jobname ILIKE '%remind%'));`,
    );
    assert.deepEqual(report.gates, { dispatch: false, sweep: false, reminderCron: 0 });
  } finally {
    for (const c of [a, b, observer]) await c.close();
    report.completedAt = new Date().toISOString();
    await writeFile(
      resolve(root, "docs/learning-schedule/phase-09-focus-attribution.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  }
}
console.log(
  `PASS: ${report.runs.length} PostgreSQL cases, ${report.runs.filter((x) => x.blocker).length} observed blockers, ${report.http.length} HTTP checks, cleanup/OFF`,
);
