import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptanceConfig, sqlValue } from "./task-risk-acceptance-db";

const stage = "atbdbbamqjmfkvahqidj";
const production = "aaaaaaaaaaaaaaaaaaaa";
const app = "https://staging.example.test";

beforeEach(() => {
  vi.stubEnv("TASK_RISK_ACCEPTANCE_TARGET", "staging");
  vi.stubEnv("TASK_RISK_ACCEPTANCE_SUPABASE_CLI", undefined);
  vi.stubEnv("TASK_RISK_ACCEPTANCE_ORIGIN", app);
  vi.stubEnv("TASK_RISK_ACCEPTANCE_DATABASE_URL", `postgresql://postgres:fixture@db.${stage}.supabase.co/postgres`);
  vi.stubEnv("TASK_RISK_ACCEPTANCE_PROJECT_REF", stage);
  vi.stubEnv("TASK_RISK_ACCEPTANCE_SUPABASE_ORIGIN", `https://${stage}.supabase.co`);
  vi.stubEnv("TASK_RISK_ACCEPTANCE_USER_ID", "a0000000-0000-4000-8000-000000000001");
  vi.stubEnv("TASK_RISK_ACCEPTANCE_EMAIL", "fixture@example.test");
  vi.stubEnv("TASK_RISK_ACCEPTANCE_REVISION", "a".repeat(40));
});

afterEach(() => vi.unstubAllEnvs());

describe("Task Risk acceptance targets", () => {
  it("accepts matching staging origins and a project-qualified database", () => {
    expect(acceptanceConfig(app).api.origin).toBe(`https://${stage}.supabase.co`);
    vi.stubEnv("TASK_RISK_ACCEPTANCE_DATABASE_URL",
      `postgresql://postgres.${stage}:fixture@aws-0-region.pooler.supabase.com:5432/postgres`);
    expect(acceptanceConfig(app).target).toBe("staging");
  });

  it("rejects a different browser origin and unrelated database", () => {
    expect(() => acceptanceConfig("https://other.example.test")).toThrow("matching PLAYWRIGHT_BASE_URL");
    vi.stubEnv("TASK_RISK_ACCEPTANCE_DATABASE_URL", "postgresql://postgres:fixture@db.other.supabase.co/postgres");
    expect(() => acceptanceConfig(app)).toThrow("must identify the same expected project");
  });

  it("rejects using the confirmed Production project as QA", () => {
    vi.stubEnv("TASK_RISK_ACCEPTANCE_TARGET", "qa");
    vi.stubEnv("TASK_RISK_ACCEPTANCE_PROJECT_REF", production);
    vi.stubEnv("TASK_RISK_ACCEPTANCE_PRODUCTION_PROJECT_REF", production);
    vi.stubEnv("TASK_RISK_ACCEPTANCE_SUPABASE_ORIGIN", `https://${production}.supabase.co`);
    vi.stubEnv("TASK_RISK_ACCEPTANCE_DATABASE_URL", `postgresql://postgres:fixture@db.${production}.supabase.co/postgres`);
    expect(() => acceptanceConfig(app)).toThrow("QA must be distinct");
  });

  it("allows the CLI transport only for the pinned Staging project", () => {
    vi.stubEnv("TASK_RISK_ACCEPTANCE_SUPABASE_CLI", "supabase");
    vi.stubEnv("TASK_RISK_ACCEPTANCE_DATABASE_URL", undefined);
    expect(acceptanceConfig(app).target).toBe("staging");
    vi.stubEnv("TASK_RISK_ACCEPTANCE_TARGET", "qa");
    expect(() => acceptanceConfig(app)).toThrow("must identify the same expected project");
  });

  it("requires every destination to be loopback for rehearsal", () => {
    vi.stubEnv("TASK_RISK_ACCEPTANCE_TARGET", "rehearsal");
    expect(() => acceptanceConfig(app)).toThrow("require loopback");
  });

  it("serializes fixture text without embedding raw SQL delimiters", () => {
    expect(sqlValue("'); --")).toBe("convert_from(decode('27293b202d2d','hex'),'UTF8')");
  });
});
