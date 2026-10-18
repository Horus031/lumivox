#!/usr/bin/env python3
"""Phase 5 deterministic installation, based on product-release 63ea782c.

Run from repo root. New files are already in their final locations in the ZIP.
Existing Phase 3/4 files are patched in place after validating unique anchors.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "apps/web/app/[locale]/(protected)/focus/page.tsx"
BUILDER = ROOT / "apps/web/features/focus-sessions/components/focus-v2-session-builder.tsx"
QA_PAGE = ROOT / "apps/web/app/[locale]/(protected)/focus-v2-lab/page.tsx"
BUILDER_TEST = ROOT / "apps/web/features/focus-sessions/components/focus-v2-session-builder.test.tsx"

EN = {
    "eyebrow": "Focus Session 2.0", "generalStudy": "General study session", "roundOf": "Round {current} of {total}",
    "kinds": {"focus": "Study time", "shortBreak": "Short break", "longBreak": "Long break"},
    "statuses": {"pending": "Upcoming", "running": "In progress", "paused": "Paused", "completed": "Completed", "skipped": "Skipped", "interrupted": "Interrupted"},
    "remaining": "Remaining time", "segmentProgress": "Current phase progress", "waitingTitle": "Ready for the next phase",
    "readyForNext": "Start whenever you're ready", "invalidState": "Unable to determine the active phase. Refresh your session.",
    "pausedHelp": "Your study timer is paused.", "finishing": "Time is up — saving this phase to your session…",
    "pause": "Pause", "resume": "Resume", "startNext": "Start {phase}", "finishSegment": "Finish phase",
    "skipBreak": "Skip break", "cancel": "End session early", "cancelConfirm": "End this focus session early? Your completed study time will be saved.",
    "newSession": "New focus session", "sync": "Sync", "offline": "You're offline. The timer is displaying the last synchronized data.",
    "completedRounds": "Completed study rounds", "focusTime": "Study time", "breakTime": "Break time",
    "timeline": "Session timeline", "round": "Round {number}", "plannedDuration": "Planned: {minutes} min",
    "immersive": "Enter distraction-free view", "exitImmersive": "Exit distraction-free view",
    "terminal": {"completed": "Session completed", "cancelled": "Session ended"},
    "terminalSummary": "Your focus session is saved.",
    "noAutoSound": "Audio and focus music will be added in the next phase. Time notifications are visual for now."
}
VI = {
    "eyebrow": "Phiên tập trung 2.0", "generalStudy": "Phiên học tự do", "roundOf": "Vòng {current} / {total}",
    "kinds": {"focus": "Đang học", "shortBreak": "Nghỉ ngắn", "longBreak": "Nghỉ dài"},
    "statuses": {"pending": "Chưa bắt đầu", "running": "Đang diễn ra", "paused": "Tạm dừng", "completed": "Hoàn thành", "skipped": "Đã bỏ qua", "interrupted": "Dừng giữa chừng"},
    "remaining": "Thời gian còn lại", "segmentProgress": "Tiến độ giai đoạn", "waitingTitle": "Sẵn sàng cho giai đoạn tiếp theo",
    "readyForNext": "Bắt đầu khi bạn sẵn sàng", "invalidState": "Không xác định được trạng thái hiện tại. Vui lòng đồng bộ phiên học.",
    "pausedHelp": "Đồng hồ học đang được tạm dừng.", "finishing": "Đã hết giờ — đang lưu giai đoạn này…",
    "pause": "Tạm dừng", "resume": "Tiếp tục", "startNext": "Bắt đầu {phase}", "finishSegment": "Hoàn thành giai đoạn",
    "skipBreak": "Bỏ qua nghỉ", "cancel": "Kết thúc sớm", "cancelConfirm": "Kết thúc phiên học sớm? Thời gian đã học sẽ được lưu lại.",
    "newSession": "Phiên học mới", "sync": "Đồng bộ", "offline": "Bạn đang ngoại tuyến. Đồng hồ hiển thị dữ liệu đồng bộ gần nhất.",
    "completedRounds": "Số vòng học đã hoàn thành", "focusTime": "Thời gian học", "breakTime": "Thời gian nghỉ",
    "timeline": "Lịch trình phiên học", "round": "Vòng {number}", "plannedDuration": "Dự kiến: {minutes} phút",
    "immersive": "Bật chế độ tập trung toàn màn hình", "exitImmersive": "Thoát chế độ tập trung toàn màn hình",
    "terminal": {"completed": "Đã hoàn thành phiên học", "cancelled": "Đã kết thúc phiên học"},
    "terminalSummary": "Phiên tập trung đã được lưu.",
    "noAutoSound": "Âm thanh báo giờ và nhạc tập trung sẽ có trong phase tiếp theo. Hiện chỉ có thông báo trực quan."
}


def change(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one anchor, found {count}; nothing in this file was written")
    return source.replace(old, new, 1)


def patch_page() -> None:
    source = PAGE.read_text(encoding="utf-8")
    if 'initialSnapshot={activeV2}' in source and 'activeV2 ? (' in source:
        print("Focus page already upgraded")
        return
    source = change(source,
        'import { getLocale, getTranslations } from "next-intl/server";\nimport { redirect } from "next/navigation";',
        'import { getTranslations } from "next-intl/server";', "locale/redirect imports")
    source = change(source,
        'import { FocusV2SessionBuilder } from "@/features/focus-sessions/components/focus-v2-session-builder";',
        'import { FocusV2SessionBuilder } from "@/features/focus-sessions/components/focus-v2-session-builder";\n'
        'import { FocusV2LifecycleView } from "@/features/focus-sessions/components/focus-v2-lifecycle-view";', "lifecycle import")
    source = change(source,
        '  if (process.env.FOCUS_V2_ENABLED === "true") {\n'
        '    const activeV2 = await getActiveFocusV2Snapshot();\n'
        '    if (activeV2) redirect(`/${await getLocale()}/focus-v2-lab`);\n'
        '  }',
        '  const activeV2 = process.env.FOCUS_V2_ENABLED === "true"\n'
        '    ? await getActiveFocusV2Snapshot()\n'
        '    : null;', "QA redirect")
    source = change(source,
        'const initialPreferences = process.env.FOCUS_V2_ENABLED === "true" && !activeSession',
        'const initialPreferences = process.env.FOCUS_V2_ENABLED === "true" && !activeSession && !activeV2', "preference gate")
    source = change(source,
        '            {activeSession ? (',
        '            {activeV2 ? (\n'
        '              <>\n'
        '                <FocusV2LifecycleView\n'
        '                  initialSnapshot={activeV2}\n'
        '                  taskTitle={tasks.find((task) => task.id === activeV2.session.task_id)?.title ?? null}\n'
        '                />\n'
        '                <Suspense fallback={<RagLoadingFallback />}>\n'
        '                  <FocusRagSection focusSessionId={activeV2.session.id} />\n'
        '                </Suspense>\n'
        '              </>\n'
        '            ) : activeSession ? (', "active branch")
    PAGE.write_text(source, encoding="utf-8")
    print("Focus page integrated")


def patch_builder() -> None:
    source = BUILDER.read_text(encoding="utf-8")
    if 'router.push(`/${locale}/focus-v2-lab`)' not in source:
        if '// Phase 5: session appears on /focus' in source:
            print("Builder already upgraded")
            return
        raise RuntimeError("Builder changed: expected Phase 4 navigation not found")
    source = change(source,
        'import { useLocale, useTranslations } from "next-intl";',
        'import { useTranslations } from "next-intl";', "builder imports")
    source = change(source, '  const locale = useLocale();\n', '', "builder locale")
    source = change(source,
        '      // Phase 4 intentionally keeps the Phase 3 QA timer screen. Phase 5\n'
        '      // replaces this destination with the production study/break experience.\n'
        '      router.push(`/${locale}/focus-v2-lab`);\n'
        '      router.refresh();',
        '      // Phase 5: session appears on /focus without navigating to the QA Lab.\n'
        '      router.refresh();', "builder navigation")
    BUILDER.write_text(source, encoding="utf-8")
    print("Builder upgraded")


def patch_builder_test() -> None:
    source = BUILDER_TEST.read_text(encoding="utf-8")
    before = '    expect(mocks.push).toHaveBeenCalledWith("/vi/focus-v2-lab");'
    after = '    expect(mocks.push).not.toHaveBeenCalled();\n    expect(mocks.refresh).toHaveBeenCalledOnce();'
    if before in source:
        source = change(source, before, after, "builder test navigation")
        BUILDER_TEST.write_text(source, encoding="utf-8")
        print("Builder test upgraded")
    elif after in source:
        print("Builder test already upgraded")
    else:
        raise RuntimeError("Builder test changed: expected assertion not found")


def patch_lab() -> None:
    source = QA_PAGE.read_text(encoding="utf-8")
    if 'FOCUS_V2_QA_LAB_ENABLED' in source:
        print("Lab already gated")
        return
    source = change(source,
        '  if (process.env.FOCUS_V2_ENABLED !== "true") notFound();',
        '  if (process.env.FOCUS_V2_ENABLED !== "true" || process.env.FOCUS_V2_QA_LAB_ENABLED !== "true") notFound();',
        "QA-only gate")
    QA_PAGE.write_text(source, encoding="utf-8")
    print("QA Lab gated")


def patch_locale(locale: str, data: dict) -> None:
    path = ROOT / f"apps/web/messages/{locale}.json"
    source = path.read_text(encoding="utf-8")
    existing = json.loads(source)["focus"].get("live")
    if existing is not None:
        if existing != data:
            raise RuntimeError(f"{locale} focus.live exists but differs from Phase 5")
        print(f"{locale} translations already installed")
        return
    anchor = '\n  "focus": {\n'
    if source.count(anchor) != 1:
        raise RuntimeError(f"{locale} missing a unique focus namespace anchor")
    formatted = json.dumps(data, ensure_ascii=False, indent=2)
    fragment = '    "live": ' + formatted.replace('\n', '\n    ') + ',\n'
    updated = source.replace(anchor, anchor + fragment, 1)
    if json.loads(updated)["focus"]["live"] != data:
        raise RuntimeError(f"{locale} translations corrupt after injection")
    path.write_text(updated, encoding="utf-8")
    print(f"{locale} translations added")


if __name__ == "__main__":
    # Preflight all tracked baseline files before any write, to avoid partial patches.
    for file in (PAGE, BUILDER, BUILDER_TEST, QA_PAGE):
        if not file.is_file():
            raise RuntimeError(f"Required baseline file not found: {file}")
    patch_page()
    patch_builder()
    patch_builder_test()
    patch_lab()
    patch_locale("en", EN)
    patch_locale("vi", VI)
    print("Focus Phase 5 installed")
