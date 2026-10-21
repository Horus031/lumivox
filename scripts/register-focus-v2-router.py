#!/usr/bin/env python3
"""Run once from repo root after overlaying the implementation kit."""
from pathlib import Path
p = Path('services/ai-api/app/main.py')
source = p.read_text(encoding='utf-8')
if '    focus_v2,\n' not in source:
    old = 'from app.api.routes import (\n    ai_translations,\n'
    assert old in source, 'main.py import block changed; stop and inspect'
    source = source.replace(old, old + '    focus_v2,\n', 1)
if 'focus_v2.router,' not in source:
    old = 'app.include_router(\n    engagement_retention.router,\n    prefix=(\n        "/api/v1/engagement"\n    ),\n    tags=[\n        "Engagement Retention"\n    ],\n)'
    assert old in source, 'main.py include_router block changed; stop and inspect'
    new = old + '\n\napp.include_router(\n    focus_v2.router,\n    prefix="/api/v1/focus-v2",\n    tags=["Focus V2"],\n)'
    source = source.replace(old, new, 1)
p.write_text(source, encoding='utf-8')
# Prevent V2 active sessions from being displayed through the legacy single-timer panel.
web = Path('apps/web/app/[locale]/(protected)/focus/page.tsx')
web_source = web.read_text(encoding='utf-8')
if 'getActiveFocusV2Snapshot' not in web_source:
    old = 'import { getTranslations } from "next-intl/server";'
    assert old in web_source, 'Focus page i18n imports changed; stop and inspect'
    web_source = web_source.replace(old, '''import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getActiveFocusV2Snapshot } from "@/features/focus-sessions/focus-v2.queries";''', 1)
if 'activeV2' not in web_source:
    old = 'export default async function FocusPage() {\n'
    assert old in web_source, 'FocusPage signature changed; stop and inspect'
    web_source = web_source.replace(old, old + '''  if (process.env.FOCUS_V2_ENABLED === "true") {
    const activeV2 = await getActiveFocusV2Snapshot();
    if (activeV2) redirect(`/${await getLocale()}/focus-v2-lab`);
  }
''', 1)
web.write_text(web_source, encoding='utf-8')
print('Focus V2 routes registered, and legacy FocusPage protected on QA staging.')
print('Review git diff for main.py and FocusPage before committing.')

example_env = Path('apps/web/.env.example')
env_text = example_env.read_text(encoding='utf-8')
if 'FOCUS_V2_ENABLED=' not in env_text:
    example_env.write_text(env_text.rstrip() + '\n\n# Server-only staging QA gate (disabled in production).\nFOCUS_V2_ENABLED=false\n', encoding='utf-8')
