import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/vi.json";
import type { LearningRoadmap, RoadmapTreeNode } from "../roadmap.types";

vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("./roadmap-apply-button", () => ({ RoadmapApplyButton: () => <button>Apply fixture</button> }));

import { RoadmapDetailHeader } from "./roadmap-detail-header";
import { RoadmapTreePreview } from "./roadmap-tree-preview";
import { RoadmapList } from "./roadmap-list";

const roadmap = {
  id: "roadmap", title: "Study plan", topic: "Algebra", description: null,
  subject_name: "Mathematics", current_level: "beginner", target_level: "intermediate",
  start_date: "2026-10-12", end_date: "2026-12-12", preferred_locale: "vi",
  study_days_per_week: 5, minutes_per_study_day: 60, status: "draft",
} as LearningRoadmap;

function render(content: React.ReactNode) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <NextIntlClientProvider locale="vi" messages={messages} timeZone="UTC">{content}</NextIntlClientProvider>,
  );
  return container;
}

describe("roadmap presentation", () => {
  it("offers edit/apply only for drafts and keeps applied navigation", () => {
    const draft = render(<RoadmapDetailHeader roadmap={roadmap} nodeCount={3} />);
    expect(draft.querySelector('a[href="/roadmaps/roadmap/edit"]')).not.toBeNull();
    expect(draft.textContent).toContain("Apply fixture");
    const applied = render(<RoadmapDetailHeader roadmap={{ ...roadmap, status: "applied" }} nodeCount={3} />);
    expect(applied.querySelector('a[href$="/edit"]')).toBeNull();
    expect(applied.textContent).not.toContain("Apply fixture");
    expect(applied.querySelector('a[href="/goals"]')).not.toBeNull();
  });

  it("retains list metadata and localized status", () => {
    const list = render(<RoadmapList roadmaps={[roadmap]} />);
    expect(list.querySelector('a[href="/roadmaps/roadmap"]')).not.toBeNull();
    expect(list.textContent).toContain("Bản nháp");
    expect(list.textContent).toContain("2026-10-12");
    expect(list.textContent).toContain("5 ngày/tuần");
  });

  it("preserves goal/task/subtask order in a flat tree preview", () => {
    const subtask = { id: "s", title: "Subtask", node_type: "subtask", priority: 3, estimated_hours: 1, children: [] } as unknown as RoadmapTreeNode;
    const task = { ...subtask, id: "t", title: "Task", node_type: "task", children: [subtask] } as RoadmapTreeNode;
    const goal = { ...task, id: "g", title: "Goal", node_type: "goal", children: [task] } as RoadmapTreeNode;
    const preview = render(<RoadmapTreePreview tree={[goal]} />);
    expect(Array.from(preview.querySelectorAll("h3"), (item) => item.textContent)).toEqual(["Goal", "Task", "Subtask"]);
    expect(preview.textContent).toContain("Nhiệm vụ con");
    expect(preview.querySelector("article article")).toBeNull();
  });

  it("shows empty states without hiding the create action", () => {
    expect(render(<RoadmapList roadmaps={[]} />).querySelector('a[href="/roadmaps/new"]')).not.toBeNull();
    expect(render(<RoadmapTreePreview tree={[]} />).textContent).toContain(messages.roadmaps.treeEmpty);
  });
});
