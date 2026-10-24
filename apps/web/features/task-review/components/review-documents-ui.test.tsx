import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/vi.json";
import type { TaskReviewAttempt } from "../task-review.types";
import type { TaskWithGoal } from "@/features/tasks/task.types";
import type { LearningDocument } from "@/features/learning-documents/learning-document.types";

const confirmation = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("@/components/ui/use-confirm-dialog", () => ({ useConfirmDialog: () => confirmation }));

const mocks = vi.hoisted(() => ({ submit: vi.fn(), latest: vi.fn(), generate: vi.fn(), create: vi.fn(), transition: vi.fn(), share: vi.fn(), refresh: vi.fn(), changed: vi.fn(), copied: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/i18n/navigation", () => ({ Link: (props: React.ComponentProps<"a">) => <a {...props} /> }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));
vi.mock("../task-review.actions", () => ({ submitTaskReviewAction: mocks.submit, getLatestTaskReviewAction: mocks.latest, requestTaskReviewAction: mocks.generate }));
vi.mock("@/features/tasks/task.actions", () => ({ createSubtaskAction: mocks.create, deleteTaskAction: vi.fn(), transitionTaskStatusAction: mocks.transition }));
vi.mock("@/features/learning-documents/learning-document-sharing.actions", () => ({ shareLearningDocumentByEmailAction: mocks.share, removeLearningDocumentPermissionAction: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => createTranslator({ locale: "vi", messages, namespace: "documentUi" }) }));
// eslint-disable-next-line @next/next/no-img-element -- Inspect the Next Image props without its runtime loader.
vi.mock("next/image", () => ({ default: ({ src, alt, fill }: { src: string; alt: string; fill: boolean }) => <img src={src} alt={alt} data-fill={fill} /> }));

import { TaskReviewQuiz } from "./task-review-quiz";
import { TaskReviewFlashcards } from "./task-review-flashcards";
import { TaskReviewResult } from "./task-review-result";
import { TaskReviewPanel } from "./task-review-panel";
import { TaskSubtasksPanel } from "@/features/tasks/components/task-subtasks-panel";
import { ShareDocumentForm } from "@/features/learning-documents/components/share-document-form";
import { DocumentShareLinkCard } from "@/features/learning-documents/components/document-share-link-card";
import { DocumentPermissionList } from "@/features/learning-documents/components/document-permission-list";
import { LearningDocumentPreview } from "@/features/learning-documents/components/learning-document-preview";

const attempt: TaskReviewAttempt = { attempt_id: "attempt", task_id: "task", attempt_number: 1, status: "ready", pass_threshold: 70,
  score: null, feedback: null, provider: null, model: null, prompt_version: null, latency_ms: null, generation_error: null,
  created_at: "2026-10-12T08:00:00Z", ready_at: null, submitted_at: null, completed_at: null,
  assessment: { title: "Review", summary: "Summary", flashcards: [{ id: "f", front: "Front one", back: "Back one" }, { id: "f2", front: "Front two", back: "Back two" }], questions: [
    { id: "q1", kind: "single_choice", prompt: "Single question", options: ["One", "Two"] },
    { id: "q2", kind: "multiple_select", prompt: "Multiple question", options: ["A", "B", "C"] },
  ] }, source: { mode: "topic_inferred", document_count: 0, retrieved_chunk_count: 0 }, weak_areas: [] };
const task = { id: "task", title: "Task", status: "in_progress", parent_task_id: null, due_at: null, priority: "medium", updated_at: "2026-10-12T08:00:00Z" } as TaskWithGoal;
function localized(children: React.ReactNode) { return <NextIntlClientProvider locale="vi" messages={messages} timeZone="UTC">{children}</NextIntlClientProvider>; }

describe("review and document UI", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.clearAllMocks(); confirmation.mockResolvedValue(true); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: mocks.copied }, configurable: true });
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  function render(children: React.ReactNode) { act(() => root.render(localized(children))); }
  function button(label: string) { return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent?.includes(label) || b.getAttribute("aria-label") === label)!; }
  function enter(element: HTMLInputElement, value: string) { act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); }); }
  function answerQuiz() {
    act(() => container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].click());
    act(() => container.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')[2].click());
    act(() => container.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')[0].click());
  }

  it("requires all answers and submits sorted option indices with attempt guards", async () => {
    mocks.submit.mockResolvedValue({ success: true, message: "OK", data: { ...attempt, status: "passed" } });
    render(<TaskReviewQuiz attempt={attempt} onSubmitted={mocks.changed} />);
    expect(button(messages.taskReview.quiz.submit).disabled).toBe(true);
    expect(container.querySelectorAll("fieldset legend")).toHaveLength(2);
    answerQuiz();
    await act(async () => button(messages.taskReview.quiz.submit).click());
    expect(mocks.submit).toHaveBeenCalledWith({ taskId: "task", attemptId: "attempt", answers: [{ questionId: "q1", selectedOptionIndices: [1] }, { questionId: "q2", selectedOptionIndices: [0, 2] }] });
    expect(mocks.changed).toHaveBeenCalledOnce();
  });

  it("retains selected answers after rejected review submission", async () => {
    mocks.submit.mockResolvedValue({ success: false, message: "Rejected" });
    render(<TaskReviewQuiz attempt={attempt} onSubmitted={mocks.changed} />); answerQuiz();
    await act(async () => button(messages.taskReview.quiz.submit).click());
    expect(container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].checked).toBe(true);
    expect(button(messages.taskReview.quiz.submit).disabled).toBe(false);
    expect(mocks.changed).not.toHaveBeenCalled();
  });

  it("flips flashcards, wraps navigation and resets the visible side", () => {
    render(<TaskReviewFlashcards flashcards={attempt.assessment!.flashcards} />);
    const flip = () => container.querySelector<HTMLButtonElement>('button[aria-pressed]')!;
    act(() => flip().click()); expect(flip().getAttribute("aria-pressed")).toBe("true"); expect(flip().textContent).toContain("Back one");
    act(() => button(messages.taskReview.flashcards.previous).click()); expect(flip().textContent).toContain("Front two");
    act(() => flip().click()); act(() => button(messages.taskReview.flashcards.reset).click()); expect(flip().textContent).toContain("Front two");
    act(() => button(messages.taskReview.flashcards.next).click()); expect(flip().textContent).toContain("Front one");
  });

  it.each(["completed", "cancelled", "in_review"] as const)("does not offer subtask creation when the parent is %s", (status) => {
    render(<TaskSubtasksPanel parentTask={{ ...task, status }} subtasks={[]} goals={[]} onChanged={mocks.changed} />);
    expect(container.querySelector("form")).toBeNull();
  });

  it("sends a normalized subtask title and retains optimistic transition guards", async () => {
    mocks.create.mockResolvedValue({ success: true, message: "OK" }); mocks.transition.mockResolvedValue({ success: true, message: "OK" });
    const subtask = { ...task, id: "subtask", title: "Child", parent_task_id: "task", status: "todo" as const };
    render(<TaskSubtasksPanel parentTask={task} subtasks={[subtask]} goals={[]} onChanged={mocks.changed} />);
    enter(container.querySelector("input")!, "  New child  ");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.create).toHaveBeenCalledWith({ parentTaskId: "task", title: "New child" });
    await act(async () => button(messages.tasks.details.subtasks.start).click());
    expect(mocks.transition).toHaveBeenCalledWith({ taskId: "subtask", targetStatus: "in_progress", expectedStatus: "todo", expectedUpdatedAt: task.updated_at });
  });

  it("shares with viewer role by default and retains email after rejection", async () => {
    mocks.share.mockResolvedValue({ success: false, message: "Rejected" });
    render(<ShareDocumentForm documentId="document" />); enter(container.querySelector('input[type="email"]')!, "friend@example.com");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.share).toHaveBeenCalledWith({ documentId: "document", userEmail: "friend@example.com", role: "viewer" });
    expect(container.querySelector<HTMLInputElement>('input[type="email"]')!.value).toBe("friend@example.com");
  });

  it("copies a locale-aware link and reports clipboard failures", async () => {
    mocks.copied.mockRejectedValue(new Error("Denied"));
    render(<DocumentShareLinkCard documentId="document" />);
    await act(async () => button(messages.documentUi.copy).click());
    expect(mocks.copied).toHaveBeenCalledWith(`${window.location.origin}/vi/documents/shared/document`);
    expect(mocks.error).toHaveBeenCalledWith(messages.documentUi.copyFailed);
  });

  it("shows assessment feedback in flat rows without changing scores", () => {
    const feedback = { score: 50, correct_count: 1, total_questions: 2, passed: false, questions: [{ question_id: "q1", correct: false, selected_option_indices: [0], correct_option_indices: [1], explanation: "Explanation", weak_area: "Topic" }] };
    const view = document.createElement("div"); view.innerHTML = renderToStaticMarkup(localized(<TaskReviewResult attempt={{ ...attempt, status: "failed", feedback, weak_areas: ["Topic"] }} />));
    expect(view.textContent).toContain("50"); expect(view.textContent).toContain("Explanation"); expect(view.textContent).toContain("Two"); expect(view.querySelector("article article")).toBeNull();
  });

  it("renders escaped text preview and preserves the original signed URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "<script>not executable</script>" }));
    const content = await LearningDocumentPreview({ document: { file_name: "notes.txt", mime_type: "text/plain" } as LearningDocument, signedUrl: "https://files.test/signed.txt" });
    const view = document.createElement("div"); view.innerHTML = renderToStaticMarkup(content);
    expect(view.querySelector("script")).toBeNull(); expect(view.querySelector("pre")!.textContent).toContain("<script>");
    expect(view.querySelector("a")!.href).toBe("https://files.test/signed.txt");
  });

  it("gives images a bounded fill container and keeps the file name as alt text", async () => {
    const content = await LearningDocumentPreview({ document: { file_name: "diagram.png", mime_type: "image/png" } as LearningDocument, signedUrl: "https://files.test/signed.png" });
    const view = document.createElement("div"); view.innerHTML = renderToStaticMarkup(content);
    expect(view.querySelector("img")!.getAttribute("data-fill")).toBe("true"); expect(view.querySelector("img")!.alt).toBe("diagram.png");
  });

  it("allows long permission identities to wrap without hiding remove access", () => {
    const email = `${"learner".repeat(20)}@example.com`;
    render(<DocumentPermissionList permissions={[{ id: "p", document_id: "d", created_by: "u", created_at: "2026-10-12", user_email: email, role: "viewer" }]} />);
    const identity = Array.from(container.querySelectorAll("p")).find(p => p.textContent === email)!;
    expect(identity.className).toContain("overflow-wrap:anywhere");
    expect(container.querySelector('button[aria-label]')!.getAttribute("aria-label")).toContain(email);
  });

  it.each(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"])("preserves the embedded source for %s", async (mime_type) => {
    const signedUrl = "https://files.test/file?token=a&expires=1";
    const content = await LearningDocumentPreview({ document: { file_name: "file", mime_type } as LearningDocument, signedUrl });
    const view = document.createElement("div"); view.innerHTML = renderToStaticMarkup(content);
    expect(view.querySelector("iframe")!.getAttribute("src")).toBe(mime_type === "application/pdf" ? signedUrl : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrl)}`);
    expect(view.querySelector("iframe")!.title).toBe("file");
  });

  it.each(["todo", "completed", "cancelled", "child", "blocked"])("does not offer review generation for %s", async (state) => {
    mocks.latest.mockResolvedValue({ success: true, data: null });
    const parent = { ...task, status: state === "child" || state === "blocked" ? task.status : state as TaskWithGoal["status"], parent_task_id: state === "child" ? "parent" : null };
    const subtasks = state === "blocked" ? [{ ...task, id: "child", parent_task_id: "task", status: "todo" as const }] : [];
    await act(async () => root.render(localized(<TaskReviewPanel task={parent} subtasks={subtasks} onTaskChanged={mocks.changed} />)));
    expect(button(messages.taskReview.generate)).toBeUndefined();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("retains locale, threshold and request identity when generating review", async () => {
    mocks.latest.mockResolvedValue({ success: true, data: null }); mocks.generate.mockResolvedValue({ success: true, message: "OK", data: attempt });
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
    await act(async () => root.render(localized(<TaskReviewPanel task={task} subtasks={[]} onTaskChanged={mocks.changed} />)));
    await act(async () => button(messages.taskReview.generate).click());
    expect(mocks.generate).toHaveBeenCalledWith({ taskId: "task", requestId: "11111111-1111-4111-8111-111111111111", preferredLocale: "vi", passThreshold: 70 });
    expect(mocks.changed).toHaveBeenCalledOnce();
  });
});
