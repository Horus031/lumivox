import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "./rate-limit";

const provider = vi.hoisted(() => ({ client: vi.fn(), limit: vi.fn() }));

vi.mock("@/lib/redis/redis", () => ({ getRedisClient: provider.client }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow = vi.fn();
    limit = provider.limit;
  },
}));

const config = { key: "task-risk-recovery:test-owner", limit: 10, window: "1 h", mode: "fail-closed" } as const;

beforeEach(() => {
  vi.resetAllMocks();
  provider.client.mockReturnValue({});
});

describe("Recovery Redis protection", () => {
  it("preserves a provider quota rejection and reset time", async () => {
    provider.limit.mockResolvedValue({ success: false, limit: 10, remaining: 0, reset: 12345 });
    await expect(checkRateLimit(config)).resolves.toEqual({
      success: false, limit: 10, remaining: 0, reset: 12345,
    });
    expect(provider.limit).toHaveBeenCalledWith(config.key);
  });

  it("denies ML when configured Redis returns an error", async () => {
    provider.limit.mockRejectedValue(new Error("connection unavailable"));
    await expect(checkRateLimit(config)).resolves.toMatchObject({ success: false, remaining: 0 });
    expect(provider.limit).toHaveBeenCalledOnce();
  });
});
