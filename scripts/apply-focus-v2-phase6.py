#!/usr/bin/env python3
"""Install Phase 6 to the verified Lumivox Phase 5 product-release layout.

Run from repo root: python scripts/apply-focus-v2-phase6.py
Idempotent; refuses drift and missing anchors rather than rewriting unrelated files.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "apps/web/features/focus-sessions/components/focus-v2-lifecycle-view.tsx"

STRINGS = {
    "en": {
        "title": "Focus sounds", "description": "Ambient sound and transition tones",
        "enable": "Enable audio", "disable": "Turn audio off", "sound": "Background sound",
        "volume": "Ambient volume: {value}%", "mute": "Mute background",
        "duringBreak": "Continue ambient sound during breaks", "cues": "Enable transition tones",
        "cuesVolume": "Cue volume: {value}%", "previewCue": "Preview tone",
        "ready": "Audio ready for this tab", "optIn": "Audio starts only after you select Enable audio.",
        "unavailable": "Audio is blocked or unavailable. Check browser permissions and try again.",
        "privacy": "Generated locally; no streaming, uploads or microphone access. Saved choices stay in this browser.",
        "sounds": {
            "white": "White noise", "pink": "Pink noise", "brown": "Brown noise",
            "rain": "Rain ambience", "ocean": "Ocean waves", "ambient_pad": "Gentle ambient tones",
        },
    },
    "vi": {
        "title": "Âm thanh tập trung", "description": "Âm thanh nền và tín hiệu chuyển vòng",
        "enable": "Bật âm thanh", "disable": "Tắt âm thanh", "sound": "Âm thanh nền",
        "volume": "Âm lượng nền: {value}%", "mute": "Tắt tiếng nền",
        "duringBreak": "Tiếp tục âm thanh nền trong giờ nghỉ", "cues": "Bật âm báo chuyển vòng",
        "cuesVolume": "Âm lượng thông báo: {value}%", "previewCue": "Nghe thử âm báo",
        "ready": "Âm thanh đã sẵn sàng ở tab này", "optIn": "Chỉ phát âm thanh sau khi bạn nhấn Bật âm thanh.",
        "unavailable": "Trình duyệt đang chặn hoặc không hỗ trợ âm thanh. Kiểm tra quyền và thử lại.",
        "privacy": "Âm thanh được tạo trên thiết bị; không stream, upload hay dùng micro. Lựa chọn chỉ lưu trên trình duyệt.",
        "sounds": {
            "white": "Tiếng ồn trắng", "pink": "Tiếng ồn hồng", "brown": "Tiếng ồn nâu",
            "rain": "Âm thanh mưa", "ocean": "Tiếng sóng biển", "ambient_pad": "Giai điệu nền dịu nhẹ",
        },
    },
}

IMPORT_ANCHOR = 'import { useFocusV2Timer } from "../use-focus-v2-timer";\n'
NEW_IMPORT = IMPORT_ANCHOR + 'import { FocusV2AudioPanel } from "./focus-v2-audio-panel";\n'
RENDER_ANCHOR = '      <div className="flex flex-wrap items-center justify-center gap-2">'
NEW_RENDER = '      <FocusV2AudioPanel sessionId={snapshot.session.id} projection={projection} />\n\n' + RENDER_ANCHOR
OBSOLETE_NOTE = '      <p className="text-caption text-muted-foreground">{t("noAutoSound")}</p>\n'


def patch_page() -> str:
    text = PAGE.read_text(encoding="utf-8")
    if 'import { FocusV2AudioPanel }' in text:
        if '<FocusV2AudioPanel sessionId={snapshot.session.id} projection={projection} />' not in text:
            raise RuntimeError("Phase 6 import exists but panel is not rendered")
        if OBSOLETE_NOTE in text:
            raise RuntimeError("Phase 6 panel installed but obsolete sound note remains")
        return text
    if text.count(IMPORT_ANCHOR) != 1 or text.count(RENDER_ANCHOR) != 1 or text.count(OBSOLETE_NOTE) != 1:
        raise RuntimeError("Phase 5 layout drift: patch anchors not unique. Review focus-v2-lifecycle-view.tsx")
    text = text.replace(IMPORT_ANCHOR, NEW_IMPORT, 1)
    text = text.replace(RENDER_ANCHOR, NEW_RENDER, 1)
    text = text.replace(OBSOLETE_NOTE, "", 1)
    return text


def patch_locale(locale: str) -> tuple[Path, str]:
    path = ROOT / f"apps/web/messages/{locale}.json"
    source = path.read_text(encoding="utf-8")
    data = json.loads(source)
    if "audio" in data["focus"]:
        if data["focus"]["audio"] != STRINGS[locale]:
            raise RuntimeError(f"focus.audio already exists in {locale} with conflicting content")
        return path, source
    # Include the line boundary so nested focus objects cannot match this anchor.
    anchor = '\n  "focus": {\n'
    count = source.count(anchor)
    if count != 1:
        raise RuntimeError(f"Expected one top-level focus key anchor in {locale}, found {count}")
    packed = json.dumps(STRINGS[locale], ensure_ascii=False, indent=2)
    inserted = '    "audio": ' + packed.replace("\n", "\n    ") + ",\n"
    result = source.replace(anchor, anchor + inserted, 1)
    if json.loads(result)["focus"]["audio"] != STRINGS[locale]:
        raise RuntimeError(f"Failed locale validation {locale}")
    return path, result


def main() -> None:
    # Validate ALL edits before writing ANY file.
    updated_page = patch_page()
    locales = [patch_locale(name) for name in ("en", "vi")]
    PAGE.write_text(updated_page, encoding="utf-8")
    for path, text in locales:
        path.write_text(text, encoding="utf-8")
    print("Phase 6 registration complete (safe to re-run).")


if __name__ == "__main__":
    main()
