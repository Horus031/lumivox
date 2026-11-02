
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const reportPath = resolve(
  root,
  "docs/learning-schedule/phase-05-http-security.json",
);

const dbContainer = "supabase_db_lumivox-proj";
const apiTimeoutMs = 10000;

const report = {
  scope: "local-attendance-http-security",
  startedAt: new Date().toISOString(),
  baseline: execFileSync(
    "git",
    ["rev-parse", "HEAD"],
    { cwd: root, encoding: "utf8" },
  ).trim(),
  checks: [],
};

const statusOutput = execFileSync(
  process.env.SUPABASE_CLI_PATH ?? "supabase",
  ["status", "-o", "env"],
  {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  },
);

function parseEnvironment(text) {
  const result = {};

  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());

    if (!match) continue;

    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[match[1]] = value;
  }

  return result;
}

const local = parseEnvironment(statusOutput);

assert(local.API_URL, "Missing local API_URL");
assert(local.ANON_KEY, "Missing local ANON_KEY");
assert(local.SERVICE_ROLE_KEY, "Missing local SERVICE_ROLE_KEY");

const api = new URL(local.API_URL);

// Fail closed. This script must never target a remote project.
assert.equal(api.protocol, "http:");
assert.equal(api.hostname, "127.0.0.1");
assert.equal(api.port, "55321");
assert.equal(api.pathname, "/");

report.apiOrigin = api.origin;

function queryLocalDatabase(sql) {
  return execFileSync(
    "docker",
    [
      "exec",
      dbContainer,
      "psql",
      "-X",
      "-A",
      "-t",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      sql,
    ],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    },
  ).trim();
}

function assertSweepGateOff(label) {
  const value = queryLocalDatabase(`
    SELECT enabled
    FROM public.ls_missed_sweep_control
    WHERE singleton = true;
  `);

  assert.equal(value, "f", `${label}: sweep gate is not OFF`);

  report.checks.push({
    name: label,
    status: "PASS",
    enabled: false,
  });
}

async function httpRequest(
  method,
  path,
  apiKey,
  bearer,
  payload,
) {
  const response = await fetch(new URL(path, api.origin), {
    method,
    signal: AbortSignal.timeout(apiTimeoutMs),
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
    ...(payload === undefined
      ? {}
      : { body: JSON.stringify(payload) }),
  });

  const text = await response.text();

  let data = null;

  if (text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { status: response.status, data };
}

function record(name, response) {
  report.checks.push({
    name,
    status: "PASS",
    httpStatus: response.status,
    sqlstate:
      response.data &&
      typeof response.data === "object" &&
      !Array.isArray(response.data)
        ? response.data.code ?? null
        : null,
  });

  process.stdout.write(`PASS ${name}\n`);
}

function assertDenied(name, response) {
  assert(
    response.status === 401 || response.status === 403,
    `${name}: expected HTTP 401/403, received ${response.status}`,
  );

  assert.equal(
    response.data?.code,
    "42501",
    `${name}: expected PostgreSQL permission denial`,
  );

  record(name, response);
}

async function checkDenied(
  name,
  method,
  path,
  apiKey,
  bearer,
  body,
) {
  const response = await httpRequest(
    method,
    path,
    apiKey,
    bearer,
    body,
  );

  assertDenied(name, response);
}

const fixtureKey = randomUUID();

const email =
  `ls-security-${fixtureKey}@example.invalid`;

const password =
  `LS-${randomBytes(24).toString("hex")}!`;

let createdUserId = null;
let failure = null;
let token = null;

try {
  assertSweepGateOff("SEC-00 gate-before");

  // All operational RPCs are expected to exist but must
  // reject anonymous and authenticated browser callers.
  const restrictedOperations = [
    {
      name: "batch",
      path: "/rest/v1/rpc/ls_mark_missed_batch",
      body: { p_batch_size: 1 },
    },
    {
      name: "cron-wrapper",
      path: "/rest/v1/rpc/ls_run_missed_sweep_if_enabled",
      body: {},
    },
  ];

  for (const operation of restrictedOperations) {
    await checkDenied(
      `SEC-anon-${operation.name}`,
      "POST",
      operation.path,
      local.ANON_KEY,
      local.ANON_KEY,
      operation.body,
    );
  }

  await checkDenied(
    "SEC-anon-control-read",
    "GET",
    "/rest/v1/ls_missed_sweep_control?select=singleton,enabled",
    local.ANON_KEY,
    local.ANON_KEY,
  );

  // Create one real temporary Auth user using only the
  // local service-role credential.
  const created = await httpRequest(
    "POST",
    "/auth/v1/admin/users",
    local.SERVICE_ROLE_KEY,
    local.SERVICE_ROLE_KEY,
    {
      email,
      password,
      email_confirm: true,
    },
  );

  assert(
    created.status === 200 || created.status === 201,
    `Local Auth user creation failed: ${created.status}`,
  );

  createdUserId = created.data?.id;

  assert(
    typeof createdUserId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(createdUserId),
    "Auth did not return a valid user ID",
  );

  const signedIn = await httpRequest(
    "POST",
    "/auth/v1/token?grant_type=password",
    local.ANON_KEY,
    local.ANON_KEY,
    { email, password },
  );

  assert.equal(signedIn.status, 200, "Local Auth sign-in failed");
  assert(signedIn.data?.access_token, "Missing authenticated JWT");

  token = signedIn.data.access_token;

  for (const operation of restrictedOperations) {
    await checkDenied(
      `SEC-auth-${operation.name}`,
      "POST",
      operation.path,
      local.ANON_KEY,
      token,
      operation.body,
    );
  }

  await checkDenied(
    "SEC-auth-control-read",
    "GET",
    "/rest/v1/ls_missed_sweep_control?select=singleton,enabled",
    local.ANON_KEY,
    token,
  );

  // Ownership checks: a random session UUID is not owned
  // by this disposable user. No session mutation is possible.
  const nonexistentSession = randomUUID();
  const version = "2026-10-31T00:00:00.000Z";

  const userCommands = [
    {
      name: "start",
      path: "/rest/v1/rpc/ls_start_study_session",
      extra: {},
    },
    {
      name: "complete",
      path: "/rest/v1/rpc/ls_complete_study_session",
      extra: {},
    },
    {
      name: "skip",
      path: "/rest/v1/rpc/ls_skip_study_session",
      extra: { p_reason: null },
    },
    {
      name: "recover",
      path: "/rest/v1/rpc/ls_recover_study_session",
      extra: {},
    },
  ];

  for (const operation of userCommands) {
    const response = await httpRequest(
      "POST",
      operation.path,
      local.ANON_KEY,
      token,
      {
        p_session_id: nonexistentSession,
        p_expected_updated_at: version,
        p_event_key: randomUUID(),
        ...operation.extra,
      },
    );

    assertDenied(`SEC-auth-ownership-${operation.name}`, response);
  }

  // Input validation must run before ownership lookup.
  const invalid = await httpRequest(
    "POST",
    "/rest/v1/rpc/ls_start_study_session",
    local.ANON_KEY,
    token,
    {
      p_session_id: nonexistentSession,
      p_expected_updated_at: version,
      p_event_key: "   ",
    },
  );

  assert.equal(invalid.status, 400);
  assert.equal(invalid.data?.code, "22023");
  record("SEC-auth-invalid-event-key", invalid);

  // This wrapper is harmless while the gate is OFF.
  // Do not call ls_mark_missed_batch directly as service_role.
  const serviceWrapper = await httpRequest(
    "POST",
    "/rest/v1/rpc/ls_run_missed_sweep_if_enabled",
    local.SERVICE_ROLE_KEY,
    local.SERVICE_ROLE_KEY,
    {},
  );

  assert.equal(serviceWrapper.status, 200);
  assert.equal(serviceWrapper.data, 0);

  record("SEC-service-disabled-wrapper", serviceWrapper);

  report.status = "PASS";
} catch (error) {
  failure = error;
  report.status = "FAIL";
  report.error = String(error.message ?? error);
} finally {
  // Revoke the disposable login before deleting its Auth user. Deletion alone
  // does not invalidate an already issued access token.
  if (token) {
    try {
      const signedOut = await httpRequest(
        "POST",
        "/auth/v1/logout?scope=global",
        local.ANON_KEY,
        token,
      );
      assert(
        signedOut.status === 200 || signedOut.status === 204,
        `Auth sign-out failed: ${signedOut.status}`,
      );
      report.sessionSignOut = "PASS";
    } catch (error) {
      failure ??= error;
      report.status = "FAIL";
      report.sessionSignOut = "FAIL";
      report.signOutError = String(error.message ?? error);
    }
  }

  // Never store token, password, anon key or service key.
  token = null;

  if (createdUserId) {
    try {
      const deleted = await httpRequest(
        "DELETE",
        `/auth/v1/admin/users/${createdUserId}`,
        local.SERVICE_ROLE_KEY,
        local.SERVICE_ROLE_KEY,
      );

      assert(
        deleted.status === 200 || deleted.status === 204,
        `Auth cleanup failed: ${deleted.status}`,
      );

      const remaining = queryLocalDatabase(`
        SELECT count(*)
        FROM auth.users
        WHERE id = '${createdUserId}'::uuid;
      `);

      assert.equal(remaining, "0");

      report.userCleanup = "PASS";
    } catch (error) {
      failure ??= error;
      report.status = "FAIL";
      report.userCleanup = "FAIL";
      report.cleanupError = String(error.message ?? error);
    }
  }

  try {
    assertSweepGateOff("SEC-99 gate-after");

    const job = queryLocalDatabase(`
      SELECT count(*)
      FROM cron.job
      WHERE jobname = 'lumivox-learning-schedule-missed-5m'
        AND schedule = '*/5 * * * *'
        AND active = true;
    `);

    assert.equal(job, "1");
    report.cronConfiguration = "PASS";
  } catch (error) {
    failure ??= error;
    report.status = "FAIL";
    report.environmentError = String(error.message ?? error);
  }

  report.finishedAt = new Date().toISOString();

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    JSON.stringify(report, null, 2) + "\n",
    "utf8",
  );
}

if (failure) {
  process.stderr.write(
    `FAIL: ${failure.message ?? String(failure)}\n`,
  );

  process.exitCode = 1;
} else {
  process.stdout.write(
    "PASS: local Attendance HTTP authorization checks\n",
  );
}

