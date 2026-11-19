import type {
  FakeProviderOutcome,
  FakeReminderRequest,
  ReminderProvider,
} from "./fake-reminder-provider";

export type ReminderClaim = { jobId: string; leaseToken: string };
export type ReminderAuthorization =
  | { authorized: true; request: FakeReminderRequest }
  | { authorized: false; reason: string };

/** Trusted adapter only. Each method must complete/COMMIT its own short DB
 * transaction before resolving. No service-role credentials enter this module. */
export interface FakeDispatchStore {
  claim(): Promise<ReminderClaim[]>;
  authorize(claim: ReminderClaim): Promise<ReminderAuthorization>;
  record(claim: ReminderClaim, outcome: FakeProviderOutcome): Promise<unknown>;
}

export function assertLocalReminderTarget(databaseApiUrl: string): void {
  const url = new URL(databaseApiUrl);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.port !== "55321" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Fake reminder dispatcher requires Lumivox local Supabase");
  }
}

/** One bounded local fake batch; no route/Cron or remote provider activation.
 * A durable handoff is single-use. If recording fails, leave submitting for
 * reconciliation; NEVER resubmit in this invocation or retry authorization. */
export async function dispatchFakeReminderBatch(
  databaseApiUrl: string,
  store: FakeDispatchStore,
  provider: ReminderProvider,
) {
  assertLocalReminderTarget(databaseApiUrl);
  const claims = await store.claim();
  if (claims.length > 25) throw new Error("Claim batch exceeded 25");
  let submissions = 0;
  for (const claim of claims) {
    const authorization = await store.authorize(claim);
    if (!authorization.authorized) continue;
    let outcome: FakeProviderOutcome;
    try {
      submissions++;
      outcome = await provider.submit(authorization.request);
    } catch {
      // A thrown/transport error cannot prove the provider did not accept.
      outcome = { kind: "uncertain", code: "timeout" };
    }
    await store.record(claim, outcome);
  }
  return { claimed: claims.length, submissions };
}
