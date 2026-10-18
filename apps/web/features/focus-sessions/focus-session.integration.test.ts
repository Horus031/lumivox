// Run against a disposable local/staging Supabase with FOCUS_TEST_SUPABASE_URL,
// FOCUS_TEST_SUPABASE_PUBLISHABLE_KEY and FOCUS_TEST_SUPABASE_SECRET_KEY.
// Never set these variables to a production project.
// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";

const url = process.env.FOCUS_TEST_SUPABASE_URL;
const publicKey = process.env.FOCUS_TEST_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.FOCUS_TEST_SUPABASE_SECRET_KEY;

it.skipIf(!url || !publicKey || !secretKey)("PostgREST enforces ownership, active uniqueness and competing clock updates", async () => {
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url!, secretKey!, options);
  const users: string[] = [];
  try {
    const clients = [];
    for (let index = 0; index < 2; index++) {
      const email = `focus-phase1-${randomUUID()}@example.test`;
      const password = randomUUID();
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      expect(error).toBeNull();
      users.push(data.user!.id);
      const client = createClient(url!, publicKey!, options);
      const login = await client.auth.signInWithPassword({ email, password });
      expect(login.error).toBeNull();
      clients.push(client);
    }
    const [owner, other] = clients;
    const inserts = await Promise.all([0, 1].map(() => owner.from("focus_sessions").insert({ user_id: users[0], planned_minutes: 25 }).select("id").single()));
    expect(inserts.filter(result => !result.error)).toHaveLength(1);
    expect(inserts.find(result => result.error)?.error?.code).toBe("23505");
    const id = inserts.find(result => result.data)?.data!.id;
    // Deliberately omit user_id here: this verifies RLS itself.
    const forbidden = await other.from("focus_sessions").update({ status: "cancelled" }).eq("id", id).select("id").maybeSingle();
    expect(forbidden.error).toBeNull();
    expect(forbidden.data).toBeNull();
    const pausedAt = new Date(Date.now() - 60_000).toISOString();
    const paused = await owner.from("focus_sessions").update({ status: "paused", paused_at: pausedAt }).eq("id", id).eq("user_id", users[0]).eq("status", "ongoing").select("id").maybeSingle();
    expect(paused.error).toBeNull();
    expect(paused.data?.id).toBe(id);
    const resume = () => owner.from("focus_sessions").update({ status: "ongoing", paused_at: null, total_paused_seconds: 60 }).eq("id", id).eq("user_id", users[0]).eq("status", "paused").eq("paused_at", pausedAt).eq("total_paused_seconds", 0).select("id").maybeSingle();
    const resumed = await Promise.all([resume(), resume()]);
    expect(resumed.every(result => !result.error)).toBe(true);
    expect(resumed.filter(result => result.data)).toHaveLength(1);
    const complete = () => owner.from("focus_sessions").update({ status: "completed", ended_at: new Date().toISOString(), actual_focus_minutes: 0 }).eq("id", id).eq("user_id", users[0]).eq("status", "ongoing").eq("total_paused_seconds", 60).is("paused_at", null).select("id").maybeSingle();
    const completed = await Promise.all([complete(), complete()]);
    expect(completed.every(result => !result.error)).toBe(true);
    expect(completed.filter(result => result.data)).toHaveLength(1);
  } finally {
    for (const id of users) {
      const { error } = await admin.auth.admin.deleteUser(id);
      expect(error).toBeNull();
    }
  }
}, 60_000);
