import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { cpus, totalmem, platform, release } from "node:os";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  json,
  psql,
  q,
  seedProfile,
  seedQueue,
  sql,
  timedFixture,
  verifyEmpty,
} from "./lib/learning-schedule-load-fixtures.mjs";
import { measure, pool, rounded, summarize } from "./lib/learning-schedule-load-metrics.mjs";
import { loadReminderRuntime } from "./lib/load-learning-schedule-runtime.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const web = resolve(root, "apps/web");
const require = createRequire(resolve(web, "package.json"));
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");
const api = process.env.LEARNING_SCHEDULE_TEST_URL;
const service = process.env.LEARNING_SCHEDULE_TEST_SERVICE_KEY;
const anon = process.env.LEARNING_SCHEDULE_TEST_ANON_KEY;
const internal = process.env.AI_INTERNAL_API_KEY;
const nextUrl = "http://127.0.0.1:3119",
  focusUrl = "http://127.0.0.1:8096";
const dbProxy = "http://127.0.0.1:8098";
assert.equal(api, "http://127.0.0.1:55321");
assert(service && anon && internal);
const profileOptions = {
  small: { users: 10, sessions: 500, history: 20, concurrency: 5 },
  medium: { users: 100, sessions: 10_000, history: 1500, concurrency: 20 },
  large: { users: 500, sessions: 50_000, history: 5000, concurrency: 50 },
};
const remediation = process.argv.includes("--remediation");
const browserRegression = process.argv.includes("--browser-regression");
const readsOnly = process.argv.includes("--reads-only");
const selected = process.argv
  .slice(2)
  .filter((arg) => !["--remediation", "--browser-regression", "--reads-only"].includes(arg));
const profiles = selected.length ? selected : ["small", "medium"];
assert(
  profiles.every((name) => Object.hasOwn(profileOptions, name)),
  "Use small, medium or large",
);
const auth = { persistSession: false, autoRefreshToken: false };
const admin = createClient(api, service, { auth });
const children = new Set();
const reports = [];
let users = [];
const traffic = [];
const timingSamples = [];
let shortPage = false;
let recordTraffic = false;
const proxyErrors = [];
const proxy = createServer(async (request, response) => {
  try {
    const target = new URL(request.url, api);
    assert.equal(target.origin, api);
    assert(/^\/(rest|auth)\/v1(?:\/|$)/.test(target.pathname));
    const parts = [];
    for await (const part of request) parts.push(part);
    const { host: _host, ...headers } = request.headers;
    const start = performance.now();
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: parts.length ? Buffer.concat(parts) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    let bytes = Buffer.from(await upstream.arrayBuffer());
    const elapsed = performance.now() - start;
    const table = target.pathname.split("/").at(-1);
    if (!upstream.ok) {
      let code = "";
      try {
        code = JSON.parse(bytes.toString()).code ?? "";
      } catch {
        /* upstream returned no JSON code */
      }
      proxyErrors.push(`${table}:${upstream.status}:${code}`);
    }
    let rows = 0;
    if (target.pathname.startsWith("/rest/") && upstream.ok) {
      const data = JSON.parse(bytes.toString() || "null");
      rows = Array.isArray(data) ? data.length : Number(data !== null);
      if (shortPage && table === "task_study_sessions" && Array.isArray(data) && data.length > 1) {
        shortPage = false;
        bytes = Buffer.from(JSON.stringify(data.slice(0, -1)));
      }
      if (recordTraffic) traffic.push({ table, rows, elapsed });
    }
    const out = Object.fromEntries(upstream.headers);
    delete out["content-encoding"];
    delete out["content-length"];
    delete out["transfer-encoding"];
    response.writeHead(upstream.status, out).end(bytes);
  } catch (error) {
    proxyErrors.push(error.name);
    response.writeHead(502).end();
  }
});

function child(program, args, options) {
  const process = spawn(program, args, {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  });
  children.add(process);
  process.once("exit", () => children.delete(process));
  return process;
}
async function stop(process) {
  if (process.exitCode !== null || process.signalCode !== null) return;
  const exited = once(process, "exit");
  process.kill();
  await exited;
}
async function startServer(program, args, options, match) {
  const process = child(program, args, options);
  const lines = [
    createInterface({ input: process.stdout }),
    createInterface({ input: process.stderr }),
  ];
  let ready = false;
  for (const stream of lines)
    stream.on("line", (line) => {
      if (line.includes(match)) ready = true;
      if (recordTraffic && line.startsWith("study_plan_timing ")) {
        timingSamples.push(JSON.parse(line.slice("study_plan_timing ".length)));
      }
    });
  const deadline = Date.now() + 20_000;
  while (!ready && process.exitCode === null && Date.now() < deadline) await delay(100);
  assert(ready, `Test server failed to start: ${match}`);
  return process;
}
const stats = () =>
  json(`SELECT json_build_object('calls',coalesce(sum(calls),0),'execMs',coalesce(sum(total_exec_time),0))
 FROM extensions.pg_stat_statements WHERE query LIKE '%pgrst_source%' AND
 query ~ 'task_study_sessions|task_study_session_events|task_study_focus_attributions|focus_sessions|public.tasks'`);
function memory(pid) {
  if (platform() !== "win32") return null;
  const values = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `$p=Get-Process -Id ${pid}; "$($p.WorkingSet64)|$($p.PeakWorkingSet64)"`,
    ],
    { encoding: "utf8", windowsHide: true },
  )
    .trim()
    .split("|")
    .map(Number);
  return { workingSetBytes: values[0], processLifetimePeakBytes: values[1] };
}
async function session(user, cookie = false) {
  const jar = new Map();
  const client = cookie
    ? createServerClient(dbProxy, anon, {
        cookies: {
          getAll: () => [...jar].map(([name, value]) => ({ name, value })),
          setAll: (values) => {
            for (const item of values) jar.set(item.name, item.value);
          },
        },
      })
    : createClient(api, anon, { auth });
  const result = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  assert.ifError(result.error);
  return { client, cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") };
}
const call = async (client, name, args) => {
  const response = await client.rpc(name, args).abortSignal(AbortSignal.timeout(10_000));
  if (response.error)
    throw Object.assign(new Error(`RPC ${name} failed`), { code: response.error.code });
  return response.data;
};
const compact = ({ samples: _samples, ...result }) => result;

async function reads(profile, lengths, nextProcess) {
  const month = sql("SELECT to_char(now() AT TIME ZONE 'UTC','YYYY-MM')");
  const read = async (cookie, verify, fault = false) => {
    const response = await fetch(`${nextUrl}/en/study-plan?month=${month}`, {
      headers: { cookie, "accept-language": "en" },
      redirect: "manual",
      signal: AbortSignal.timeout(40_000),
    });
    const html = await response.text();
    assert.equal(response.status, 200, "Study Plan HTTP");
    if (fault) {
      assert(
        !html.includes('data-testid="study-calendar"'),
        "short page unexpectedly rendered a partial calendar",
      );
      assert(
        />A complete study plan could not be verified/.test(html),
        "missing fail-closed message",
      );
    } else {
      assert(
        html.includes('data-testid="study-calendar"'),
        `Study Plan projection did not render (${[
          "Study Planner",
          "Could not load your study plan",
          "A complete study plan could not be verified",
          "This page couldn’t load",
          "Application error",
          "study-calendar",
          "Loading your study plan",
        ]
          .filter((label) => html.includes(label))
          .join(", ")}; proxy ${proxyErrors.slice(-6).join(",")})`,
      );
      assert(!/>Recorded Focus could not be loaded\./.test(html), "effort projection failed");
      if (verify)
        assert(html.includes("Recorded Focus: 201 minutes"), "attribution page total incorrect");
    }
    return Buffer.byteLength(html);
  };
  const results = {};
  for (const [name, index] of [
    ["lightOwner", 1],
    ["linkedHistoryOwner", 0],
  ]) {
    const { cookie } = await session(users[index], true);
    let warmupFailures = 0;
    for (;;) {
      try {
        await read(cookie, index === 0);
        break;
      } catch (error) {
        if (++warmupFailures >= 3) throw error;
        console.log(`${name} warm-up retry: ${error.message}`);
        await delay(400);
      }
    }
    const before = stats(),
      startMemory = memory(nextProcess.pid);
    traffic.length = 0;
    timingSamples.length = 0;
    recordTraffic = true;
    const batch = await measure(
      Array.from({ length: profile.concurrency * 3 }),
      profile.concurrency,
      async () => ({ bytes: await read(cookie, index === 0), code: 200 }),
    );
    recordTraffic = false;
    const timings = {};
    for (const entry of timingSamples) {
      const scope = (timings[entry.scope] ??= { samples: 0, totalMs: 0, stageTotalsMs: {} });
      scope.samples++;
      scope.totalMs += entry.elapsedMs;
      for (const [stage, elapsed] of Object.entries(entry.stages)) {
        scope.stageTotalsMs[stage] = (scope.stageTotalsMs[stage] ?? 0) + elapsed;
      }
    }
    for (const scope of Object.values(timings)) {
      scope.meanMs = rounded(scope.totalMs / scope.samples);
      scope.stageMeanMs = Object.fromEntries(
        Object.entries(scope.stageTotalsMs).map(([stage, ms]) => [
          stage,
          rounded(ms / scope.samples),
        ]),
      );
      delete scope.totalMs;
      delete scope.stageTotalsMs;
    }
    const after = stats();
    const categories = {};
    for (const t of traffic) {
      const group = (categories[t.table] ??= { calls: 0, rows: 0 });
      group.calls++;
      group.rows += t.rows;
    }
    const restMs = traffic.reduce((sum, row) => sum + row.elapsed, 0);
    const totalMs = batch.samples.reduce((sum, row) => sum + row.elapsed, 0);
    results[name] = {
      ...compact(batch),
      ownerSessions: lengths[index],
      linksOnOneOccurrence: index === 0 ? 201 : 0,
      postgrest: categories,
      callsPerRequest: rounded(traffic.length / batch.sampleCount),
      rowsPerRequest: rounded(traffic.reduce((sum, row) => sum + row.rows, 0) / batch.sampleCount),
      avgResponseBytes: Math.round(
        batch.samples.reduce((sum, s) => sum + (s.bytes ?? 0), 0) / batch.sampleCount,
      ),
      sumRequestMs: rounded(totalMs),
      sumPostgrestRoundtripMs: rounded(restMs),
      approximateOtherRequestMs: rounded(totalMs - restMs),
      pgStatStatements: {
        calls: after.calls - before.calls,
        executionMs: rounded(after.execMs - before.execMs),
      },
      memoryBefore: startMemory,
      memoryAfter: memory(nextProcess.pid),
      timings,
      warmupFailures,
      firstError: batch.samples.find((sample) => sample.failed)?.reason ?? null,
    };
    assert.equal(batch.errorCount, 0, `${name} errors: ${results[name].firstError}`);
  }
  const { cookie } = await session(users[0], true);
  shortPage = true;
  await read(cookie, false, true);
  assert.equal(shortPage, false);
  results.shortPageFailedClosed = true;
  results.explain =
    sql(`EXPLAIN (ANALYZE, BUFFERS) SELECT id,scheduled_start_at FROM public.task_study_sessions
    WHERE user_id=${q(users[0].id)} ORDER BY scheduled_start_at,id LIMIT 500;
    EXPLAIN (ANALYZE, BUFFERS) SELECT id,session_id,created_at FROM public.task_study_session_events
    WHERE user_id=${q(users[0].id)} AND event_type='cancelled' ORDER BY created_at,id LIMIT 500;`);
  return results;
}

async function scheduleWork(profile, contexts) {
  const date = sql("SELECT ((now() AT TIME ZONE 'UTC')::date+1)::text");
  const weekday = Number(sql(`SELECT extract(isodow FROM date ${q(date)})`));
  const make = (hours, minute = "00") =>
    hours.map((hour) => {
      const start = `${hour}:${minute}`,
        end = `${hour}:50`;
      return { start, end, slot: { weekday, startTime: start, endTime: end } };
    });
  const draft = (parts) => ({
    p_starts_on: date,
    p_ends_on: date,
    p_timezone: "UTC",
    p_slots: parts.map((p) => p.slot),
    p_occurrences: parts.map(({ start, end }, i) => ({
      localDate: date,
      localStartTime: start,
      localEndTime: end,
      timezone: "UTC",
      slotIndex: i,
      scheduledStartAt: `${date}T${start}:00Z`,
      scheduledEndAt: `${date}T${end}:00Z`,
      occurrenceKey: `${date}|${weekday}|${start}|${end}`,
    })),
  });
  const createTask = (uid) =>
    sql(
      `INSERT INTO public.tasks(user_id,title,status) VALUES(${q(uid)},'Load mutation fixture','todo') RETURNING id;`,
    );
  const tasks = contexts.map(({ user }) => createTask(user.id));
  const schedules = [];
  const create = await measure(contexts, profile.concurrency, async ({ client }, i) => {
    schedules[i] = await call(client, "ls_create_schedule", {
      p_task_id: tasks[i],
      ...draft(make(["10"])),
    });
    return { code: "00000" };
  });
  assert.equal(create.errorCount, 0, JSON.stringify(create.samples.find((s) => s.failed)));
  const revise = await measure(contexts, profile.concurrency, async ({ client }, i) => {
    assert.equal(
      await call(client, "ls_revise_schedule", {
        p_schedule_id: schedules[i],
        p_expected_revision: 1,
        ...draft(make(["11"])),
      }),
      2,
    );
    return { code: "00000" };
  });
  assert.equal(revise.errorCount, 0, JSON.stringify(revise.samples.find((s) => s.failed)));
  const shared = await call(contexts[0].client, "ls_create_schedule", {
    p_task_id: createTask(contexts[0].user.id),
    ...draft(make(["07", "09", "13", "16"])),
  });
  const scheduled =
    json(`SELECT json_agg(to_jsonb(s) ORDER BY local_start_time) FROM public.task_study_sessions s
    WHERE schedule_id=${q(shared)}`);
  const reschedule = await measure(scheduled, profile.concurrency, async (row) => {
    const hour = row.local_start_time.slice(0, 2);
    assert.equal(
      await call(contexts[0].client, "ls_reschedule_session", {
        p_session_id: row.id,
        p_expected_updated_at: row.updated_at,
        p_new_local_date: date,
        p_new_start_time: `${hour}:10`,
        p_new_end_time: `${hour}:50`,
        p_new_start_at: `${date}T${hour}:10:00Z`,
        p_new_end_at: `${date}T${hour}:50:00Z`,
        p_event_key: randomUUID(),
      }),
      row.id,
    );
    return { code: "00000" };
  });
  const manual = contexts.map(({ user }) => timedFixture(user.id));
  const attendance = await measure(manual, profile.concurrency, async (row, i) => {
    const args = {
      p_session_id: row.id,
      p_expected_updated_at: row.updated_at,
      p_event_key: randomUUID(),
    };
    await call(contexts[i].client, "ls_complete_study_session", args);
    await call(contexts[i].client, "ls_complete_study_session", args);
    return { code: "00000" };
  });
  const lost =
    manual.length -
    Number(
      sql(`SELECT count(*) FROM public.task_study_sessions s
    WHERE s.id IN (${manual.map((r) => q(r.id)).join(",")}) AND s.status='completed'
    AND (SELECT count(*) FROM public.task_study_session_events e WHERE e.session_id=s.id AND e.event_type='completed')=1`),
    );
  assert.equal(lost, 0);
  assert.equal(reschedule.errorCount + attendance.errorCount, 0);
  return {
    create: compact(create),
    revise: compact(revise),
    sharedScheduleReschedule: compact(reschedule),
    manualAttendanceAndReplay: compact(attendance),
    lostAttendanceEvents: lost,
  };
}

const focusConfig = {
  focus_minutes: 5,
  short_break_minutes: 1,
  long_break_minutes: 5,
  round_count: 1,
  long_break_every: 4,
  auto_start_breaks: false,
  auto_start_focus: false,
};
async function focusPost(endpoint, body) {
  try {
    const r = await fetch(`${focusUrl}/api/v1/focus-v2/${endpoint}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lumivox-internal-key": internal,
        connection: "close",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    return { code: r.status, data: await r.json() };
  } catch (error) {
    throw Object.assign(new Error(`FastAPI ${endpoint} transport failed`), {
      code: error.cause?.code ?? error.name,
    });
  }
}
async function focusWork(profile, contexts) {
  const before = Number(sql("SELECT count(*) FROM public.focus_sessions"));
  const ordinaryIds = [],
    launched = [],
    inputs = contexts.map(({ user }) => ({
      user_id: user.id,
      study_session_id: timedFixture(user.id).id,
      launch_request_id: randomUUID(),
      ...focusConfig,
    }));
  const run = async (name, work, expected = 200) => {
    const result = await measure(inputs, profile.concurrency, async (input, i) => {
      const response = await work(input, i);
      return { code: response.code, failed: response.code !== expected };
    });
    assert.equal(result.errorCount, 0, `${name}: ${JSON.stringify(result.outcomes)}`);
    return compact(result);
  };
  const transition = (input, id, action, segment) =>
    focusPost("transition", {
      user_id: input.user_id,
      session_id: id,
      action,
      expected_segment_id: segment ?? null,
    });
  const ordinary = await run("ordinary", async (input, i) => {
    const r = await focusPost("create", { ...focusConfig, user_id: input.user_id });
    ordinaryIds[i] = r.data.session_id;
    return r;
  });
  const cancel = await run("cancel", (input, i) => transition(input, ordinaryIds[i], "cancel"));
  const create = await run("launch", async (input, i) => {
    const r = await focusPost("create-from-study-session", input);
    launched[i] = r.data.session_id;
    return r;
  });
  const activeRead = await run("read", async (input, i) => {
    const r = await contexts[i].client
      .from("focus_sessions")
      .select("id")
      .eq("user_id", input.user_id)
      .in("status", ["ongoing", "paused"])
      .single();
    assert.equal(r.data?.id, launched[i]);
    return { code: r.status };
  });
  const replay = await run("replay", async (input, i) => {
    const r = await focusPost("create-from-study-session", input);
    assert.deepEqual(r.data, { session_id: launched[i], replay: true });
    return r;
  });
  const conflict = await run(
    "new key conflict",
    (input) =>
      focusPost("create-from-study-session", { ...input, launch_request_id: randomUUID() }),
    423,
  );
  const segments = new Map(
    json(`SELECT json_agg(json_build_array(session_id,id)) FROM public.focus_session_segments
    WHERE session_id IN (${launched.map(q).join(",")}) AND position=1`),
  );
  const pause = await run("pause", (input, i) =>
    transition(input, launched[i], "pause", segments.get(launched[i])),
  );
  const resume = await run("resume", (input, i) =>
    transition(input, launched[i], "resume", segments.get(launched[i])),
  );
  sql(`UPDATE public.focus_session_segments SET started_at=clock_timestamp()-interval '6 minutes'
    WHERE id IN (${[...segments.values()].map(q).join(",")});`);
  const complete = await run("complete", (input, i) =>
    transition(input, launched[i], "complete", segments.get(launched[i])),
  );
  assert.equal(
    Number(
      sql(
        `SELECT count(*) FROM public.task_study_focus_launches WHERE focus_session_id IN (${launched.map(q).join(",")})`,
      ),
    ),
    launched.length,
  );
  assert.equal(
    Number(
      sql(
        `SELECT count(*) FROM public.task_study_focus_attributions WHERE focus_session_id IN (${launched.map(q).join(",")})`,
      ),
    ),
    launched.length,
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM public.task_study_session_events WHERE session_id IN (${inputs.map((i) => q(i.study_session_id)).join(",")})`,
    ),
    "0",
  );
  const extra =
    Number(sql("SELECT count(*) FROM public.focus_sessions")) - before - 2 * inputs.length;
  assert.equal(extra, 0);
  return {
    ordinary,
    cancel,
    attributed: create,
    activeRead,
    replay,
    conflict,
    pause,
    resume,
    complete,
    replayExtraWrites: extra,
  };
}

async function focusViaNext(user) {
  const { chromium } = require("@playwright/test");
  const { cookie } = await session(user, true);
  const fixture = timedFixture(user.id);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ baseURL: nextUrl });
    await context.addCookies(
      cookie
        .split("; ")
        .filter(Boolean)
        .map((pair) => ({
          name: pair.slice(0, pair.indexOf("=")),
          value: pair.slice(pair.indexOf("=") + 1),
          url: nextUrl,
        })),
    );
    await context.route("**/*", (route) =>
      [nextUrl, dbProxy].includes(new URL(route.request().url()).origin)
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage();
    await page.goto(`/en/focus?studySession=${fixture.id}`);
    const start = performance.now();
    await page.locator("form button[type=submit]").click({ timeout: 10_000 });
    await page.getByRole("timer").waitFor({ timeout: 15_000 });
    const elapsedMs = rounded(performance.now() - start);
    const focus = sql(
      `SELECT focus_session_id FROM public.task_study_focus_attributions WHERE study_session_id=${q(fixture.id)}`,
    );
    assert.match(focus, /^[a-f0-9-]{36}$/);
    assert.equal(
      (await focusPost("transition", { user_id: user.id, session_id: focus, action: "cancel" }))
        .code,
      200,
    );
    return { sampleCount: 1, elapsedMs, observedAttribution: true };
  } finally {
    await browser.close();
  }
}

async function locked(statement, work) {
  const holder = child("docker", psql);
  const lines = createInterface({ input: holder.stdout });
  const done = once(holder, "exit");
  const seen = once(lines, "line");
  holder.stdin.write(
    `BEGIN; SET LOCAL statement_timeout='10s'; ${statement}; SELECT 'pid:'||pg_backend_pid();\n`,
  );
  let waiting;
  try {
    const [line] = await Promise.race([
      seen,
      delay(5000).then(() => {
        throw new Error("Lock holder deadline");
      }),
    ]);
    assert.match(line, /^pid:\d+$/);
    const pid = Number(line.slice(4)),
      start = performance.now();
    waiting = Promise.resolve().then(work);
    waiting.catch(() => {});
    let blockers = [];
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && blockers.length === 0) {
      blockers =
        json(`SELECT coalesce(json_agg(json_build_object('waiter',pid,'blockers',pg_blocking_pids(pid),
        'waitEvent',wait_event,'observedStatementMs',extract(epoch FROM (clock_timestamp()-query_start))*1000)),'[]'::json)
        FROM pg_stat_activity WHERE ${pid}=ANY(pg_blocking_pids(pid))`);
      if (!blockers.length) await delay(15);
    }
    assert(blockers.length, "No PostgreSQL blocker observed");
    holder.stdin.end("COMMIT;\n");
    assert.equal((await done)[0], 0);
    const outcome = await waiting;
    return { blockers, elapsedMs: rounded(performance.now() - start), outcome };
  } finally {
    if (holder.exitCode === null) {
      holder.stdin.end("ROLLBACK;\n");
      await done;
    }
    lines.close();
    await waiting?.catch(() => {});
  }
}

async function contention(context) {
  const row = timedFixture(context.user.id);
  const nextDate = sql(`SELECT (date ${q(row.local_date)}+1)::text`);
  const weekday = Number(sql(`SELECT extract(isodow FROM date ${q(nextDate)})`));
  const slots = [{ weekday, startTime: "10:00", endTime: "11:00" }];
  const occurrences = [
    {
      localDate: nextDate,
      localStartTime: "10:00",
      localEndTime: "11:00",
      timezone: row.timezone,
      slotIndex: 0,
      scheduledStartAt: sql(
        `SELECT (date ${q(nextDate)}+time '10:00') AT TIME ZONE ${q(row.timezone)}`,
      ),
      scheduledEndAt: sql(
        `SELECT (date ${q(nextDate)}+time '11:00') AT TIME ZONE ${q(row.timezone)}`,
      ),
      occurrenceKey: `${nextDate}|${weekday}|10:00|11:00`,
    },
  ];
  const revision = await locked(
    `SET LOCAL "request.jwt.claim.sub"=${q(context.user.id)};
    DO $run$ BEGIN PERFORM public.ls_revise_schedule(${q(row.schedule)},1,${q(nextDate)},${q(nextDate)},${q(row.timezone)},
      ${q(JSON.stringify(slots))},${q(JSON.stringify(occurrences))}); END $run$`,
    async () => {
      await call(context.client, "ls_complete_study_session", {
        p_session_id: row.id,
        p_expected_updated_at: row.updated_at,
        p_event_key: randomUUID(),
      });
      return "00000";
    },
  );
  assert.equal(
    sql(`SELECT status FROM public.task_study_sessions WHERE id=${q(row.id)}`),
    "completed",
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM public.task_study_session_events WHERE session_id=${q(row.id)} AND event_type='completed'`,
    ),
    "1",
  );
  const close = timedFixture(context.user.id);
  const race = await locked(
    `UPDATE public.tasks SET status='completed' WHERE id=${q(close.task)}`,
    async () =>
      (
        await focusPost("create-from-study-session", {
          user_id: context.user.id,
          study_session_id: close.id,
          launch_request_id: randomUUID(),
          ...focusConfig,
        })
      ).code,
  );
  assert.equal(race.outcome, 410);
  assert.equal(
    sql(
      `SELECT count(*) FROM public.task_study_focus_attributions WHERE study_session_id=${q(close.id)}`,
    ),
    "0",
  );
  return { revisionVsAttendance: revision, closeVsLaunch: race };
}

async function queueWork() {
  const runtime = await loadReminderRuntime(root);
  const { ResendReminderProvider } =
    await import("../apps/web/.next/step-8d-runtime/resend-reminder-provider.mjs");
  const fixtures = seedQueue(users);
  const keys = fixtures.map((f) => f.job);
  const selector = keys.map(q).join(",");
  // Discard only automatic jobs created by enabling consent in this empty test profile.
  sql(
    `DELETE FROM public.study_notification_jobs WHERE id NOT IN (${selector}) AND user_id IN (${users
      .slice(0, 10)
      .map((u) => q(u.id))
      .join(",")})`,
  );
  const config = {
    enabled: true,
    allowlist: new Set(users.slice(0, 10).map((u) => u.email)),
    identityKey: randomBytes(32).toString("hex"),
    encryptionKey: randomBytes(32),
    from: "Lumivox <study@example.invalid>",
    trustedOrigin: "https://app.lumivox.test",
  };
  const makeStore = () =>
    runtime.store.createResendDispatchStore(createClient(api, service, { auth }));
  const calls = new Map();
  const fingerprints = new Map();
  const rateLimited = new Set();
  let offAt;
  let gateFenceArmed = true;
  let crashed;
  const transport = new ResendReminderProvider(
    {
      emails: {
        async send(request, options) {
          const key = options.idempotencyKey;
          assert(keys.includes(key));
          const count = (calls.get(key) ?? 0) + 1;
          calls.set(key, count);
          const fingerprint = createHash("sha256").update(JSON.stringify(request)).digest("hex");
          assert(
            count === 1 || fingerprints.get(key) === fingerprint,
            "retry changed the immutable request",
          );
          fingerprints.set(key, fingerprint);
          if (gateFenceArmed && calls.size === 30) {
            offAt = sql(
              "UPDATE public.study_notification_dispatch_control SET enabled=false RETURNING clock_timestamp()",
            );
            gateFenceArmed = false;
          }
          const index = keys.indexOf(key);
          await delay(index % 10 === 0 ? 350 : 35, undefined, { signal: options.signal });
          if (index === 0) throw new Error("fake provider uncertainty");
          if (index === 3)
            return { data: null, error: { name: "daily_quota_exceeded", statusCode: 429 } };
          if (index === 4)
            return { data: null, error: { name: "invalid_idempotent_request", statusCode: 409 } };
          if (
            !gateFenceArmed &&
            offAt &&
            count === 1 &&
            rateLimited.size < 2 &&
            key !== crashed &&
            index > 4 &&
            sql(`SELECT enabled FROM public.study_notification_dispatch_control`) === "t"
          ) {
            rateLimited.add(key);
            return { data: null, error: { name: "rate_limit_exceeded", statusCode: 429 } };
          }
          return { data: { id: randomUUID() }, error: null };
        },
      },
    },
    config.from,
  );

  // Use a dedicated child to claim through PostgREST and stop it after commit.
  const claimChild = child(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import {createClient} from '@supabase/supabase-js';
    const db=createClient(process.env.LEARNING_SCHEDULE_TEST_URL,process.env.LEARNING_SCHEDULE_TEST_SERVICE_KEY);
    const {data,error}=await db.rpc('ls_notification_claim_batch',{p_batch_size:1});
    if(error||data.length!==1) process.exit(1);
    console.log(JSON.stringify(data[0]));setInterval(()=>{},1000);
  `,
    ],
    { cwd: web },
  );
  const lines = createInterface({ input: claimChild.stdout });
  const [line] = await Promise.race([
    once(lines, "line"),
    delay(10_000).then(() => {
      throw new Error("Claim child deadline");
    }),
  ]);
  crashed = JSON.parse(line).jobId;
  assert(keys.includes(crashed));
  await stop(claimChild);
  sql(
    `UPDATE public.study_notification_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=${q(crashed)}`,
  );
  const before = await call(admin, "ls_learning_schedule_operational_snapshot", {});
  assert.equal(before.dispatch.expiredLeases, 1);
  const started = performance.now();
  const batches = [];
  let fenced = false;
  let strandedLeases = 0;
  const runWave = async (track = true) => {
    const wave = await measure([1, 2, 3, 4, 5], 5, async () => ({
      result: await runtime.worker.dispatchResendReminders(makeStore(), transport, config, {
        batchSize: 5,
      }),
    }));
    assert.equal(wave.errorCount, 0);
    if (track) batches.push(...wave.samples);
    return wave;
  };
  for (let wave = 0; wave < 18 && calls.size < 100; wave++) {
    await runWave();
    if (offAt && !fenced) {
      const noNew = calls.size;
      const disabled = await runWave();
      assert(disabled.samples.every((s) => s.result.inspected === 0));
      assert.equal(calls.size, noNew);
      assert.equal(
        sql(
          `SELECT count(*) FROM public.study_notification_deliveries WHERE created_at>${q(offAt)}`,
        ),
        "0",
      );
      strandedLeases = Number(
        sql(`WITH expired AS (
        UPDATE public.study_notification_jobs SET lease_until=clock_timestamp()-interval '1 second'
        WHERE status='leased' RETURNING id
      ) SELECT count(*) FROM expired;`),
      );
      sql("UPDATE public.study_notification_dispatch_control SET enabled=true;");
      fenced = true;
    }
  }
  assert.equal(calls.size, 100);
  assert.equal(rateLimited.size, 2);
  const retries = [...rateLimited].map(q).join(",");
  assert.equal(
    sql(`SELECT count(*) FROM public.study_notification_jobs WHERE id IN (${retries})
    AND status='pending' AND next_attempt_at>clock_timestamp()`),
    "2",
  );
  const retryWait = Number(
    sql(`SELECT greatest(0,ceil(extract(epoch FROM (max(next_attempt_at)-clock_timestamp()))*1000))
    FROM public.study_notification_jobs WHERE id IN (${retries}) AND status='pending'`),
  );
  await delay(retryWait + 100);
  await runWave();
  const elapsed = performance.now() - started;
  for (const key of rateLimited) assert.equal(calls.get(key), 2);
  const duplicates = [...calls].reduce(
    (n, [key, count]) => n + count - (rateLimited.has(key) ? 2 : 1),
    0,
  );
  assert.equal(duplicates, 0);
  assert(fenced);
  const statuses = json(`SELECT json_object_agg(status,n) FROM
    (SELECT status,count(*) n FROM public.study_notification_jobs WHERE id IN (${selector}) GROUP BY status) x`);
  assert.deepEqual(statuses, { sent: 97, failed: 3 });
  assert.equal(
    sql(`SELECT count(*) FROM public.study_notification_jobs WHERE id IN (${[keys[0], keys[3], keys[4]].map(q).join(",")})
    AND status='failed'`),
    "3",
  );
  const crashedAttempts = Number(
    sql(`SELECT attempt_count FROM public.study_notification_jobs WHERE id=${q(crashed)}`),
  );
  // The recovered job can be leased again just before the gate closes.
  assert(crashedAttempts >= 2 && crashedAttempts <= 3);
  assert.equal(calls.get(crashed), 1);
  const after = await call(admin, "ls_learning_schedule_operational_snapshot", {});
  assert.equal(after.dispatch.expiredLeases, 0);
  assert.equal(after.dispatch.uncertainAttempts, 1);
  assert.equal(after.dispatch.pendingDue, 0);
  const attempt = await runWave(false);
  assert(attempt.samples.every((s) => s.result.inspected === 0));
  const consentFixture = timedFixture(users[0].id, 5),
    consentJob = randomUUID();
  sql(`INSERT INTO public.study_notification_jobs(id,user_id,session_id,schedule_revision,due_at,next_attempt_at,idempotency_key,lifecycle_fingerprint)
    SELECT ${q(consentJob)},user_id,${q(consentFixture.id)},1,due_at,due_at,${q(consentJob)},fingerprint
    FROM public.ls_notification_session_policy(${q(consentFixture.id)});`);
  let consentRace;
  const store = makeStore();
  const blocked = await runtime.worker.dispatchResendReminders(
    {
      ...store,
      async authorize(claim, context) {
        assert.equal(claim.jobId, consentJob);
        consentRace = await locked(
          `DO $run$ BEGIN
        PERFORM public.ls_notification_consume_unsubscribe_token(token_hash)
        FROM public.study_notification_resend_payloads WHERE job_id=${q(consentJob)};
        END $run$`,
          async () => await store.authorize(claim, context),
        );
        return consentRace.outcome;
      },
    },
    {
      async send() {
        throw new Error("Opt-out fence allowed unexpected provider invocation");
      },
    },
    config,
    { batchSize: 1 },
  );
  assert.equal(blocked.held, 1);
  assert.equal(consentRace?.outcome.authorized, false);
  assert.equal(
    sql(`SELECT count(*) FROM public.study_notification_deliveries WHERE job_id=${q(consentJob)}`),
    "0",
  );
  sql("UPDATE public.study_notification_dispatch_control SET enabled=false;");
  return {
    ...summarize(batches, elapsed),
    workers: 5,
    jobs: 100,
    terminalStates: statuses,
    drainJobsPerSecond: rounded(100_000 / elapsed),
    acceptedJobsPerSecond: rounded(97_000 / elapsed),
    unexpectedDuplicateSubmissions: duplicates,
    crashedClaimRecovered: true,
    crashedAttempts,
    gateFenceVerified: true,
    strandedLeases,
    fake429: 2,
    confirmedRetries: rateLimited.size,
    fakeQuota: 1,
    fakePayloadMismatch: 1,
    fakeUncertain: 1,
    retryWaitMs: retryWait,
    injectedProviderDelayMs: [35, 350],
    before,
    after,
    optOutVsHandoff: consentRace,
  };
}

function cleanup() {
  sql("UPDATE public.study_notification_dispatch_control SET enabled=false WHERE enabled;");
  const ids = users.filter(Boolean).map((u) => q(u.id));
  if (ids.length) sql(`DELETE FROM auth.users WHERE id IN (${ids.join(",")});`);
  users = [];
  return verifyEmpty();
}

verifyEmpty();
const report = {
  baseline: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  environment: "disposable-local",
  host: {
    os: platform(),
    release: release(),
    cpu: cpus()[0].model,
    logicalCpus: cpus().length,
    ramGiB: rounded(totalmem() / 2 ** 30),
    node: process.version,
    docker: execFileSync("docker", ["info", "--format", "{{.NCPU}} CPUs / {{.MemTotal}} bytes"], {
      encoding: "utf8",
    }).trim(),
  },
  startedAt: new Date().toISOString(),
  profiles: reports,
  realProviderRequests: 0,
};
try {
  await new Promise((resolveListen, reject) =>
    proxy.once("error", reject).listen(8098, "127.0.0.1", resolveListen),
  );
  const next = await startServer(
    process.execPath,
    [resolve(web, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", "3119"],
    {
      cwd: web,
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: dbProxy,
        AI_API_BASE_URL: browserRegression ? "http://127.0.0.1:8097" : focusUrl,
        STUDY_REMINDER_REAL_SEND_ENABLED: "false",
        STUDY_PLAN_PERF_TIMING: "true",
      },
    },
    "Ready in",
  );
  await startServer(
    resolve(root, "services/ai-api/.venv/Scripts/python.exe"),
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8096", "--lifespan", "off"],
    {
      cwd: resolve(root, "services/ai-api"),
      env: { ...process.env, SUPABASE_URL: api, SUPABASE_SECRET_KEY: service },
    },
    "Uvicorn running",
  );
  if (browserRegression) {
    const runner = spawn(
      process.execPath,
      [
        resolve(web, "node_modules/@playwright/test/cli.js"),
        "test",
        "tests/study-focus-launch.spec.ts",
        "tests/study-focus-effort.spec.ts",
        "tests/study-learning-journey.spec.ts",
        "--project=chromium",
        "--workers=1",
        "--reporter=line",
      ],
      {
        cwd: web,
        stdio: "inherit",
        windowsHide: true,
        env: {
          ...process.env,
          PLAYWRIGHT_BASE_URL: nextUrl,
          STUDY_FOCUS_TEST_BACKEND: focusUrl,
          STUDY_FOCUS_TEST_PROXY_PORT: "8097",
        },
      },
    );
    const [code] = await once(runner, "exit");
    assert.equal(code, 0);
  }
  for (const name of browserRegression ? [] : profiles) {
    const profile = profileOptions[name];
    const run = { profile: name, ...profile, measurements: {}, invariants: {} };
    reports.push(run);
    console.log(`Seeding ${name}: ${profile.users} users / ${profile.sessions} sessions`);
    const sizes = await seedProfile(admin, profile, users);
    assert.equal(Number(sql("SELECT count(*) FROM public.task_study_sessions")), profile.sessions);
    if (remediation) {
      run.measurements.studyPlanConcurrency = {};
      for (const concurrency of [1, 5]) {
        run.measurements.studyPlanConcurrency[concurrency] = await reads(
          { ...profile, concurrency },
          sizes,
          next,
        );
      }
    }
    run.measurements.studyPlan = await reads(profile, sizes, next);
    console.log(
      `${name} read p95: ${run.measurements.studyPlan.lightOwner.p95Ms}/${run.measurements.studyPlan.linkedHistoryOwner.p95Ms} ms`,
    );
    if (readsOnly) {
      run.cleanup = cleanup();
      continue;
    }
    const contexts = await pool(users.slice(0, profile.concurrency), 8, async (user) => ({
      user,
      ...(await session(user)),
    }));
    run.measurements.schedule = await scheduleWork(profile, contexts);
    run.measurements.contention = await contention(contexts[0]);
    run.measurements.focus = await focusWork(profile, contexts);
    run.measurements.focus.nextBrowserLaunch = await focusViaNext(users[0]);
    run.measurements.queue = await queueWork();
    const duplicateAttributions = Number(
      sql(`SELECT count(*) FROM (
      SELECT focus_session_id FROM public.task_study_focus_attributions GROUP BY focus_session_id HAVING count(*)>1) d`),
    );
    assert.equal(duplicateAttributions, 0);
    run.invariants = {
      duplicateAttributions,
      unexpectedFocusRows: run.measurements.focus.replayExtraWrites,
      lostAttendanceEvents: run.measurements.schedule.lostAttendanceEvents,
      unexpectedDuplicateSubmissions: run.measurements.queue.unexpectedDuplicateSubmissions,
    };
    run.cleanup = cleanup();
    console.log(`PASS ${name}`);
  }
} catch (error) {
  report.failure = { name: error.name, message: error.message };
  throw error;
} finally {
  await Promise.all([...children].map(stop));
  if (proxy.listening) {
    proxy.closeAllConnections();
    await new Promise((done) => proxy.close(done));
  }
  try {
    report.finalCleanup = cleanup();
  } finally {
    report.finishedAt = new Date().toISOString();
    const path = resolve(root, "docs/learning-schedule/phase-10-performance.json");
    if (!browserRegression) {
      const previous = await readFile(path, "utf8")
        .then(JSON.parse)
        .catch((error) => {
          if (error.code !== "ENOENT") throw error;
          return null;
        });
      const output = previous
        ? { ...previous, [remediation ? "remediation" : "latestRun"]: report }
        : report;
      if (remediation && previous?.remediation) {
        output.remediationEarlier = [...(previous.remediationEarlier ?? []), previous.remediation];
      }
      await writeFile(path, JSON.stringify(output, null, 2) + "\n");
    }
  }
}
