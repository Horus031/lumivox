// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signOut } }),
}));

import { POST } from "./route";

describe("sign out route", () => {
  beforeEach(() => signOut.mockReset());

  it("signs out before redirecting to the home page with GET", async () => {
    signOut.mockResolvedValue({ error: null });
    const response = await POST(new Request("https://lumivox.test/auth/signout", { method: "POST" }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://lumivox.test/");
  });

  it("does not report successful sign out when Supabase fails", async () => {
    signOut.mockResolvedValue({ error: { message: "Upstream unavailable" } });
    const response = await POST(new Request("https://lumivox.test/auth/signout", { method: "POST" }));
    expect(response.status).toBe(500);
    expect(response.headers.has("location")).toBe(false);
  });
});
