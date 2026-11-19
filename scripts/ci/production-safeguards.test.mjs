import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { releaseVercel, projectId, teamId } from "./production-vercel-release.mjs";

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const yaml = require("js-yaml");
const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/deploy-production.yml", import.meta.url), "utf8"));
const monitor = yaml.load(readFileSync(new URL("../../.github/workflows/task-risk-recovery-monitor.yml", import.meta.url), "utf8"));
const sha = "a".repeat(40);
const env = { EXPECTED_SHA: sha, VERCEL_TOKEN: "fixture-not-a-real-token" };
const project = { id: projectId, rootDirectory: "apps/web",
  link: { type: "github", org: "Horus031", repo: "lumivox", productionBranch: "main" } };
const bash = process.env.TEST_BASH || (process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash");
const root = resolve(new URL("../../", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));

test("preflight is read-only and checks the pinned Vercel project", async () => {
  const calls = [];
  await releaseVercel("preflight", env, async (url, options) => {
    calls.push({ url, ...options });
    return { ok: true, json: async () => project };
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].url, `https://api.vercel.com/v9/projects/${projectId}?teamId=${teamId}`);
});

test("Vercel receives the tested SHA and production target", async () => {
  const calls = [];
  const result = await releaseVercel("deploy", env, async (url, options) => {
    calls.push({ url, ...options });
    return { ok: true, json: async () => calls.length === 1 ? project : { id: "dpl_fixture", gitSource: { sha } } };
  });
  assert.equal(result.deploymentId, "dpl_fixture");
  assert.deepEqual(JSON.parse(calls[1].body), {
    name: "lumivox", project: projectId, target: "production",
    gitSource: { type: "github", org: "Horus031", repo: "lumivox", ref: "main", sha },
  });
});

for (const [label, values] of Object.entries({
  missing_token: { ...env, VERCEL_TOKEN: "" },
  branch_instead_of_SHA: { ...env, EXPECTED_SHA: "main" },
})) test(`reject ${label} without making an API call`, async () => {
  await assert.rejects(releaseVercel("deploy", values, () => assert.fail("Unexpected request")));
});

for (const [label, value] of Object.entries({
  wrong_project: { ...project, id: "other" },
  wrong_root: { ...project, rootDirectory: null },
  wrong_repo: { ...project, link: { ...project.link, repo: "other" } },
  wrong_branch: { ...project, link: { ...project.link, productionBranch: "product-release" } },
})) test(`reject ${label} before POST`, async () => {
  let count = 0;
  await assert.rejects(releaseVercel("deploy", env, async (_, options) => {
    count++;
    assert.equal(options.method, "GET");
    return { ok: true, json: async () => value };
  }));
  assert.equal(count, 1);
});

test("API authentication failure blocks deployment", async () => {
  await assert.rejects(releaseVercel("deploy", env, async () => ({ ok: false, status: 401 })), /HTTP 401/);
});

function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), "lumivox-9c-"));
  try { return run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function script(dir, name, body) {
  writeFileSync(join(dir, name), "#!/bin/bash\nset -euo pipefail\n" + body + "\n", { mode: 0o700 });
}
function sh(dir, body, extra = {}) {
  const file = join(dir, "run.sh");
  writeFileSync(file, "set -euo pipefail\n" + body);
  return spawnSync(bash, [file.replaceAll("\\", "/")], {
    cwd: root, encoding: "utf8", timeout: 20_000,
    env: { ...process.env, ...extra, FIXTURE_DIR: dir.replaceAll("\\", "/") },
  });
}
const releaseSteps = workflow.jobs.deploy.steps.filter(step => step.run);

function releaseFixture(failure, extra = {}) {
  return fixture(dir => {
    const log = join(dir, "events");
    for (const name of ["git", "node", "supabase", "curl", "bash", "jq"]) {
      script(dir, name, `echo "${name} $*" >> "$FIXTURE_DIR/events"
if [[ "$*" == "${failure || "no-failure-sentinel"}" || "$*" == *"${failure && failure !== "db push --linked" ? failure : "no-failure-sentinel"}"* ]]; then exit 1; fi
${name === "git" ? 'printf "%s\\trefs/heads/main\\n" "$CURRENT_MAIN"' : name === "jq" ? 'echo model-fixture' : ":"}`);
    }
    const result = sh(dir, 'export PATH="$(cd "$FIXTURE_DIR" && pwd):$PATH"\n' + releaseSteps.map(s => s.run).join("\n"), {
      SUPABASE_PROJECT_ID: "lslybjylsxtnznghrtyj", WEB_URL: "https://www.lumivox.it.com",
      AI_API_URL: "https://lumivox-ai-api.onrender.com", SUPABASE_ACCESS_TOKEN: "fixture",
      SUPABASE_DB_PASSWORD: "fixture", EXPECTED_SHA: sha, CURRENT_MAIN: sha,
      RENDER_DEPLOY_HOOK: "https://api.render.com/deploy/srv-d87k12rtqb8s73c0ih10?key=fixture",
      ...extra,
    });
    return { ...result, events: existsSync(log) ? readFileSync(log, "utf8") : "" };
  });
}
test("workflow executes database, Render readiness, Vercel, Web readiness in order", () => {
  const result = releaseFixture();
  assert.equal(result.status, 0, result.stdout + result.stderr + result.events);
  const markers = ["production-vercel-release.mjs preflight", "db push --linked --dry-run",
    "supabase db push --linked\n", "curl ", "api/v1/health", "production-vercel-release.mjs deploy", "/api/health"];
  let index = -1;
  for (const marker of markers) {
    const next = result.events.indexOf(marker, index + 1);
    assert.ok(next > index, result.events);
    index = next;
  }
});
for (const failure of ["preflight", "--dry-run", "db push --linked\n", "api.render.com/deploy", "api/v1/health"]) {
  test(`workflow failure at ${failure.trim()} prevents Web deployment`, () => {
    // A trailing newline distinguishes apply from dry-run for the fixture below.
    const result = releaseFixture(failure === "db push --linked\n" ? "db push --linked" : failure);
    assert.notEqual(result.status, 0);
    assert.ok(result.events.includes(failure.trim()), result.events);
    assert.ok(!result.events.includes("production-vercel-release.mjs deploy"), result.events);
  });
}
test("a stale CI SHA stops before database commands", () => {
  const result = releaseFixture(null, { CURRENT_MAIN: "b".repeat(40) });
  assert.notEqual(result.status, 0);
  assert.ok(!result.events.includes("supabase"));
});
test("a Staging database target stops before external commands", () => {
  const result = releaseFixture(null, { SUPABASE_PROJECT_ID: "atbdbbamqjmfkvahqidj" });
  assert.notEqual(result.status, 0);
  assert.equal(result.events, "");
});

test("monitor preserves isolated environments and independent enable variables", () => {
  assert.equal(monitor.jobs.monitor.strategy["fail-fast"], false);
  assert.deepEqual(monitor.jobs.monitor.strategy.matrix.include, [
    { target: "staging", environment: "staging", enabled_variable: "TASK_RISK_MONITOR_ENABLED" },
    { target: "production", environment: "production-monitor", enabled_variable: "TASK_RISK_PRODUCTION_MONITOR_ENABLED" },
  ]);
  assert.equal(monitor.jobs.monitor.environment.name, "${{ matrix.environment }}");
  assert.equal(monitor.jobs.monitor.permissions, undefined);
  assert.equal(monitor.permissions.contents, "read");
});
test("synthetic notification test fails without checking out code or using secrets", () => {
  const job = monitor.jobs["notification-test"];
  assert.match(job.if, /workflow_dispatch/);
  assert.equal(job.steps.length, 1);
  assert.ok(!JSON.stringify(job).includes("secrets."));
  const result = fixture(dir => sh(dir, job.steps[0].run, { GITHUB_STEP_SUMMARY: join(dir, "summary") }));
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Synthetic 9C notification test/);
});

for (const [name, pgHost, pgUser, target] of [
  ["production rejects Staging", "db.atbdbbamqjmfkvahqidj.supabase.co", "observer", "production"],
  ["staging rejects Production", "db.lslybjylsxtnznghrtyj.supabase.co", "observer", "staging"],
  ["pooler rejects wrong project", "aws-0-region.pooler.supabase.com", "observer.atbdbbamqjmfkvahqidj", "production"],
]) test(name, () => {
  const result = fixture(dir => sh(dir, `bash scripts/ci/task-risk-monitor.sh ${target}`, {
    PGHOST: pgHost, PGUSER: pgUser, PGPASSWORD: "fixture", TASK_RISK_MONITOR_CA_PEM: "fixture",
    GITHUB_STEP_SUMMARY: join(dir, "summary"),
  }));
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /does not match/);
});

for (const [name, status, snapshot] of [
  ["healthy", 0, '{"alerts":[]}'],
  ["operational alert", 1, '{"alerts":["cron_failure"]}'],
  ["unavailable", 2, ""],
]) test(`monitor propagates ${name} and removes the temporary CA`, () => {
  fixture(dir => {
    script(dir, "node", `test "$PGSSLMODE" = verify-full
test "$PGDATABASE" = postgres
test -s "$PGSSLROOTCERT"
printf '%s' "$PGSSLROOTCERT" > "$FIXTURE_DIR/ca-path"
printf '%s' '${snapshot}'
exit ${status}`);
    const result = sh(dir, 'export PATH="$(cd "$FIXTURE_DIR" && pwd):$PATH"\n/bin/bash scripts/ci/task-risk-monitor.sh production', {
      PGHOST: "db.lslybjylsxtnznghrtyj.supabase.co", PGUSER: "observer", PGPASSWORD: "fixture",
      TASK_RISK_MONITOR_CA_PEM: "fixture-ca", GITHUB_STEP_SUMMARY: join(dir, "summary"),
    });
    assert.equal(result.status, status, result.stderr);
    assert.match(readFileSync(join(dir, "summary"), "utf8"), /production/);
    const caPath = readFileSync(join(dir, "ca-path"), "utf8");
    const check = sh(dir, `test ! -e "${caPath}"`);
    assert.equal(check.status, 0, "Temporary CA was not removed");
  });
});


for (const [label, http, revision, model, expected] of [
  ["ready revision and model", "200", sha, "model-fixture", 0],
  ["non-200 despite a healthy-looking body", "403", sha, "model-fixture", 1],
  ["old serving revision", "200", "b".repeat(40), "model-fixture", 1],
  ["wrong model", "200", sha, "old-model", 1],
]) test(`readiness: ${label}`, () => {
  fixture(dir => {
    script(dir, "curl", `while (( $# )); do
  if [[ "$1" == "--output" ]]; then shift; printf '{}' > "$1"; fi
  shift
done
printf '%s|https://fixture.invalid/health|application/json' "$FIXTURE_HTTP"`);
    script(dir, "jq", `case "$*" in
  *'.models.native_task_risk.status'*) echo ready ;;
  *'.models.native_task_risk.model_version'*) echo "$FIXTURE_MODEL" ;;
  *'.status'*) echo ok ;;
  *'.revision'*) echo "$FIXTURE_REVISION" ;;
  *) exit 2 ;;
esac`);
    // Rejecting a first poll exits through this stub instead of sleeping/retrying.
    script(dir, "sleep", "exit 1");
    const result = sh(dir, 'export PATH="$(cd "$FIXTURE_DIR" && pwd):$PATH"\n/bin/bash scripts/ci/wait-for-revision.sh https://fixture.invalid/health "$FIXTURE_SHA" 900 model-fixture', {
      FIXTURE_HTTP: http, FIXTURE_REVISION: revision, FIXTURE_MODEL: model, FIXTURE_SHA: sha,
    });
    assert.equal(result.status, expected, result.stdout + result.stderr);
  });
});
