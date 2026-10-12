import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "@/messages/vi.json";
import type { PbiExplanationPayload } from "@/features/pbi/pbi.types";
import { PbiScoreCards } from "./pbi-score-cards";

const snapshot = {
  standard_pbi: 64.5,
  personalized_pbi: 72.5,
  task_completion_rate: 0.8,
  focus_quality_score: 0.65,
  deadline_adherence_score: 0,
  goal_momentum_score: 1,
  consistency_score: 0.4,
  period_start: "2026-10-05",
  period_end: "2026-10-12",
};

function render(props: React.ComponentProps<typeof PbiScoreCards>) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <NextIntlClientProvider locale="vi" messages={messages} timeZone="UTC">
      <PbiScoreCards {...props} />
    </NextIntlClientProvider>,
  );
  return container;
}

describe("dashboard PBI scores", () => {
  it("preserves both main scores and converts fallback fractions to percentages", () => {
    const container = render({ snapshot });
    expect(container.textContent).toContain("72,5");
    expect(container.textContent).toContain("64,5");
    expect(Array.from(container.querySelectorAll('[role="meter"]'), (meter) => meter.getAttribute("aria-valuenow")))
      .toEqual(["80", "65", "0", "100", "40"]);
    expect(container.textContent).toContain("Thấp");
    expect(container.textContent).toContain("Mạnh");
  });

  it("uses supplied explanations and keeps visual meters within their bounds", () => {
    const explanation = {
      component_explanations: [{ key: "focus", title: "Custom focus", score: 1.2, level: "strong", message: "Focus insight" }],
    } as PbiExplanationPayload;
    const container = render({ snapshot, explanation });
    const meter = container.querySelector('[role="meter"]')!;
    expect(meter.getAttribute("aria-label")).toBe("Custom focus");
    expect(meter.getAttribute("aria-valuenow")).toBe("100");
    expect(meter.getAttribute("aria-valuetext")).toContain("Mạnh");
    expect(container.textContent).toContain("Focus insight");
    expect(container.querySelectorAll('[role="meter"]')).toHaveLength(1);
  });

  it("shows the empty state rather than inventing zero scores", () => {
    const container = render({ snapshot: null });
    expect(container.textContent).toContain(messages.dashboard.pbiScore.emptyTitle);
    expect(container.querySelector('[role="meter"]')).toBeNull();
  });
});
