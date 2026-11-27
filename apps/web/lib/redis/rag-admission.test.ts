import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMISSION_SCRIPT, admitRagOperation, canonicalRagDocumentIds, checkRagAdmission, createRagRequestFingerprint } from "./rag-admission";

const { evalScript, transport } = vi.hoisted(() => ({ evalScript: vi.fn(), transport: vi.fn() }));
vi.mock("./redis", () => ({ getRedisClient: () => ({ eval: evalScript }) }));
vi.mock("./rate-limit", () => ({ checkRateLimit: transport, formatRateLimitMessage: () => "Limited" }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RAG_RESOURCE_NAMESPACE", `test-${randomUUID()}`);
});
afterEach(() => vi.unstubAllEnvs());

it("ADM08 blocks transport exhaustion before logical admission", async () => {
  transport.mockResolvedValue({ success: false, reset: Date.now() + 60_000 });
  expect(await checkRagAdmission("user", "ask", "request", {})).toMatchObject({ code: "RAG_RATE_LIMITED" });
  expect(evalScript).not.toHaveBeenCalled();
});

it("ADM09 fails closed when Redis is unavailable", async () => {
  transport.mockResolvedValue({ success: true });
  evalScript.mockRejectedValue(new Error("Redis unavailable"));
  expect(await checkRagAdmission("user", "ask", "request", {})).toMatchObject({ code: "RAG_RESOURCE_CONTROL_UNAVAILABLE" });
});

it("ADM10 hashes canonical document IDs", () => {
  const fingerprint = (ids: string[]) => createRagRequestFingerprint({ ids: canonicalRagDocumentIds(ids) });
  expect(fingerprint(["B", "a", "b"])).toBe(fingerprint(["a", "b"]));
});

const port = process.env.RAG_TEST_REDIS_PORT;
const container = process.env.RAG_TEST_REDIS_CONTAINER;
const exec = promisify(execFile);

async function redis(...args: string[]) {
  const { stdout } = container
    ? await exec("docker", ["exec", container, "redis-cli", "--json", ...args])
    : await exec("redis-cli", ["-p", port ?? "6379", "--json", ...args]);
  return JSON.parse(stdout);
}

describe.runIf(Boolean(port || container))("Redis admission", () => {
  const admit = (clientRequestId: string, fingerprint = "payload", userId = "user", operation: "ask" | "new_chat" = "ask") =>
    admitRagOperation({ userId, clientRequestId, fingerprint, operation });

  beforeEach(() => {
    evalScript.mockImplementation((script: string, keys: string[], args: unknown[]) =>
      redis("EVAL", script, String(keys.length), ...keys, ...args.map(String)));
  });

  it("ADM01–07 isolates logical quota and atomically replays the same payload", async () => {
    const first = await Promise.all([admit("same"), admit("same")]);
    expect(first.map((result) => result.status).sort()).toEqual(["admitted", "replay"]);
    expect(await admit("same", "changed")).toEqual({ status: "conflict" });
    expect(await admit("same", "changed", "other")).toEqual({ status: "admitted" });
    expect(await admit("same", "changed", "user", "new_chat")).toEqual({ status: "admitted" });
    const results = await Promise.all(Array.from({ length: 10 }, (_, index) => admit(`id-${index}`)));
    expect(results.filter((result) => result.status === "admitted")).toHaveLength(9);
    expect(results.filter((result) => result.status === "limited")).toHaveLength(1);
    expect(await admit("same")).toEqual({ status: "replay" });
  });

  it("ADM11 expires the marker using actual Redis TTL", async () => {
    const key = `admission-test:${randomUUID()}`;
    const run = (hash: string) => redis("EVAL", ADMISSION_SCRIPT, "2", `${key}:request`, `${key}:quota`, hash, "id", "1", "1", "1");
    expect((await run("first"))[0]).toBe("admitted");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect((await run("second"))[0]).toBe("admitted");
  });

  it("ADM12 isolates namespaces", async () => {
    expect(await admit("same")).toEqual({ status: "admitted" });
    vi.stubEnv("RAG_RESOURCE_NAMESPACE", `test-other-${randomUUID()}`);
    expect(await admit("same", "new payload")).toEqual({ status: "admitted" });
  });
});
