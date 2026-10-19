#!/usr/bin/env python3
"""Register Phase 7 on Lumivox Phase 6 baseline; idempotent and fail-closed.

Run at repository root: python scripts/apply-focus-v2-phase7.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FOCUS = ROOT / "apps/web/features/focus-sessions"
LIFECYCLE = FOCUS / "components/focus-v2-lifecycle-view.tsx"
AUDIO = FOCUS / "use-focus-v2-audio.ts"

EN = {
    "title": "Notifications & attention",
    "description": "Control reminders and record interruptions during focus rounds.",
    "notificationsTitle": "Browser notifications",
    "notificationsHelp": "Optional reminders when Lumivox observes a completed or started segment. The page must be active or restored; this is not a background alarm.",
    "enableNotifications": "Enable notifications",
    "disableNotifications": "Disable notifications",
    "permissionUnavailable": "Notifications require a supported browser and secure HTTPS page.",
    "permissionDenied": "Notification permission was not granted. Check your browser's site settings.",
    "browserBlocked": "Your browser has blocked notifications for this site.",
    "notificationTitle": "Lumivox Focus",
    "notifications": {
        "focusStarted": "Your next focus round has started.",
        "breakStarted": "Your break has started.",
        "focusFinished": "Focus round finished. Get ready for a break.",
        "breakFinished": "Break finished. Get ready to focus.",
        "sessionCompleted": "You completed your focus session. Nice work!",
    },
    "awayTitle": "Offer a reminder when I return to Lumivox",
    "awayHelp": "Optional. Uses only whether this Lumivox page becomes hidden during an active focus round. It never reads other tabs, URLs, or screenshots and never saves a distraction automatically.",
    "minimumAway": "Minimum time away before suggesting a log",
    "seconds": "{count} seconds",
    "awayCandidate": "This Lumivox tab was hidden for about {seconds} seconds. If that was a distraction, you can use this duration. Nothing has been saved.",
    "useAwayDuration": "Use this duration",
    "dismiss": "Dismiss",
    "manualTitle": "Log an interruption",
    "manualHelp": "Only saved when you press the button. Duration is optional: enter 0 if unknown.",
    "category": "Category",
    "duration": "Duration (seconds)",
    "note": "Note (optional, up to 500 characters)",
    "save": "Save distraction",
    "saving": "Saving…",
    "saved": "Distraction saved.",
    "saveFailed": "Could not save the distraction.",
    "focusOnly": "Logging is available only during a focus round (running or paused), not during breaks.",
    "privacy": "Browser settings are stored on this device. Only distractions you explicitly submit are stored in your Lumivox account.",
    "categories": {
        "social_media": "Social media", "messaging": "Messaging",
        "external_interrupt": "External interruption", "fatigue": "Fatigue", "other": "Other",
    },
}
VI = {
    "title": "Thông báo & quản lý xao nhãng",
    "description": "Điều khiển nhắc nhở và ghi nhận gián đoạn trong các vòng học.",
    "notificationsTitle": "Thông báo từ trình duyệt",
    "notificationsHelp": "Thông báo tùy chọn khi Lumivox ghi nhận giai đoạn bắt đầu/kết thúc. Trang cần còn hoạt động hoặc được mở lại; đây không phải báo thức nền.",
    "enableNotifications": "Bật thông báo",
    "disableNotifications": "Tắt thông báo",
    "permissionUnavailable": "Thông báo yêu cầu trình duyệt hỗ trợ và trang HTTPS an toàn.",
    "permissionDenied": "Chưa được cấp quyền thông báo. Hãy kiểm tra thiết lập website của trình duyệt.",
    "browserBlocked": "Trình duyệt đã chặn thông báo của website này.",
    "notificationTitle": "Lumivox Focus",
    "notifications": {
        "focusStarted": "Vòng học tiếp theo đã bắt đầu.",
        "breakStarted": "Giờ nghỉ đã bắt đầu.",
        "focusFinished": "Đã hoàn thành vòng học. Chuẩn bị nghỉ ngơi nhé.",
        "breakFinished": "Giờ nghỉ đã kết thúc. Chuẩn bị học tiếp nhé.",
        "sessionCompleted": "Bạn đã hoàn thành phiên tập trung!",
    },
    "awayTitle": "Nhắc tôi khi quay lại trang Lumivox",
    "awayHelp": "Tùy chọn. Chỉ xem trang Lumivox này bị ẩn khi đang học hay không. Không đọc tab khác, URL hoặc ảnh màn hình; không tự động lưu xao nhãng.",
    "minimumAway": "Thời gian rời trang tối thiểu trước khi gợi ý",
    "seconds": "{count} giây",
    "awayCandidate": "Tab Lumivox này đã bị ẩn khoảng {seconds} giây. Nếu thực sự xao nhãng, bạn có thể dùng thời lượng này. Chưa có dữ liệu nào được lưu.",
    "useAwayDuration": "Dùng thời lượng này",
    "dismiss": "Bỏ qua",
    "manualTitle": "Ghi nhận gián đoạn",
    "manualHelp": "Chỉ lưu sau khi bạn bấm nút xác nhận. Nhập 0 nếu không rõ thời gian.",
    "category": "Loại xao nhãng",
    "duration": "Thời lượng (giây)",
    "note": "Ghi chú (tùy chọn, tối đa 500 ký tự)",
    "save": "Lưu xao nhãng",
    "saving": "Đang lưu…",
    "saved": "Đã lưu xao nhãng.",
    "saveFailed": "Không thể lưu xao nhãng.",
    "focusOnly": "Chỉ có thể ghi nhận khi đang trong vòng học (đang chạy hoặc tạm dừng), không phải giờ nghỉ.",
    "privacy": "Các lựa chọn trình duyệt lưu trên thiết bị. Chỉ dữ liệu xao nhãng bạn chủ động gửi mới được lưu vào tài khoản Lumivox.",
    "categories": {
        "social_media": "Mạng xã hội", "messaging": "Tin nhắn",
        "external_interrupt": "Gián đoạn bên ngoài", "fatigue": "Mệt mỏi", "other": "Khác",
    },
}


def replace_once(content: str, needle: str, replacement: str, label: str) -> str:
    if content.count(needle) != 1:
        raise RuntimeError(f"{label}: expected exactly 1 anchor, found {content.count(needle)}")
    return content.replace(needle, replacement, 1)


def patch_lifecycle() -> None:
    text = LIFECYCLE.read_text(encoding="utf-8")
    import_line = 'import { FocusV2AudioPanel } from "./focus-v2-audio-panel";\n'
    new_import = 'import { FocusV2AttentionPanel } from "./focus-v2-attention-panel";\n'
    if new_import not in text:
        text = replace_once(text, import_line, import_line + new_import, "lifecycle import")
    jsx = '      <FocusV2AudioPanel sessionId={snapshot.session.id} projection={projection} />'
    attention = '      <FocusV2AttentionPanel sessionId={snapshot.session.id} projection={projection} />'
    if attention not in text:
        text = replace_once(text, jsx, jsx + "\n" + attention, "attention panel placement")
    LIFECYCLE.write_text(text, encoding="utf-8")
    print("Lifecycle: attention panel registered")


def patch_audio_cue() -> None:
    text = AUDIO.read_text(encoding="utf-8")
    needle = '  const previewCue = useCallback((cue: FocusV2Cue = "focus_start") => {'
    cue_effect = '''  // Phase 7: play a distraction cue ONLY after the user explicitly saved a log.
  useEffect(() => {
    function onManualSave() {
      if (!enabledRef.current || !settingsRef.current.cuesEnabled || document.hidden) return;
      engineRef.current?.playCue("distraction");
    }
    window.addEventListener("lumivox:focus-v2-distraction-saved", onManualSave);
    return () => window.removeEventListener("lumivox:focus-v2-distraction-saved", onManualSave);
  }, []);

'''
    if "lumivox:focus-v2-distraction-saved" not in text:
        text = replace_once(text, needle, cue_effect + needle, "audio cue hookup")
    AUDIO.write_text(text, encoding="utf-8")
    print("Audio: user-confirmed distraction cue registered")


def patch_language(locale: str, labels: dict) -> None:
    path = ROOT / f"apps/web/messages/{locale}.json"
    text = path.read_text(encoding="utf-8")
    payload = json.loads(text)
    if "attention" in payload["focus"]:
        if payload["focus"]["attention"] != labels:
            raise RuntimeError(f"{locale}: existing focus.attention translations differ")
        print(f"{locale}: translations already installed")
        return
    anchor = '\n  "focus": {\n'
    if text.count(anchor) != 1:
        raise RuntimeError(f"{locale}: missing focus message anchor")
    encoded = json.dumps(labels, ensure_ascii=False, indent=2)
    inserted = '    "attention": ' + encoded.replace("\n", "\n    ") + ',\n'
    patched = text.replace(anchor, anchor + inserted, 1)
    if json.loads(patched)["focus"]["attention"] != labels:
        raise RuntimeError(f"{locale}: message verification failed")
    path.write_text(patched, encoding="utf-8")
    print(f"{locale}: translations added")


if __name__ == "__main__":
    # Validate anchors and messages BEFORE writing whenever possible.
    assert LIFECYCLE.exists() and AUDIO.exists(), "Run from the Lumivox repo with Phase 6 merged"
    patch_lifecycle()
    patch_audio_cue()
    patch_language("en", EN)
    patch_language("vi", VI)
    print("Phase 7 installer completed")
