import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const canary = "fixture-credential-do-not-expose-000000";
const oidcCanary = "fixture-oidc-value";
const token = Buffer.alloc(32, 4).toString("base64url");
const path = "/api/study-reminders/unsubscribe";
const apps = new URL("../../", import.meta.url);
const bundled = await build({
  stdin: {
    contents: 'export * from "./handler"; export * from "./bridge";',
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
  },
  platform: "node",
  format: "esm",
  bundle: true,
  write: false,
});
const source = bundled.outputFiles[0].text;
const { handleIngress, consumeThroughBridge } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

test("isolated HTTP ingress, rate-limit decisions and secret boundaries", async (t) => {
  const requests = [];
  let limit = "allow";
  let upstream = 204;
  const ports = {
    async isRateLimited() {
      if (limit === "unavailable") throw Error(canary);
      return limit === "block";
    },
    consume: (hash) =>
      consumeThroughBridge(
        hash,
        {
          UNSUBSCRIBE_BRIDGE_ORIGIN: "https://protected.example.invalid",
          UNSUBSCRIBE_BRIDGE_SECRET: canary,
        },
        async () => oidcCanary,
        async (url, init) => {
          requests.push({ url, init });
          return new Response(null, { status: upstream });
        },
      ),
  };
  const server = createServer(async (req, res) => {
    const request = new Request(`http://127.0.0.1${req.url}`, {
      method: req.method,
      headers: req.headers,
      ...(req.method === "POST" ? { body: req, duplex: "half" } : {}),
    });
    const response = await handleIngress(request, ports);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const get = (path) => fetch(origin + path, { redirect: "manual" });
  const post = (capability = token) =>
    fetch(`${origin}${path}?token=${capability}`, {
      method: "POST",
      body: new URLSearchParams({ "List-Unsubscribe": "One-Click" }),
      redirect: "manual",
    });
  assert.equal((await get(path)).status, 200);
  assert.equal((await post("invalid")).status, 400);
  for (const route of [
    "/",
    "/en/admin",
    "/api/internal/study-reminders/dispatch",
    "/api/internal/learning-schedule/health",
    "/api/internal/study-reminders/unsubscribe",
    "/handler.ts",
    "/package.json",
    path + "/",
  ]) {
    assert.equal((await get(route)).status, 404);
  }
  limit = "block";
  const limited = await post();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("location"), null);
  assert.match(limited.headers.get("content-type"), /^text\/plain/);
  limit = "unavailable";
  assert.equal((await post()).status, 503);
  assert.equal(requests.length, 0);
  limit = "allow";
  const accepted = await post();
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get("location"), null);
  const result = await accepted.text();
  assert(!result.includes(canary) && !result.includes(token) && !result.includes(oidcCanary));
  assert.equal(requests.length, 1);
  const [{ url, init }] = requests;
  assert.equal(
    url.href,
    "https://protected.example.invalid/api/internal/study-reminders/unsubscribe",
  );
  assert.equal(init.redirect, "error");
  assert.equal(init.headers.Authorization, `Bearer ${canary}`);
  assert.equal(init.headers["x-vercel-trusted-oidc-idp-token"], oidcCanary);
  assert.match(init.headers["x-lumivox-unsubscribe-hash"], /^[a-f0-9]{64}$/);
  upstream = 404;
  assert.equal((await post()).status, 503);
  assert(!source.includes(canary) && !source.includes(oidcCanary));
});

test("the Vercel entry bundles with no frontend or Supabase credential", async () => {
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL("unsubscribe-ingress/api/study-reminders/unsubscribe.ts", apps)),
    ],
    platform: "node",
    format: "esm",
    bundle: true,
    write: false,
    metafile: true,
  });
  const output = result.outputFiles[0].text;
  assert(!output.includes(canary) && !output.includes("SUPABASE_SERVICE_ROLE_KEY"));
  assert(
    !Object.keys(result.metafile.inputs).some((file) =>
      /resend-reminder-dispatcher|unsubscribe-persistence|app\/.*\/page\./.test(file),
    ),
  );
});
