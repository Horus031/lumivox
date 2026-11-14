import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", async (original) => {
  const actual = await original<typeof import("next-intl")>();

  const { learningSchedule } = await import("@/messages/en.json");
  const { learningSchedule: vietnamese } = await import("@/messages/vi.json");

  const translate = actual.createTranslator({
    locale: "en",
    messages: { learningSchedule },
    namespace: "learningSchedule",
  });
  const translateVi = actual.createTranslator({
    locale: "vi",
    messages: { learningSchedule: vietnamese },
    namespace: "learningSchedule",
  });

  return {
    ...actual,
    useLocale: () => mocks.locale,
    useTranslations: () => (mocks.locale === "vi" ? translateVi : translate),
  };
});

const mocks = vi.hoisted(() => ({
  locale: "en" as "en" | "vi",
  mutate: vi.fn(),
  success: vi.fn(),
}));

vi.mock("../session-attendance.actions", () => ({
  mutateStudySessionAttendanceAction: mocks.mutate,
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.success },
}));

import { SessionAttendanceDialog } from "./session-attendance-dialog";

const session = {
  id: "00000000-0000-4000-8000-000000000001",
  updated_at: "2026-11-01T12:00:00Z",
  local_date: "2026-11-01",
  local_start_time: "19:00:00",
  local_end_time: "20:30:00",
  timezone: "Asia/Ho_Chi_Minh",
  status: "scheduled",
};

describe("Attendance confirmation dialog", () => {
  let host: HTMLDivElement;
  let root: Root;
  let onSaved: ReturnType<typeof vi.fn<() => void>>;
  let onReload: ReturnType<typeof vi.fn<() => void>>;
  let onOpenChange: ReturnType<typeof vi.fn<(open: boolean) => void>>;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.locale = "en";

    Object.assign(globalThis, {
      IS_REACT_ACT_ENVIRONMENT: true,
    });

    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    onSaved = vi.fn<() => void>();
    onReload = vi.fn<() => void>();
    onOpenChange = vi.fn<(open: boolean) => void>();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  async function render(kind: "start" | "complete" | "skip" | "recover") {
    await act(async () => {
      root.render(
        <SessionAttendanceDialog
          session={session}
          kind={kind}
          open
          onSaved={onSaved}
          onReload={onReload}
          onOpenChange={onOpenChange}
        />,
      );
    });
  }

  function button(label: string): HTMLButtonElement {
    const found = [...document.querySelectorAll("button")].find(
      (item) => item.textContent === label,
    );

    if (!(found instanceof HTMLButtonElement)) {
      throw new Error(`Missing button: ${label}`);
    }

    return found;
  }

  async function click(label: string) {
    await act(async () => {
      button(label).click();
    });
  }

  it("confirms Complete with saved version and key", async () => {
    mocks.mutate.mockResolvedValue({
      success: true,
      sessionId: session.id,
    });

    await render("complete");
    await click("Confirm completion");

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate.mock.calls[0][0]).toMatchObject({
      command: "complete",
      sessionId: session.id,
      expectedUpdatedAt: session.updated_at,
      eventKey: expect.any(String),
    });

    expect(onSaved).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it("normalizes optional Skip reason before sending", async () => {
    mocks.mutate.mockResolvedValue({
      success: true,
      sessionId: session.id,
    });

    await render("skip");

    const input = document.querySelector("textarea");
    expect(input).not.toBeNull();

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;

      nativeSetter?.call(input, "  Family appointment  ");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await click("Confirm skip");

    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "skip",
        reason: "Family appointment",
      }),
    );
  });

  it("retries an uncertain result with identical command", async () => {
    mocks.mutate
      .mockResolvedValueOnce({
        success: false,
        code: "uncertain",
        uncertain: true,
      })
      .mockResolvedValueOnce({
        success: true,
        sessionId: session.id,
      });

    await render("complete");
    await click("Confirm completion");

    expect(document.querySelector('[role="alert"]')).not.toBeNull();

    await click("Retry exact command");

    expect(mocks.mutate).toHaveBeenCalledTimes(2);

    expect(mocks.mutate.mock.calls[0][0]).toEqual(mocks.mutate.mock.calls[1][0]);

    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("requires latest reload after a version conflict", async () => {
    mocks.mutate.mockResolvedValue({
      success: false,
      code: "conflict",
      conflict: true,
    });

    await render("complete");
    await click("Confirm completion");

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(button("Confirm completion").disabled).toBe(true);

    await click("Check latest session");

    expect(onReload).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
  });

  it("does not retry automatically after notEligible", async () => {
    mocks.mutate.mockResolvedValue({
      success: false,
      code: "notEligible",
    });

    await render("start");
    await click("Confirm start");

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();

    await click("Check latest session");

    expect(onReload).toHaveBeenCalledOnce();
  });
  function deferredResult() {
    let resolve!: (value: { success: true; sessionId: string }) => void;
    const promise = new Promise<{ success: true; sessionId: string }>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  async function enterReason(value: string) {
    const textarea = document.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        textarea,
        value,
      );
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("shows an accessible title/description, saved local time and timezone", async () => {
    await render("recover");
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe(
      "Recover missed study session",
    );
    expect(
      document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent,
    ).toContain("previously missed or skipped");
    expect(dialog.textContent).toContain("2026-11-01");
    expect(dialog.textContent).toContain("19:00 – 20:30");
    expect(dialog.textContent).toContain("Asia/Ho_Chi_Minh");
  });

  it("blocks rapid duplicate confirm, close and Escape while pending", async () => {
    const pending = deferredResult();
    mocks.mutate.mockReturnValue(pending.promise);
    await render("complete");
    await act(async () => {
      const confirm = button("Confirm completion");
      confirm.click();
      confirm.click();
    });
    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(button("Cancel").disabled).toBe(true);
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve({ success: true, sessionId: session.id });
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("freezes normalized Skip reason, version and UUID through uncertain exact retry", async () => {
    mocks.mutate
      .mockResolvedValueOnce({ success: false, code: "uncertain", uncertain: true })
      .mockResolvedValueOnce({ success: true, sessionId: session.id });
    await render("skip");
    await enterReason("  Family appointment  ");
    await click("Confirm skip");
    const first = mocks.mutate.mock.calls[0][0];
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).toMatchObject({
      command: "skip",
      reason: "Family appointment",
      expectedUpdatedAt: session.updated_at,
    });
    expect(first.eventKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(document.querySelector("textarea")?.matches(":disabled")).toBe(true);
    await enterReason("Changed reason");
    await click("Retry exact command");
    expect(mocks.mutate.mock.calls[1][0]).toBe(first);
    expect(mocks.mutate.mock.calls[1][0].reason).toBe("Family appointment");
  });

  it("treats a thrown request as uncertain without automatic retry", async () => {
    mocks.mutate.mockRejectedValue(new Error("private transport error"));
    await render("complete");
    await click("Confirm completion");
    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "could not be confirmed",
    );
    expect(document.body.textContent).not.toContain("private transport error");
    expect(button("Retry exact command")).toBeDefined();
  });

  it("Check latest discards an uncertain dialog rather than sending a new command", async () => {
    mocks.mutate.mockResolvedValue({ success: false, code: "uncertain", uncertain: true });
    await render("start");
    await click("Confirm start");
    await click("Check latest session");
    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(onReload).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("does not update callbacks or toast after the dialog unmounts", async () => {
    const pending = deferredResult();
    mocks.mutate.mockReturnValue(pending.promise);
    await render("start");
    await act(async () => {
      button("Confirm start").click();
    });
    await act(async () => {
      root.render(null);
    });
    await act(async () => {
      pending.resolve({ success: true, sessionId: session.id });
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it("renders Vietnamese labels, error and exact-retry help using the real messages", async () => {
    mocks.locale = "vi";
    mocks.mutate.mockResolvedValue({ success: false, code: "uncertain", uncertain: true });
    await render("skip");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Bỏ qua buổi học");
    expect(document.querySelector("textarea")?.closest("label")?.textContent).toContain("Lý do");
    await click("Xác nhận bỏ qua");
    expect(document.querySelector('[role="alert"]')?.textContent).not.toContain(
      "attendance.errors",
    );
    expect(button("Thử lại đúng yêu cầu cũ")).toBeDefined();
    expect(button("Kiểm tra buổi học mới nhất")).toBeDefined();
  });
});
