#!/usr/bin/env python3
"""Deterministic Phase 4 registration against Lumivox product-release baseline.

Run from repository root: python scripts/apply-focus-v2-phase4.py
This only patches the existing Focus page and the two locale JSON files.
All remaining files are provided complete in this kit.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "apps/web/app/[locale]/(protected)/focus/page.tsx"

EN = {
    "title": "Build your focus session",
    "description": "Set study rounds, breaks, and an automatic or manual study rhythm.",
    "presetsTitle": "Study presets",
    "presets": {"classic": "Classic 25/5", "balanced": "Balanced 50/10", "deepWork": "Deep Work 90/15", "custom": "Custom"},
    "task": "Linked task",
    "chooseTask": "Choose a task",
    "noTask": "Study without a linked task",
    "fields": {
        "focusMinutes": "Study minutes per round",
        "shortBreakMinutes": "Short break minutes",
        "longBreakMinutes": "Long break minutes",
        "roundCount": "Number of rounds",
        "longBreakEvery": "Take a long break after every N rounds"
    },
    "range": "Allowed range: {min}–{max}",
    "toggles": {"autoStartBreaks": "Automatically start breaks", "autoStartFocus": "Automatically start the next study round"},
    "toggleHelp": {
        "autoStartBreaks": "Otherwise, the timer waits for you to start the break.",
        "autoStartFocus": "Otherwise, the timer waits for you to start the next study round."
    },
    "scheduleTitle": "Your planned timeline",
    "focusSegment": "Study",
    "shortBreakSegment": "Short break",
    "longBreakSegment": "Long break",
    "round": "Round {number}",
    "minuteUnit": "min",
    "totalFocus": "Study time",
    "totalBreak": "Break time",
    "totalDuration": "Total duration",
    "noFinalBreak": "No break is scheduled after the final study round.",
    "invalidConfig": "Please enter valid values for all session settings.",
    "saveDefaults": "Save as my defaults",
    "saved": "Default settings saved.",
    "saveFailed": "Unable to save default settings.",
    "saving": "Saving…",
    "start": "Start focus session",
    "starting": "Starting…",
    "created": "Focus session started.",
    "startFailed": "Unable to start this focus session.",
    "savedHint": "Saving defaults does not start a session. A new session uses your current settings."
}

VI = {
    "title": "Thiết lập phiên tập trung",
    "description": "Tùy chỉnh số vòng học, thời gian nghỉ và cách chuyển tiếp giữa các vòng.",
    "presetsTitle": "Cấu hình có sẵn",
    "presets": {"classic": "Cổ điển 25/5", "balanced": "Cân bằng 50/10", "deepWork": "Học sâu 90/15", "custom": "Tùy chỉnh"},
    "task": "Nhiệm vụ liên kết",
    "chooseTask": "Chọn nhiệm vụ",
    "noTask": "Học không liên kết nhiệm vụ",
    "fields": {
        "focusMinutes": "Phút học mỗi vòng",
        "shortBreakMinutes": "Phút nghỉ ngắn",
        "longBreakMinutes": "Phút nghỉ dài",
        "roundCount": "Số vòng học",
        "longBreakEvery": "Nghỉ dài sau mỗi N vòng học"
    },
    "range": "Khoảng hợp lệ: {min}–{max}",
    "toggles": {"autoStartBreaks": "Tự bắt đầu giờ nghỉ", "autoStartFocus": "Tự bắt đầu vòng học tiếp theo"},
    "toggleHelp": {
        "autoStartBreaks": "Nếu tắt, đồng hồ sẽ chờ bạn bắt đầu giờ nghỉ.",
        "autoStartFocus": "Nếu tắt, đồng hồ sẽ chờ bạn bắt đầu vòng học tiếp theo."
    },
    "scheduleTitle": "Lịch trình dự kiến",
    "focusSegment": "Học",
    "shortBreakSegment": "Nghỉ ngắn",
    "longBreakSegment": "Nghỉ dài",
    "round": "Vòng {number}",
    "minuteUnit": "phút",
    "totalFocus": "Tổng thời gian học",
    "totalBreak": "Tổng thời gian nghỉ",
    "totalDuration": "Tổng thời lượng",
    "noFinalBreak": "Không có giờ nghỉ sau vòng học cuối cùng.",
    "invalidConfig": "Vui lòng nhập các giá trị hợp lệ cho toàn bộ cấu hình phiên học.",
    "saveDefaults": "Lưu làm mặc định",
    "saved": "Đã lưu cấu hình mặc định.",
    "saveFailed": "Không lưu được cấu hình mặc định.",
    "saving": "Đang lưu…",
    "start": "Bắt đầu phiên tập trung",
    "starting": "Đang bắt đầu…",
    "created": "Đã bắt đầu phiên tập trung.",
    "startFailed": "Không thể bắt đầu phiên tập trung.",
    "savedHint": "Lưu mặc định không bắt đầu phiên học. Phiên mới sẽ sử dụng cấu hình hiện tại của bạn."
}


def inject_once(source: str, needle: str, replacement: str, label: str) -> str:
    count = source.count(needle)
    if count != 1:
        raise RuntimeError(f"Cannot patch {label}: expected exactly one anchor, found {count}")
    return source.replace(needle, replacement, 1)


def patch_page() -> None:
    source = PAGE.read_text(encoding="utf-8")
    if 'FocusV2SessionBuilder' in source:
        print("Focus page: already registered")
        return
    source = inject_once(
        source,
        'import { getActiveFocusV2Snapshot } from "@/features/focus-sessions/focus-v2.queries";\n',
        'import { getActiveFocusV2Snapshot } from "@/features/focus-sessions/focus-v2.queries";\n'
        'import { getFocusV2Preferences } from "@/features/focus-sessions/focus-v2-preferences.queries";\n'
        'import { FocusV2SessionBuilder } from "@/features/focus-sessions/components/focus-v2-session-builder";\n',
        "Focus imports",
    )
    source = inject_once(
        source,
        '    getTranslations("focus.page"),\n  ]);\n\n  return (',
        '    getTranslations("focus.page"),\n  ]);\n'
        '  const initialPreferences = process.env.FOCUS_V2_ENABLED === "true" && !activeSession\n'
        '    ? await getFocusV2Preferences()\n'
        '    : null;\n\n  return (',
        "Focus preferences loader",
    )
    source = inject_once(
        source,
        '              <StartFocusSessionForm tasks={tasks} />',
        '              initialPreferences\n'
        '                ? <FocusV2SessionBuilder tasks={tasks} initialPreferences={initialPreferences} />\n'
        '                : <StartFocusSessionForm tasks={tasks} />',
        "Focus form render",
    )
    PAGE.write_text(source, encoding="utf-8")
    print("Focus page: patched")


def patch_locale(locale: str, strings: dict) -> None:
    file = ROOT / f"apps/web/messages/{locale}.json"
    source = file.read_text(encoding="utf-8")
    payload = json.loads(source)
    if "builder" in payload["focus"]:
        if payload["focus"]["builder"] != strings:
            raise RuntimeError(f"{locale}: builder translations already exist but differ")
        print(f"{locale}: already registered")
        return
    anchor = '\n  "focus": {\n'
    if source.count(anchor) != 1:
        raise RuntimeError(f"{locale}: expected one Focus locale anchor")
    # Inject one node without reformatting unrelated translation keys.
    data = json.dumps(strings, ensure_ascii=False, indent=2)
    inserted = '    "builder": ' + data.replace('\n', '\n    ') + ',\n'
    source = source.replace(anchor, anchor + inserted, 1)
    updated = json.loads(source)
    if updated["focus"]["builder"] != strings:
        raise RuntimeError(f"{locale}: corrupted translation output")
    file.write_text(source, encoding="utf-8")
    print(f"{locale}: added focus.builder translations")


if __name__ == "__main__":
    patch_page()
    patch_locale("en", EN)
    patch_locale("vi", VI)
    print("Phase 4 registration complete")
