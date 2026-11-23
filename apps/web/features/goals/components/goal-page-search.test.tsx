import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { GoalPage, GoalPageItem } from "../goal.types";
import { searchGoalsAction } from "../goal.actions";
import { GoalPageSearch } from "./goal-page-search";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../goal.actions", () => ({ searchGoalsAction: vi.fn() }));

const searchGoals = vi.mocked(searchGoalsAction);
const first: GoalPageItem = {
  id: "first",
  title: "First goal",
  created_at: "2026-11-01T00:00:00.000Z",
  completed_tasks: 0,
  total_tasks: 0,
};
const next: GoalPageItem = { ...first, id: "next", title: "Matching result" };
const firstPage: GoalPage = {
  items: [first],
  nextCursor: { id: first.id, created_at: first.created_at },
};

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

it("limits goal fetches to the current search and ignores stale responses", async () => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let resolveOldSearch: (page: GoalPage) => void = () => {};

  searchGoals
    .mockImplementationOnce(() => new Promise((resolve) => { resolveOldSearch = resolve; }))
    .mockResolvedValueOnce({ items: [next], nextCursor: null });

  function enter(value: string) {
    const input = container.querySelector("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  try {
    act(() => root.render(<GoalPageSearch initialPage={firstPage} includeProgress renderItem={(goal) => goal.title} />));
    expect(container.textContent).toContain(first.title);
    expect(searchGoals).not.toHaveBeenCalled();

    enter("o");
    await act(() => vi.advanceTimersByTimeAsync(200));
    enter("old");
    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(searchGoals).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(searchGoals).toHaveBeenNthCalledWith(1, { search: "old", cursor: null, includeProgress: true });

    enter("matching");
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(container.textContent).toContain(next.title);
    await act(async () => resolveOldSearch({ items: [first], nextCursor: null }));
    expect(container.textContent).not.toContain(first.title);
    expect(container.textContent).toContain(next.title);

    enter("");
    searchGoals.mockResolvedValueOnce({ items: [next], nextCursor: null });
    await act(async () => container.querySelector("button")!.click());
    expect(searchGoals).toHaveBeenLastCalledWith({ search: "", cursor: firstPage.nextCursor, includeProgress: true });
    expect(container.querySelectorAll("li")).toHaveLength(2);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
