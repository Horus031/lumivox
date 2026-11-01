
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: mocks.auth,
}));

import {
  mutateStudySessionAttendanceAction,
  type AttendanceCommand,
} from "./session-attendance.actions";

const sessionId =
  "00000000-0000-4000-8000-000000000001";

const eventKey =
  "00000000-0000-4000-8000-000000000002";

const base = {
  sessionId,
  expectedUpdatedAt: "2026-11-01T12:00:00Z",
  eventKey,
};

describe("Attendance Server Action", () => {
  let rpc: ReturnType<typeof vi.fn>;
  let abortSignal: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();

    abortSignal = vi.fn().mockResolvedValue({
      data: sessionId,
      error: null,
    });

    rpc = vi.fn().mockReturnValue({
      abortSignal,
    });

    mocks.auth.mockResolvedValue({
      supabase: { rpc },
      user: { id: "fixture-owner" },
    });
  });

  it.each([
    {
      command: "start",
      rpcName: "ls_start_study_session",
    },
    {
      command: "complete",
      rpcName: "ls_complete_study_session",
    },
    {
      command: "recover",
      rpcName: "ls_recover_study_session",
    },
  ] as const)(
    "dispatches $command to the correct RPC",
    async ({ command, rpcName }) => {
      const result =
        await mutateStudySessionAttendanceAction({
          command,
          ...base,
        });

      expect(result).toEqual({
        success: true,
        sessionId,
      });

      expect(rpc).toHaveBeenCalledExactlyOnceWith(
        rpcName,
        {
          p_session_id: sessionId,
          p_expected_updated_at:
            base.expectedUpdatedAt,
          p_event_key: eventKey,
        },
      );

      expect(abortSignal).toHaveBeenCalledWith(
        expect.any(AbortSignal),
      );
    },
  );

  it("normalizes Skip reason before RPC", async () => {
    const result =
      await mutateStudySessionAttendanceAction({
        command: "skip",
        ...base,
        reason: "  Personal appointment  ",
      });

    expect(result).toEqual({
      success: true,
      sessionId,
    });

    expect(rpc).toHaveBeenCalledWith(
      "ls_skip_study_session",
      {
        p_session_id: sessionId,
        p_expected_updated_at:
          base.expectedUpdatedAt,
        p_event_key: eventKey,
        p_reason: "Personal appointment",
      },
    );
  });

  it.each([
    undefined,
    null,
    "",
    "   ",
  ])(
    "normalizes optional blank Skip reason to null: %s",
    async reason => {
      await mutateStudySessionAttendanceAction({
        command: "skip",
        ...base,
        reason,
      });

      expect(rpc).toHaveBeenCalledWith(
        "ls_skip_study_session",
        expect.objectContaining({
          p_reason: null,
        }),
      );
    },
  );

  it.each([
    { command: "invalid", ...base },
    { command: "start", ...base, sessionId: "bad" },
    { command: "start", ...base, eventKey: "bad" },
    {
      command: "complete",
      ...base,
      expectedUpdatedAt: "not-a-date",
    },
    {
      command: "skip",
      ...base,
      reason: "x".repeat(501),
    },
    {
      command: "recover",
      ...base,
      userId: "forged-user",
    },
    {
      command: "start",
      ...base,
      now: "2030-01-01T00:00:00Z",
    },
  ])(
    "rejects invalid or additional fields before auth",
    async payload => {
      const result =
        await mutateStudySessionAttendanceAction(
          payload,
        );

      expect(result).toMatchObject({
        success: false,
        code: "invalidInput",
      });

      expect(mocks.auth).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      dbCode: "PT409",
      expected: "conflict",
    },
    {
      dbCode: "42501",
      expected: "notAuthorized",
    },
    {
      dbCode: "22023",
      expected: "notEligible",
    },
    {
      dbCode: "XX000",
      expected: "saveFailed",
    },
  ])(
    "maps $dbCode to $expected without leaking SQL",
    async ({ dbCode, expected }) => {
      abortSignal.mockResolvedValue({
        data: null,
        error: {
          code: dbCode,
          message: "Sensitive database details",
        },
      });

      const result =
        await mutateStudySessionAttendanceAction({
          command: "complete",
          ...base,
        });

      expect(result).toMatchObject({
        success: false,
        code: expected,
      });

      if (!result.success) {
        expect(result.message).not.toContain(
          "Sensitive database details",
        );
      }
    },
  );

  it("reports network errors as uncertain", async () => {
    abortSignal.mockResolvedValue({
      data: null,
      error: {
        code: "",
        message: "connection reset",
      },
    });

    const result =
      await mutateStudySessionAttendanceAction({
        command: "complete",
        ...base,
      });

    expect(result).toMatchObject({
      success: false,
      code: "uncertain",
      uncertain: true,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("does not automatically retry a thrown failure", async () => {
    abortSignal.mockRejectedValue(
      new Error("request timed out"),
    );

    const result =
      await mutateStudySessionAttendanceAction({
        command: "recover",
        ...base,
      });

    expect(result).toMatchObject({
      success: false,
      code: "uncertain",
      uncertain: true,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("does not report success on unexpected RPC data", async () => {
    abortSignal.mockResolvedValue({
      data: "different-session-id",
      error: null,
    });

    const result =
      await mutateStudySessionAttendanceAction({
        command: "start",
        ...base,
      });

    expect(result).toMatchObject({
      success: false,
      code: "uncertain",
      uncertain: true,
    });
  });

  it("handles authentication failure before dispatch", async () => {
    mocks.auth.mockRejectedValue(
      new Error("not authenticated"),
    );

    const result =
      await mutateStudySessionAttendanceAction({
        command: "start",
        ...base,
      });

    expect(result).toMatchObject({
      success: false,
      code: "notAuthorized",
    });

    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps command identity stable across exact retries", async () => {
    const command: AttendanceCommand = {
      command: "complete",
      ...base,
    };

    const first =
      await mutateStudySessionAttendanceAction(command);

    const retry =
      await mutateStudySessionAttendanceAction(command);

    expect(first).toEqual({
      success: true,
      sessionId,
    });

    expect(retry).toEqual(first);

    expect(rpc).toHaveBeenCalledTimes(2);

    expect(rpc.mock.calls[0]).toEqual(
      rpc.mock.calls[1],
    );
  });
});

