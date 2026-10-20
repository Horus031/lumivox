// @vitest-environment node

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { GET } from "./route";

const endpoint = "https://lumivox.test/api/extension/me";

function request(token?: string): Request {
  return new Request(endpoint, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");

  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-public-key");

  mocks.createClient.mockReturnValue({
    auth: {
      getUser: mocks.getUser,
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Extension identity verification endpoint", () => {
  it("rejects missing tokens", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("rejects invalid tokens", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid JWT" },
    });

    const response = await GET(request("invalid-token"));

    expect(response.status).toBe(401);

    expect(mocks.getUser).toHaveBeenCalledWith("invalid-token");
  });

  it("only returns the verified identity", async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "verified-user",
          email: "student@example.test",
          role: "authenticated",
          app_metadata: {
            provider: "email",
          },
        },
      },
      error: null,
    });

    const response = await GET(request("valid-token"));

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      user: {
        id: "verified-user",
        email: "student@example.test",
      },
    });

    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects malformed authorization headers", async () => {
    const response = await GET(
      new Request(endpoint, {
        headers: {
          Authorization: "Basic credentials",
        },
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("does not return account data on auth failure", async () => {
    mocks.getUser.mockRejectedValue(new Error("Auth server unavailable"));

    const response = await GET(request("unknown-token"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Authentication unavailable",
    });
  });
});
