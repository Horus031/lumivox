import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/vi.json";

const mocks = vi.hoisted(() => ({ create: vi.fn(), push: vi.fn(), refresh: vi.fn(), error: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ Link: (props: React.ComponentProps<"a">) => <a {...props} />, useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("@/features/study-groups/study-group.actions", () => ({ createStudyGroupAction: mocks.create }));
vi.mock("@/features/study-rooms/study-room.actions", () => ({ joinPublicStudyRoomAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));
vi.mock("@/components/ui/dialog", () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return { Dialog: Wrapper, DialogContent: Wrapper, DialogHeader: Wrapper, DialogFooter: Wrapper,
    DialogTrigger: Wrapper, DialogClose: Wrapper, DialogTitle: Wrapper, DialogDescription: Wrapper };
});

import { CreateStudyGroupForm } from "./create-study-group-form";
import { StudyGroupWeeklyChallenge } from "./study-group-weekly-challenge";
import { StudyGroupLeaderboard } from "./study-group-leaderboard";
import { StudyGroupMemberList } from "./study-group-member-list";
import { MyRoomList } from "@/features/study-rooms/components/my-room-list";

function localized(children: React.ReactNode) {
  return <NextIntlClientProvider locale="vi" messages={messages} timeZone="UTC">{children}</NextIntlClientProvider>;
}
function markup(children: React.ReactNode) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(localized(children));
  return container;
}

describe("social study presentation", () => {
  it("deduplicates joined rooms and keeps enter navigation", () => {
    const room = { id: "room", title: "Algebra", description: null, visibility: "private" as const, max_participants: 20, profiles: null };
    const joined = { room_id: "room", study_rooms: room };
    const view = markup(<MyRoomList rooms={[joined, joined]} />);
    expect(view.querySelectorAll("article")).toHaveLength(1);
    expect(view.querySelector('a[href="/rooms/room"]')).not.toBeNull();
    expect(view.textContent).toContain(messages.rooms.card.visibility.private);
    expect(markup(<MyRoomList rooms={[]} />).textContent).toContain(messages.rooms.myList.empty);
  });

  it("exposes named, bounded challenge meters and an empty state", () => {
    const view = markup(<StudyGroupWeeklyChallenge progress={{ group_id: "g", week_start: "2026-10-12", week_end: "2026-10-18", target_focus_minutes: 300, target_completed_tasks: 10, actual_focus_minutes: 450, actual_completed_tasks: 0, focus_progress_percent: 150, task_progress_percent: -5 }} />);
    const meters = view.querySelectorAll('[role="progressbar"]');
    expect(meters[0].getAttribute("aria-label")).toBe(messages.groups.weeklyChallengePanel.focusMinutes);
    expect(meters[0].getAttribute("aria-valuenow")).toBe("100");
    expect(meters[1].getAttribute("aria-valuenow")).toBe("0");
    expect(markup(<StudyGroupWeeklyChallenge progress={null} />).textContent).toContain(messages.groups.weeklyChallengePanel.empty);
  });

  it("keeps leaderboard metadata within a focusable scroll region", () => {
    const view = markup(<StudyGroupLeaderboard weekStart="2026-10-12" weekEnd="2026-10-18" rows={[{ user_id: "u", email: "learner@example.com", role: "member", focus_minutes: 20, completed_tasks: 2, score: 40, rank_position: 1 }]} />);
    expect(view.querySelector('div[tabindex="0"] table')).not.toBeNull();
    expect(view.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(view.textContent).toContain("#1");
    expect(view.textContent).toContain("learner@example.com");
    expect(view.textContent).toContain("40");
  });

  it("renders member identity, role and invitation status as flat rows", () => {
    const view = markup(<StudyGroupMemberList members={[{ member_id: "m", room_id: "r", user_id: "u", email: "learner@example.com", role: "member", membership_status: "invited", joined_at: null }]} />);
    expect(view.textContent).toContain(messages.groups.members.status.invited);
    expect(view.querySelector("article article")).toBeNull();
  });
});

describe("group creation regression", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(localized(<CreateStudyGroupForm />)));
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  function enter(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    act(() => {
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("has one independently bound description field and sends both values", async () => {
    mocks.create.mockResolvedValue({ success: true, message: "Created", data: { groupId: "g" } });
    expect(container.querySelectorAll("input")).toHaveLength(1);
    const name = container.querySelector("input")!;
    const description = container.querySelector("textarea")!;
    expect(container.querySelector(`label[for="${name.id}"]`)).not.toBeNull();
    expect(container.querySelector(`label[for="${description.id}"]`)).not.toBeNull();
    enter(name, "Study group");
    enter(description, "Separate description");
    expect(name.value).toBe("Study group");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.create).toHaveBeenCalledWith({ title: "Study group", description: "Separate description" });
    expect(mocks.push).toHaveBeenCalledWith("/groups/g");
  });

  it("retains values and restores controls after rejected creation", async () => {
    mocks.create.mockResolvedValue({ success: false, message: "Rejected" });
    enter(container.querySelector("input")!, "Study group");
    enter(container.querySelector("textarea")!, "Description");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.querySelector("input")!.value).toBe("Study group");
    expect(container.querySelector("fieldset")!.disabled).toBe(false);
    expect(mocks.error).toHaveBeenCalledWith("Rejected");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
