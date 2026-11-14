export type FakeProviderOutcome =
  | { kind: "accepted"; messageId: string }
  | { kind: "transient"; code: "rate_limited" | "server_error"; retryAfterMs?: number }
  | { kind: "permanent"; code: "invalid_recipient" | "rejected" }
  | { kind: "uncertain"; code: "response_lost" | "timeout" };

export type FakeReminderRequest = {
  jobId: string;
  attemptNumber: number;
  idempotencyKey: string;
  locale: "en" | "vi";
  sessionStartAt: string;
};

export interface ReminderProvider {
  submit(request: FakeReminderRequest): Promise<FakeProviderOutcome>;
}

/** Local deterministic fake. No address/content storage, network or email SDK. */
export class FakeReminderProvider implements ReminderProvider {
  private readonly simulate: (
    request: FakeReminderRequest,
  ) => FakeProviderOutcome | Promise<FakeProviderOutcome>;

  constructor(
    simulate: (request: FakeReminderRequest) => FakeProviderOutcome | Promise<FakeProviderOutcome>,
  ) {
    this.simulate = simulate;
  }

  async submit(request: FakeReminderRequest): Promise<FakeProviderOutcome> {
    return this.simulate(request);
  }
}
