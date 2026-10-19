#!/usr/bin/env python3
"""Deterministic installer for Phase 9, based on product-release b331ab576443.

Run from repository root. New files supplied in the ZIP must be copied first.
Only adjusts explicitly verified anchors in existing source. Repeat runs are no-ops.
The SQL migration is installed separately with Supabase CLI-generated filename.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps/web"
FOCUS = WEB / "features/focus-sessions"
PAGE = WEB / "app/[locale]/(protected)/focus/page.tsx"


def patch(path: Path, changes: list[tuple[str, str]], label: str) -> tuple[str, str]:
    source = path.read_text(encoding="utf-8")
    staged = source
    for old, new in changes:
        if old == new:
            continue
        if new in staged:
            continue
        elif old in staged:
            if staged.count(old) != 1:
                raise RuntimeError(f"{label}: expected one anchor, found {staged.count(old)}: {old[:90]!r}")
            staged = staged.replace(old, new, 1)
        else:
            raise RuntimeError(f"{label}: baseline diverged; no files written. Anchor {old[:90]!r}")
    return source, staged


def main() -> None:
    required = [FOCUS / "focus-v2-release.ts", FOCUS / "focus-v2-release.test.ts"]
    missing = [str(x.relative_to(ROOT)) for x in required if not x.is_file()]
    if missing:
        raise RuntimeError(f"Copy kit contents into root first: missing {missing}")

    staged_files: list[tuple[Path, str, str]] = []

    staged_files.append((FOCUS / "focus-v2.actions.ts", *patch(FOCUS / "focus-v2.actions.ts", [
        ('import { focusV2ConfigSchema, type FocusV2Config } from "./focus-v2-config.schemas";',
         'import { focusV2ConfigSchema, type FocusV2Config } from "./focus-v2-config.schemas";\n'
         'import { isFocusV2CreationEnabled } from "./focus-v2-release";'),
        ('  if (!isEnabled()) return { success: false, message: "Focus V2 is not enabled." };\n  const parsed = focusV2ConfigSchema.safeParse(input);',
         '  if (!isFocusV2CreationEnabled()) return { success: false, message: "Focus V2 is not accepting new sessions." };\n  const parsed = focusV2ConfigSchema.safeParse(input);'),
    ], "V2 create action")))

    staged_files.append((PAGE, *patch(PAGE, [
        ('import { FocusV2AnalyticsDashboard } from "@/features/focus-sessions/components/focus-v2-analytics-dashboard";',
         'import { FocusV2AnalyticsDashboard } from "@/features/focus-sessions/components/focus-v2-analytics-dashboard";\n'
         'import { isFocusV2CreationEnabled } from "@/features/focus-sessions/focus-v2-release";'),
        ('const initialPreferences = process.env.FOCUS_V2_ENABLED === "true" && !activeSession && !activeV2',
         'const initialPreferences = isFocusV2CreationEnabled() && !activeSession && !activeV2'),
    ], "Focus page")))

    staged_files.append((FOCUS / "focus-session.queries.ts", *patch(FOCUS / "focus-session.queries.ts", [
        ('    )\n    .in("status", ["ongoing", "paused"])\n    .maybeSingle();',
         '    )\n    .eq("session_mode", "legacy")\n    .in("status", ["ongoing", "paused"])\n    .maybeSingle();'),
    ], "legacy active query")))

    staged_files.append((WEB / ".env.example", *patch(WEB / ".env.example", [
        ('FOCUS_V2_ENABLED=true\nFOCUS_V2_QA_LAB_ENABLED=false',
         '# Existing Pomodoro sessions remain accessible while FOCUS_V2_ENABLED=true.\n'
         '# To pause creation without stranding active users: keep runtime true, set creation false.\n'
         '# Never turn runtime off until the corresponding database has zero active Pomodoro sessions.\n'
         'FOCUS_V2_ENABLED=true\nFOCUS_V2_CREATION_ENABLED=false\nFOCUS_V2_QA_LAB_ENABLED=false'),
    ], "environment contract")))

    staged_files.append((ROOT / ".github/workflows/ci.yml", *patch(ROOT / ".github/workflows/ci.yml", [
        ('      - name: Unit tests\n        run: npm run test:unit\n\n      - name: Production build',
         '      - name: Unit tests\n        run: npm run test:unit\n\n'
         '      - name: TypeScript typecheck\n        run: npx tsc --noEmit\n\n      - name: Production build'),
    ], "CI explicit typecheck")))

    staged_files.append((ROOT / ".github/workflows/deploy-staging.yml", *patch(ROOT / ".github/workflows/deploy-staging.yml", [
        ('          E2E_TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}\n        run: npx playwright test',
         '          E2E_TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}\n'
         '          FOCUS_V2_EXPECT_ENABLED: ${{ vars.FOCUS_V2_EXPECT_ENABLED }}\n'
         '        run: npx playwright test'),
    ], "Staging V2 E2E enablement")))

    # All anchors verified before any existing file is modified.
    for path, original, updated in staged_files:
        if updated == original:
            print(f"already applied: {path.relative_to(ROOT)}")
            continue
        path.write_text(updated, encoding="utf-8")
        print(f"patched: {path.relative_to(ROOT)}")

    print("Phase 9 web hardening installed. Migration still requires CLI-generated filename.")


if __name__ == "__main__":
    main()
