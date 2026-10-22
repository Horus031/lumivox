import { act, createContext, useContext, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createTranslator, NextIntlClientProvider, useLocale } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/vi.json";
import en from "@/messages/en.json";
import { riskMetrics, riskModel, riskPrediction } from "./native-task-risk-ui.fixtures";

const mocks = vi.hoisted(() => ({ push: vi.fn(), metrics: vi.fn(), models: vi.fn(), predictions: vi.fn(), detail: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: mocks.push }), Link: ({ href, children, ...props }: React.ComponentProps<"a">) => { const locale = useLocale(); return <a href={`/${locale}${href}`} {...props}>{children}</a>; } }));
vi.mock("@/features/admin/admin-native-task-risk.queries", () => ({ getAdminNativeTaskRiskMetrics: mocks.metrics, getAdminNativeTaskRiskModelVersions: mocks.models, searchAdminNativeTaskRiskPredictions: mocks.predictions, getAdminNativeTaskRiskPredictionDetail: mocks.detail }));
vi.mock("next-intl/server", () => ({ getTranslations: async (namespace: "admin.nativeTaskRisk.page" | "admin.nativeTaskRisk.detail") => createTranslator({ locale: "vi", messages, namespace }) }));
vi.mock("@/components/ui/select", () => {
  const Context = createContext<{ value: string; onValueChange: (value: string) => void }>({ value: "", onValueChange: () => {} });
  return { Select: ({ children, ...props }: { children: ReactNode; value: string; onValueChange: (value: string) => void }) => <Context.Provider value={props}>{children}</Context.Provider>, SelectTrigger: (props: React.ComponentProps<"select">) => { const state = useContext(Context); return <select {...props} value={state.value} onChange={(event) => state.onValueChange(event.target.value)}>{["all", "low", "moderate", "elevated", "high"].map((value) => <option key={value}>{value}</option>)}</select>; }, SelectContent: () => null, SelectItem: () => null, SelectValue: () => null };
});
import { AdminNativeTaskRiskSearchForm } from "./admin-native-task-risk-search-form";
import { AdminNativeTaskRiskMetricsOverview } from "./admin-native-task-risk-metrics-overview";
import { AdminNativeTaskRiskModelsCard } from "./admin-native-task-risk-models-card";
import { AdminNativeTaskRiskPredictionsTable } from "./admin-native-task-risk-predictions-table";
import RiskPage from "@/app/[locale]/(protected)/admin/native-task-risk/page";
import DetailPage from "@/app/[locale]/(protected)/admin/native-task-risk/[predictionId]/page";

describe("Native Task Risk UI", () => {
  let container: HTMLDivElement; let root: Root;
  beforeEach(() => { vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); mocks.metrics.mockResolvedValue(riskMetrics); mocks.models.mockResolvedValue([riskModel]); mocks.predictions.mockResolvedValue([riskPrediction]); mocks.detail.mockResolvedValue(riskPrediction); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  async function render(children: ReactNode, locale = "vi") { await act(async () => root.render(<NextIntlClientProvider locale={locale} messages={locale === "vi" ? messages : en} timeZone="UTC" onError={(error) => { throw error; }}>{children}</NextIntlClientProvider>)); }
  it("retains encoded query/risk filters and blank/all omission", async () => {
    await render(<AdminNativeTaskRiskSearchForm initialQuery="  A & B  " initialRiskBand="high" />); const submit = async () => act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); await submit(); expect(mocks.push).toHaveBeenLastCalledWith("/admin/native-task-risk?q=A+%26+B&risk=high");
    act(() => { const input = container.querySelector("input")!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, " "); input.dispatchEvent(new Event("input", { bubbles: true })); const select = container.querySelector("select")!; select.value = "all"; select.dispatchEvent(new Event("change", { bubbles: true })); }); await submit(); expect(mocks.push).toHaveBeenLastCalledWith("/admin/native-task-risk"); for (const control of container.querySelectorAll("input,select")) expect(container.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
  });
  it("keeps four metrics, rounding, score/distribution and null defaults", async () => {
    await render(<AdminNativeTaskRiskMetricsOverview metrics={riskMetrics} />); expect(container.querySelectorAll("article")).toHaveLength(4); expect(container.textContent).toContain("62%"); expect(container.textContent).toContain("600 / 300"); await render(<AdminNativeTaskRiskMetricsOverview metrics={null} />); expect(container.textContent).toContain("0%"); expect(container.textContent).toContain(messages.admin.nativeTaskRisk.metrics.notAvailable);
  });
  it("keeps active model identity and numeric/string metric formatting", async () => {
    await render(<AdminNativeTaskRiskModelsCard models={[riskModel]} />); expect(container.textContent).toContain("0.9123"); expect(container.textContent).toContain("0.0000"); expect(container.textContent).toContain("0.8756"); expect(container.textContent).toContain("0.99"); expect(container.textContent).toContain(riskModel.artifact_path); expect(container.textContent).toContain(messages.admin.nativeTaskRisk.models.active);
  });
  it("keeps missing model metrics fallback and hides inactive marker", async () => {
    await render(<AdminNativeTaskRiskModelsCard models={[{ ...riskModel, is_active: false, metrics: {} }]} />); expect(container.textContent).not.toContain(messages.admin.nativeTaskRisk.models.active); expect(container.textContent).toContain(messages.admin.nativeTaskRisk.models.notAvailable);
  });
  it.each(["low", "moderate", "elevated", "high"] as const)("retains %s band, probability, zero days and the first two reasons", async (risk_band) => {
    await render(<AdminNativeTaskRiskPredictionsTable predictions={[{ ...riskPrediction, risk_band }]} />); const t = createTranslator({ locale: "vi", messages, namespace: "admin.nativeTaskRisk.predictions" }); expect(container.textContent).toContain(t(`riskBands.${risk_band}`)); expect(container.textContent).toContain("62%"); expect(container.textContent).toContain(t("daysLeft", { count: 0 })); expect(container.textContent).toContain("First reason"); expect(container.textContent).toContain("Second reason"); expect(container.textContent).not.toContain("Third reason"); expect(container.querySelector('a[href="/vi/admin/native-task-risk/prediction-1"]')).not.toBeNull();
  });
  it.each(["vi", "en"])("retains locale-aware dates/links and identity fallbacks in %s", async (locale) => {
    await render(<AdminNativeTaskRiskPredictionsTable predictions={[{ ...riskPrediction, task_title: null, goal_title: null, owner_name: null, owner_email: null, days_until_due: null, reason_summaries: [] }]} />, locale); expect(container.textContent).toContain("task-1"); expect(container.textContent).toContain("user-1"); expect(container.textContent).toContain("native_ml"); expect(container.textContent).toContain(new Date(riskPrediction.created_at).toLocaleString(locale)); expect(container.querySelector(`a[href="/${locale}/admin/native-task-risk/prediction-1"]`)).not.toBeNull();
  });
  it("shows empty model and prediction states", async () => { await render(<><AdminNativeTaskRiskModelsCard models={[]} /><AdminNativeTaskRiskPredictionsTable predictions={[]} /></>); expect(container.querySelector("article")).toBeNull(); expect(container.textContent).toContain(messages.admin.nativeTaskRisk.models.empty); expect(container.textContent).toContain(messages.admin.nativeTaskRisk.predictions.empty); });
  it("preserves query arguments and normalization of malformed JSON containers", async () => {
    mocks.models.mockResolvedValue([{ ...riskModel, metrics: [], feature_schema: null, explainability_metadata: [] }]); mocks.predictions.mockResolvedValue([{ ...riskPrediction, feature_payload: null, reason_summaries: {}, recommended_actions: null }]); await render(await RiskPage({ searchParams: Promise.resolve({ q: "owner", risk: "elevated" }) })); expect(mocks.predictions).toHaveBeenCalledWith({ query: "owner", riskBand: "elevated" }); expect(mocks.metrics).toHaveBeenCalledTimes(1); expect(mocks.models).toHaveBeenCalledTimes(1); expect(container.querySelector("main")).toBeNull(); expect(container.textContent).not.toContain("First reason"); expect(container.textContent).toContain(messages.admin.nativeTaskRisk.models.notAvailable);
  });
  it("keeps detail probability/threshold, attribution order, JSON output and back link", async () => {
    await render(await DetailPage({ params: Promise.resolve({ predictionId: "prediction-1" }) })); expect(mocks.detail).toHaveBeenCalledWith("prediction-1"); const pre = container.querySelectorAll("pre"); expect(pre).toHaveLength(3); expect([...pre].map((item) => item.textContent)).toEqual([JSON.stringify(riskPrediction.model_metrics, null, 2), JSON.stringify(riskPrediction.feature_payload, null, 2), JSON.stringify(riskPrediction.prediction_metadata, null, 2)]); for (const region of pre) { expect(region.tabIndex).toBe(0); expect(region.getAttribute("aria-label")).toBeTruthy(); } expect(container.querySelector("img")).toBeNull(); expect(container.querySelector("script")).toBeNull(); expect(container.querySelector('a[href="/vi/admin/native-task-risk"]')).not.toBeNull(); expect(container.textContent!.indexOf("2. FeatureName")).toBeLessThan(container.textContent!.indexOf("1. focus_quality"));
  });
  it("keeps non-array attribution fallback and query failure behavior", async () => { mocks.detail.mockResolvedValue({ ...riskPrediction, attributions: {} }); await render(await DetailPage({ params: Promise.resolve({ predictionId: "prediction-1" }) })); expect(container.textContent).not.toContain("2. FeatureName"); mocks.detail.mockRejectedValue(new Error("Missing prediction")); await expect(DetailPage({ params: Promise.resolve({ predictionId: "missing" }) })).rejects.toThrow("Missing prediction"); });
});
