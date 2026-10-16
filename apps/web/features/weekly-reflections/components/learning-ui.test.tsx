import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createTranslator, NextIntlClientProvider, useLocale } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/vi.json";
import en from "@/messages/en.json";
import { learner, reflection } from "./learning-ui.fixtures";
const mocks = vi.hoisted(() => ({ generate: vi.fn(), refresh: vi.fn(), success: vi.fn(), error: vi.fn(), settings: vi.fn(), bundle: vi.fn(), reset: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...props }: React.ComponentProps<"a">) => { const locale = useLocale(); return <a href={`/${locale}${href}`} {...props}>{children}</a>; } }));
// eslint-disable-next-line @next/next/no-img-element -- DOM adapter for Next Image in component tests.
vi.mock("next/image", () => ({ default: ({ src, alt, width, height, className }: React.ComponentProps<"img">) => <img src={src} alt={alt} width={width} height={height} className={className} /> }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/features/weekly-reflections/weekly-reflection.actions", () => ({ generateWeeklyReflectionAction: mocks.generate }));
vi.mock("@/features/leaderboard/leaderboard.queries", () => ({ getGlobalWeeklyLeaderboardBundle: mocks.bundle }));
vi.mock("@/features/cms-settings/cms-settings.queries", () => ({ getLeaderboardSettings: mocks.settings }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => createTranslator({ locale: "vi", messages, namespace: "leaderboard.page" }) }));
import LeaderboardPage from "@/app/[locale]/(protected)/leaderboard/page";
import { GlobalLeaderboardTable } from "@/features/leaderboard/components/global-leaderboard-table";
import { MyGlobalRankCard } from "@/features/leaderboard/components/my-global-rank-card";
import { WeeklyReflectionCard } from "./weekly-reflection-card";
import { WeeklyReflectionSection } from "./weekly-reflection-section";
import { GenerateWeeklyReflectionButton } from "./generate-weekly-reflection-button";
import ProtectedLoading from "@/app/[locale]/(protected)/loading";
import ProtectedError from "@/app/[locale]/(protected)/error";

describe("Leaderboard, Reflections and shared states", () => {
  let container: HTMLDivElement; let root: Root;
  beforeEach(() => { vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); mocks.generate.mockResolvedValue({ success: true, message: "OK" }); mocks.settings.mockResolvedValue({ globalLeaderboardEnabled: true }); mocks.bundle.mockResolvedValue({ weekStart: "2026-10-01", weekEnd: "2026-10-07", myRank: learner, rows: [learner] }); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  async function render(children: ReactNode, locale = "vi") { await act(async () => root.render(<NextIntlClientProvider locale={locale} messages={locale === "vi" ? messages : en} timeZone="UTC" onError={(error) => { throw error; }}>{children}</NextIntlClientProvider>)); }
  it("does not read leaderboard data when disabled", async () => { mocks.settings.mockResolvedValue({ globalLeaderboardEnabled: false }); await render(await LeaderboardPage()); expect(mocks.bundle).not.toHaveBeenCalled(); expect(container.querySelector("h1")!.textContent).toBe(messages.leaderboard.page.disabledTitle); });
  it("preserves bundle read and rank/score values", async () => { await render(await LeaderboardPage()); expect(mocks.bundle).toHaveBeenCalledTimes(1); expect(container.textContent).toContain("#1"); expect(container.textContent).toContain("370"); expect(container.querySelector("main")).toBeNull(); });
  it.each(["vi", "en"])("keeps semantic leaderboard, data order and avatar dimensions in %s", async (locale) => {
    await render(<GlobalLeaderboardTable weekStart="2026-10-01" weekEnd="2026-10-07" rows={[learner, { ...learner, user_id: "user-2", rank_position: 4, avatar_url: null }]} />, locale); expect(container.querySelectorAll('th[scope="col"]')).toHaveLength(7); expect(container.querySelector('[role="region"]')!.getAttribute("tabindex")).toBe("0"); expect(container.querySelector("tbody tr")!.textContent).toContain("#1"); expect(container.querySelectorAll("tbody tr")[1].textContent).toContain("#4"); const image = container.querySelector("img")!; expect(image.getAttribute("width")).toBe("32"); expect(image.getAttribute("height")).toBe("32"); expect(image.alt).toBe("");
  });
  it("keeps unranked and empty leaderboard states", async () => { await render(<><MyGlobalRankCard rank={null} /><GlobalLeaderboardTable weekStart="2026-10-01" weekEnd="2026-10-07" rows={[]} /></>); expect(container.querySelector("table")).toBeNull(); expect(container.textContent).toContain(messages.leaderboard.myRankCard.notRanked); expect(container.textContent).toContain(messages.leaderboard.table.empty); });
  it.each(["vi", "en"])("retains reflection content, mastery formatting and details in %s", async (locale) => {
    await render(<WeeklyReflectionCard card={reflection} />, locale); expect(container.querySelector("script")).toBeNull(); expect(container.textContent).toContain(reflection.reflection_interpretation); expect(container.textContent).toContain(new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(88.25)); expect(container.querySelector("summary")).not.toBeNull(); expect(container.textContent).toContain("focus minutes"); expect(container.textContent).toContain("More focused work"); expect(container.textContent).toContain("Plan ahead");
  });
  it.each(["improving", "stable", "mixed", "needs_attention"] as const)("keeps reflection direction %s", async (reflection_direction) => { await render(<WeeklyReflectionCard card={{ ...reflection, weekly_reflections: { ...reflection.weekly_reflections!, reflection_direction } }} />); expect(container.textContent).toContain(messages.reflections.card.direction[reflection_direction]); });
  it("keeps legacy/no-review fallbacks and all detail empty states", async () => { await render(<WeeklyReflectionCard card={{ ...reflection, wins: [], watchouts: [], next_week_actions: [], weekly_reflections: null }} />); expect(container.textContent).not.toContain(messages.reflections.card.mastery.title); expect(container.textContent).toContain(messages.reflections.card.direction.unknown); expect(container.textContent).toContain(messages.reflections.card.emptyWins); expect(container.textContent).toContain(messages.reflections.card.emptyActions); });
  it("shows empty reflection collection", async () => { await render(<WeeklyReflectionSection cards={[]} />); expect(container.querySelector("article")).toBeNull(); expect(container.textContent).toContain(messages.reflections.section.emptyTitle); });
  it.each([true, false])("keeps generation callback and success-only refresh=%s", async (success) => { mocks.generate.mockResolvedValue({ success, message: "Result" }); await render(<GenerateWeeklyReflectionButton />); await act(async () => container.querySelector("button")!.click()); expect(mocks.generate).toHaveBeenCalledWith(); expect(mocks.refresh).toHaveBeenCalledTimes(success ? 1 : 0); expect(success ? mocks.success : mocks.error).toHaveBeenCalledWith("Result"); });
  it("disables duplicate generation while pending", async () => { let resolve!: (value: { success: boolean; message: string }) => void; mocks.generate.mockReturnValue(new Promise((done) => { resolve = done; })); await render(<GenerateWeeklyReflectionButton />); await act(async () => container.querySelector("button")!.click()); expect(container.querySelector("button")!.disabled).toBe(true); await act(async () => container.querySelector("button")!.click()); expect(mocks.generate).toHaveBeenCalledTimes(1); await act(async () => resolve({ success: false, message: "Rejected" })); expect(container.querySelector("button")!.disabled).toBe(false); });
  it("labels loading without exposing decorative skeleton content", async () => { await render(<ProtectedLoading />); expect(container.querySelector('[role="status"]')!.getAttribute("aria-busy")).toBe("true"); expect(container.textContent).toContain(messages.common.loading); expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull(); });
  it.each(["vi", "en"])("keeps localized retry/dashboard actions without leaking errors in %s", async (locale) => { await render(<ProtectedError error={new Error("secret internal failure")} reset={mocks.reset} />, locale); expect(container.querySelector('[role="alert"]')).not.toBeNull(); expect(container.textContent).not.toContain("secret"); await act(async () => container.querySelector("button")!.click()); expect(mocks.reset).toHaveBeenCalledTimes(1); expect(container.querySelector(`a[href="/${locale}/dashboard"]`)).not.toBeNull(); });
});
