import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmationProvider, useConfirmation } from "./confirmation-dialog";
import { useConfirmDialog } from "./use-confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { AdminDocumentDeleteButton } from "@/features/admin/components/admin-document-delete-button";
import { RoadmapApplyButton } from "@/features/roadmaps/components/roadmap-apply-button";
import { LeaveRoomButton } from "@/features/study-rooms/components/leave-room-button";
import en from "@/messages/en.json";
import viMessages from "@/messages/vi.json";

const mocks = vi.hoisted(() => ({ remove: vi.fn(), apply: vi.fn(), leave: vi.fn(), push: vi.fn(), refresh: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/features/admin/admin-documents.actions", () => ({ adminDeleteLearningDocumentAction: mocks.remove }));
vi.mock("@/features/roadmaps/roadmap.actions", () => ({ applyLearningRoadmapAction: mocks.apply }));
vi.mock("@/features/study-rooms/study-room.actions", () => ({ leaveStudyRoomAction: mocks.leave }));

function Caller({ decided }: { decided: (result: boolean) => void }) {
  const confirm = useConfirmDialog();
  return <button onClick={async () => decided(await confirm("Delete the selected item?", { variant: "destructive" }))}>Delete item</button>;
}

describe("shared confirmation modal", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mocks.remove.mockResolvedValue({ success: true, message: "Deleted" });
    mocks.apply.mockResolvedValue({ success: true, message: "Applied", data: { created_goals: 1, created_tasks: 2, created_subtasks: 3 } });
    mocks.leave.mockResolvedValue({ success: true, message: "Left" });
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

  async function render(children: React.ReactNode, locale = "en") {
    await act(async () => root.render(
      <NextIntlClientProvider locale={locale} messages={locale === "vi" ? viMessages : en}>
        <ConfirmationProvider>{children}</ConfirmationProvider>
      </NextIntlClientProvider>,
    ));
  }
  function modal() { return document.querySelector<HTMLElement>('[role="alertdialog"]'); }
  async function click(element: HTMLElement | null | undefined) {
    expect(element).toBeTruthy();
    await act(async () => element!.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  }
  function modalButton(label: string) { return [...modal()!.querySelectorAll("button")].find(button => button.textContent === label); }

  it.each(["en", "vi"])("uses localized labels and makes Cancel the safe initial focus (%s)", async (locale) => {
    const decided = vi.fn();
    await render(<Caller decided={decided} />, locale);
    const trigger = container.querySelector("button")!;
    trigger.focus();
    await click(trigger);
    const labels = locale === "vi" ? viMessages.common.confirmation : en.common.confirmation;
    expect(modal()?.textContent).toContain(labels.destructiveTitle);
    expect(document.getElementById(modal()!.getAttribute("aria-describedby")!)?.textContent).toBe("Delete the selected item?");
    expect(document.activeElement).toBe(modalButton(labels.cancel));
    expect(decided).not.toHaveBeenCalled();
    await click(modalButton(labels.cancel));
    expect(decided).toHaveBeenCalledWith(false);
    expect(modal()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("does not delete on Escape or Cancel, and preserves the mutation payload on confirmation", async () => {
    const native = vi.spyOn(window, "confirm");
    await render(<AdminDocumentDeleteButton documentId="doc-1" filePath="user-1/doc.pdf" />);
    await click(container.querySelector("button"));
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(modal()).toBeNull();
    expect(mocks.remove).not.toHaveBeenCalled();
    await click(container.querySelector("button"));
    await click(modalButton("Cancel"));
    expect(mocks.remove).not.toHaveBeenCalled();
    await click(container.querySelector("button"));
    await click(modalButton("Delete"));
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({ documentId: "doc-1", filePath: "user-1/doc.pdf" });
    expect(mocks.push).toHaveBeenCalledWith("/admin/documents");
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(native).not.toHaveBeenCalled();
  });

  it("keeps errors visible and allows retry after the action fails", async () => {
    mocks.remove.mockResolvedValue({ success: false, message: "Rejected" });
    await render(<AdminDocumentDeleteButton documentId="doc-1" filePath="user-1/doc.pdf" />);
    await click(container.querySelector("button"));
    await click(modalButton("Delete"));
    expect(mocks.error).toHaveBeenCalledWith("Rejected");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(container.querySelector("button")!.disabled).toBe(false);
    await click(container.querySelector("button"));
    expect(modal()).toBeTruthy();
  });

  it("blocks repeated requests while a confirmation is open", async () => {
    const decided = vi.fn();
    await render(<Caller decided={decided} />);
    await click(container.querySelector("button"));
    await click(container.querySelector("button"));
    expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
    expect(decided).toHaveBeenCalledExactlyOnceWith(false);
    await click(modalButton("Delete"));
    expect(decided.mock.calls).toEqual([[false], [true]]);
  });

  it("cancels pending decisions when the caller unmounts", async () => {
    const decided = vi.fn();
    await render(<Caller decided={decided} />);
    await click(container.querySelector("button"));
    await render(null);
    expect(decided).toHaveBeenCalledExactlyOnceWith(false);
    expect(modal()).toBeNull();
  });

  it("stacks above an existing dialog and restores its button focus", async () => {
    const decided = vi.fn();
    await render(<Dialog open><DialogContent><DialogTitle>Task details</DialogTitle><DialogDescription>Manage a task</DialogDescription><Caller decided={decided} /></DialogContent></Dialog>);
    const trigger = [...document.querySelectorAll("button")].find(button => button.textContent === "Delete item")!;
    trigger.focus();
    await click(trigger);
    expect(modal()).toBeTruthy();
    await click(modalButton("Cancel"));
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(document.activeElement).toBe(trigger);
  });

  it("supports a single-button informational alert", async () => {
    function AlertCaller() {
      const show = useConfirmation();
      const [done, setDone] = useState(false);
      return <button onClick={async () => setDone(await show({ mode: "alert", title: "Check amount", description: "Minimum donation is 10,000đ.", confirmLabel: "Understood" }))}>{done ? "Done" : "Show alert"}</button>;
    }
    await render(<AlertCaller />);
    await click(container.querySelector("button"));
    expect(modal()!.querySelectorAll("button")).toHaveLength(1);
    await click(modalButton("Understood"));
    expect(container.textContent).toBe("Done");
  });

  it("applies a roadmap only after confirming", async () => {
    await render(<RoadmapApplyButton roadmapId="roadmap-1" />);
    await click(container.querySelector("button"));
    expect(mocks.apply).not.toHaveBeenCalled();
    await click(modalButton("Cancel"));
    expect(mocks.apply).not.toHaveBeenCalled();
    await click(container.querySelector("button"));
    await click(modalButton("Confirm"));
    expect(mocks.apply).toHaveBeenCalledExactlyOnceWith({ roadmapId: "roadmap-1" });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("leaves a room only after confirming, preserving the presence event and navigation", async () => {
    const presence = vi.fn();
    window.addEventListener("lumivox:leave-study-room", presence);
    try {
      await render(<LeaveRoomButton roomId="room-1" />);
      await click(container.querySelector("button"));
      await click(modalButton("Cancel"));
      expect(presence).not.toHaveBeenCalled();
      expect(mocks.leave).not.toHaveBeenCalled();
      await click(container.querySelector("button"));
      await click(modalButton("Confirm"));
      expect((presence.mock.calls[0][0] as CustomEvent).detail).toEqual({ roomId: "room-1" });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 650)); });
      expect(mocks.leave).toHaveBeenCalledExactlyOnceWith("room-1");
      expect(mocks.push).toHaveBeenCalledWith("/rooms");
      expect(mocks.refresh).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener("lumivox:leave-study-room", presence);
    }
  });
});
