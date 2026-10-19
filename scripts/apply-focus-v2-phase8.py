#!/usr/bin/env python3
"""Apply Focus V2 Phase 8 against product-release commit b78fef1c.
Idempotent, validates exact anchors and fails closed before mutating any file.
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "apps/web/app/[locale]/(protected)/focus/page.tsx"
TRANSLATIONS = {
    "en": {
        "title": "Focus analytics", "subtitle": "Last {days} calendar days (UTC). Recorded sessions only.",
        "periodLabel": "Reporting period", "sevenDays": "7 days", "thirtyDays": "30 days",
        "focusHours": "Focus hours", "breakHours": "Break hours", "pausedHours": "Paused hours",
        "completionRate": "Completion rate", "completedSessions": "Completed sessions", "completedRounds": "Completed Pomodoro rounds",
        "distractions": "Reported distractions", "distractionMinutes": "Reported distraction minutes",
        "sessionBreakdown": "{total} sessions · {active} active · {completed} completed · {cancelled} cancelled",
        "dailyTitle": "Focus time by day", "dailyDescription": "Daily recorded focus duration, in UTC calendar days",
        "utcMethodology": "Times are grouped by the session's UTC start date. Days may differ from your local midnight.",
        "tasksTitle": "Top linked tasks", "noTasks": "No linked tasks in this period.", "deletedTask": "Deleted or unavailable task", "minutes": "min",
        "engagementTitle": "Streak & rewards", "currentStreak": "Current streak (days)", "longestStreak": "Longest streak (days)",
        "tokenBalance": "Current token balance", "focusRewards": "Focus rewards recorded in period", "focusTokens": "Tokens earned from focus in period",
        "rewardMethodology": "Streak and token balance are all-time snapshots; focus rewards are ledger entries dated in the chosen period. Reward posting may be delayed.",
        "dataMethodology": "Focus excludes breaks and open pauses. Active focus time is not included until recorded by a segment transition. Completion rate = completed / (completed + cancelled). Distractions are voluntarily reported and are not automatically subtracted from focus.",
        "partialWarning": "Some records exceed the safe query limit. This report is partial; do not treat its totals as complete.",
        "loadError": "Analytics are temporarily unavailable. Your focus timer still works.",
        "categoriesTitle": "Reported distraction categories", "noDistractions": "No reported distractions in this period.",
        "categories": {"social_media":"Social media","messaging":"Messaging","external_interrupt":"External interruption","fatigue":"Fatigue","other":"Other"}
    },
    "vi": {
        "title": "Phân tích phiên tập trung", "subtitle": "{days} ngày lịch gần nhất (UTC), chỉ tính dữ liệu đã ghi nhận.",
        "periodLabel": "Khoảng thống kê", "sevenDays": "7 ngày", "thirtyDays": "30 ngày",
        "focusHours": "Giờ tập trung", "breakHours": "Giờ nghỉ", "pausedHours": "Giờ tạm dừng",
        "completionRate": "Tỷ lệ hoàn thành", "completedSessions": "Phiên hoàn thành", "completedRounds": "Vòng Pomodoro hoàn thành",
        "distractions": "Lượt xao nhãng đã khai báo", "distractionMinutes": "Phút xao nhãng đã khai báo",
        "sessionBreakdown": "{total} phiên · {active} đang hoạt động · {completed} hoàn thành · {cancelled} hủy",
        "dailyTitle": "Thời gian tập trung theo ngày", "dailyDescription": "Thời gian tập trung đã ghi nhận theo ngày UTC",
        "utcMethodology": "Dữ liệu nhóm theo ngày UTC bắt đầu phiên; ngày có thể khác mốc nửa đêm tại địa phương.",
        "tasksTitle": "Nhiệm vụ được tập trung nhiều", "noTasks": "Chưa có nhiệm vụ liên kết trong kỳ.", "deletedTask": "Nhiệm vụ đã xóa hoặc không còn truy cập", "minutes": "phút",
        "engagementTitle": "Chuỗi ngày & phần thưởng", "currentStreak": "Streak hiện tại (ngày)", "longestStreak": "Streak dài nhất (ngày)",
        "tokenBalance": "Số token hiện tại", "focusRewards": "Lượt thưởng Focus ghi sổ trong kỳ", "focusTokens": "Token nhận từ Focus trong kỳ",
        "rewardMethodology": "Streak và số dư token là dữ liệu tích lũy; phần thưởng Focus lấy từ ledger theo ngày ghi nhận trong kỳ. Việc ghi thưởng có thể chậm.",
        "dataMethodology": "Focus không gồm nghỉ và khoảng pause chưa đóng. Thời gian học đang chạy chưa được tính trước khi ghi segment. Tỷ lệ hoàn thành = hoàn thành / (hoàn thành + hủy). Xao nhãng do người dùng khai báo và không tự bị trừ khỏi Focus.",
        "partialWarning": "Một số dữ liệu vượt giới hạn truy vấn an toàn. Báo cáo này chỉ là một phần; không sử dụng các tổng như số liệu đầy đủ.",
        "loadError": "Tạm thời chưa tải được thống kê. Đồng hồ tập trung vẫn hoạt động bình thường.",
        "categoriesTitle": "Nhóm xao nhãng đã khai báo", "noDistractions": "Chưa ghi nhận xao nhãng trong kỳ.",
        "categories": {"social_media":"Mạng xã hội","messaging":"Nhắn tin","external_interrupt":"Yếu tố bên ngoài","fatigue":"Mệt mỏi","other":"Khác"}
    }
}


def patched_page(src: str) -> str:
    if "FocusV2AnalyticsDashboard" in src:
        if 'analyticsDays' not in src:
            raise RuntimeError("Incomplete Phase 8 page integration")
        return src
    anchor_import = 'import { FocusV2LifecycleView } from "@/features/focus-sessions/components/focus-v2-lifecycle-view";\n'
    if src.count(anchor_import) != 1: raise RuntimeError("Focus analytics import anchor changed")
    src = src.replace(anchor_import, anchor_import +
        'import { FocusV2AnalyticsDashboard } from "@/features/focus-sessions/components/focus-v2-analytics-dashboard";\n', 1)
    anchor_fn = 'export default async function FocusPage() {\n'
    if src.count(anchor_fn) != 1: raise RuntimeError("Focus page function anchor changed")
    src = src.replace(anchor_fn, 'export default async function FocusPage({ searchParams }: { searchParams: Promise<{ focusPeriod?: string }> }) {\n'
        '  const { focusPeriod } = await searchParams;\n'
        '  const analyticsDays: 7 | 30 = focusPeriod === "7" ? 7 : 30;\n', 1)
    anchor_section = '          <RecentFocusSessions sessions={recentSessions} />\n        </div>\n      </div>'
    if src.count(anchor_section) != 1: raise RuntimeError("Focus dashboard placement anchor changed")
    return src.replace(anchor_section, '          <RecentFocusSessions sessions={recentSessions} />\n        </div>\n'
        '        {process.env.FOCUS_V2_ENABLED === "true" && (\n'
        '          <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-muted" aria-hidden="true" />}>\n'
        '            <FocusV2AnalyticsDashboard days={analyticsDays} />\n'
        '          </Suspense>\n'
        '        )}\n      </div>', 1)


def patched_translation(src: str, locale: str) -> str:
    payload = json.loads(src)
    if payload["focus"].get("analytics") is not None:
        if payload["focus"]["analytics"] != TRANSLATIONS[locale]:
            raise RuntimeError(f"Existing {locale} analytics translations differ")
        return src
    anchor = '\n  "focus": {\n'
    if src.count(anchor) != 1: raise RuntimeError(f"{locale}: cannot find stable translation anchor")
    data = json.dumps(TRANSLATIONS[locale], indent=2, ensure_ascii=False)
    result = src.replace(anchor, anchor + '    "analytics": ' + data.replace('\n','\n    ') + ',\n', 1)
    if json.loads(result)["focus"]["analytics"] != TRANSLATIONS[locale]:
        raise RuntimeError(f"{locale} translations invalid")
    return result


def main() -> None:
    paths = {PAGE: patched_page(PAGE.read_text(encoding="utf-8"))}
    for locale in ("en", "vi"):
        path = ROOT / f"apps/web/messages/{locale}.json"
        paths[path] = patched_translation(path.read_text(encoding="utf-8"), locale)
    # No file is written until all validation above passes.
    for path, new in paths.items():
        if path.read_text(encoding="utf-8") != new:
            path.write_text(new, encoding="utf-8")
            print(f"Updated {path.relative_to(ROOT)}")
        else:
            print(f"Unchanged {path.relative_to(ROOT)}")
    print("Phase 8 installed")

if __name__ == "__main__": main()
