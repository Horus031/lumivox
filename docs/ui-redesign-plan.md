# Lumivox UI Redesign

Direction: compact, modern operational UI inspired by shadcn/ui. Keep the
Lumivox green accent and Plus Jakarta Sans (including Vietnamese support),
with neutral surfaces, clear hierarchy, restrained borders and shadows.

## Phase Tracking

- [x] 1. Foundation tokens: colors, typography, radius, spacing, elevation.
- [x] 2. Core primitives: button, card, input, select, tabs, badge, form states.
- [x] 3. App shell: desktop sidebar, topbar, mobile header and bottom nav.
- [x] 4. PageHeader: consistent title, description and action alignment.
- [x] 5. Dashboard: summary metrics, charts and information hierarchy.
- [ ] 6. Workspace: goal rail, lanes and task cards. Tasks/goals redirects
  belong to this workflow.
- [ ] 7. Focus, Roadmaps, Rooms/Groups and form-heavy screens.
- [ ] 8. Admin and remaining secondary pages; remove remaining hard-coded
  visual values as each screen is migrated.

Deliver one phase at a time. Record implementation and verification here.
Do not migrate unrelated screens while working on a foundation phase.

## Phase 1: Token Contract

Source of truth: `apps/web/app/globals.css`, using Tailwind v4 `@theme inline`.
Retain existing semantic color names and the 4px default spacing scale.

| Role | Value | Utility example |
| --- | --- | --- |
| Caption | 12px / 16px | `text-caption` |
| Label / navigation | 13px / 18px | `text-label` |
| Body / description | 14px / 22px | `text-body` |
| Section title | 16px / 24px | `text-section` |
| Page title | 24px / 32px | `text-page` |
| Metric | 28px / 34px | `text-metric` |
| Small / default / large control | 32 / 36 / 40px | `h-control` |
| Minimum mobile touch target | 44px | `min-h-touch min-w-touch` |
| Card padding | 16px | `p-card` |
| Section gap / page padding | 24px | `gap-section`, `p-page` |
| Expanded sidebar / topbar | 240 / 56px | `w-sidebar`, `h-topbar` |
| Small / default / large icon | 14 / 16 / 20px | `size-icon` |
| Small / medium / large radius | 4 / 6 / 8px | `rounded-sm/md/lg` |
| Overlay radius | 10px | `rounded-xl` |
| Compatibility radii | 14 / 18px | `rounded-2xl/3xl` |

Sizes are expressed in rem and do not scale with viewport width. Preserve
normal tracking. Prefer weights 400 for body, 500 for labels, 600 for titles.
Keep existing display typography until its page is migrated.

Use `text-foreground` for primary text, `text-secondary-text` for descriptions,
and `text-muted-foreground` for metadata. Muted text is readable content, not
a disabled-state color. Use opacity on the control for disabled states.
Primary button text uses `text-primary-foreground` in both themes.

Use neutral background/surface/elevated/border layers. Green identifies brand
and primary actions; success/warning/danger/info retain separate semantic
colors. Keep chart tokens in HSL channel format because Recharts consumers
use `hsl(var(--chart-*))`.

Use borders for ordinary panels, `shadow-sm` sparingly for cards, and
`shadow-md/lg` for floating overlays. Reserve `rounded-full` for avatars,
circles and status dots. Normal application cards target `rounded-lg` (8px).

Existing semantic color, named radius and shadow utilities now pick up the
foundation changes. Role-based typography and spacing are available for
subsequent phases. Arbitrary radii/shadows and component padding overrides
still need migration in their owning phase.

### Verification

- Tailwind/PostCSS compiled the full stylesheet successfully.
- `git diff --check` passed.
- Sampled normal-text contrast: light muted on canvas 4.78:1, light muted
  on card 5.08:1, dark muted on elevated 6.01:1, dark primary button 5.62:1,
  light primary button 10.60:1. This is not a full accessibility audit.
- An existing Next.js dev server is running at `http://localhost:3000`;
  its root route returned HTTP 200. No additional server was left running.
- Per-page visual QA is pending the component and page migration phases.

## Phase 2: Core Primitives

Updated button, card, input, textarea, select, tabs, badge, label, checkbox
and field primitives. Existing exports, props, variants and Radix behavior
are preserved.

- Desktop controls use 36px default, 32px small and 40px large tokens.
  At widths below 640px, buttons, inputs, select triggers/items and tabs
  use touch-friendly sizing. Checkbox targets still rely on associated labels.
- Inputs and textareas keep 16px text below 768px to avoid mobile input zoom.
- Cards use 8px radius, 16px padding, section-sized titles and no default
  decorative shadow. Footers can wrap actions.
- Primary buttons/badges use primary-foreground. Outline buttons use neutral
  hover surfaces; badges no longer suggest interactivity through hover styles.
- Tabs use neutral selected surfaces in both themes; line tabs use an
  underline. Select no longer forces 44px with an important declaration.
- Form controls share focus, disabled and aria-invalid styling. Callers remain
  responsible for labels, aria-invalid and error-description associations.
- The shared class merger recognizes semantic text/spacing tokens, so caller
  overrides resolve predictably. Added regression tests for this contract.

### Verification

- ESLint passed for changed primitives and utility/test files.
- TypeScript passed with `--noEmit --incremental false`.
- Three targeted test files passed: 14 tests covering token override merging,
  workspace board interactions and the account dropdown.
- Browser fixture rendered actual primitives with the compiled global CSS at
  1440px and 390px in light/dark. Control heights, keyboard tab switching,
  keyboard select changes, horizontal overflow and runtime-error checks passed.
- Reviewed mobile light and desktop dark screenshots. The isolated fixture
  uses a sans-serif fallback because it does not load Next.js font assets;
  full application font/layout checks remain for the screen phases.
- The existing localhost:3000 server currently reports a Turbopack cache error
  involving a missing SST file. This prevented live application verification;
  the independent browser fixture verified the primitive layer instead.

Page-level classes such as `h-11!`, `rounded-xl` and custom padding can still
override these defaults. Migrate them in their owning screen phase.
Next phase: app shell (sidebar, topbar and mobile navigation).

## Phase 3: App Shell

- Desktop sidebar uses the 240px token; the collapsed rail uses a new 64px
  token. Neutral surfaces and a dividing border replace decorative framing.
  Navigation labels use 13px text without descriptions; collapsed links keep
  accessible labels and hover titles.
- The 56px desktop topbar contains the sidebar toggle, compact theme/language
  controls and a smaller single-line account trigger. Main content padding and
  topbar positioning share the sidebar tokens; reduced motion is respected.
- Mobile header uses a 56px bar with the brand, theme, language and account.
  Bottom navigation has four primary destinations and a More menu containing
  Rooms, Groups, Leaderboard and Reflections. All eight routes remain available.
- Mobile labels have English/Vietnamese translations. Nested routes use
  aria-current; secondary destinations highlight More. Bottom navigation and
  page padding account for the device safe area.
- Mobile menu actions keep 44px touch targets. Theme controls have accessible
  labels and localized choices; their loading placeholder preserves space.
- Existing sidebar persistence, account role checks and POST sign-out behavior
  are retained. Engagement fetching/realtime behavior was not changed.

### Verification

- Nine targeted tests passed across shell navigation, account sign-out and
  token class merging. New tests cover nested routes, mobile secondary links
  and restoring/toggling the saved collapsed state.
- ESLint and TypeScript passed.
- An isolated browser fixture used the actual shell components, compiled global
  CSS, Vietnamese labels and controlled routing/server-data adapters. Checks
  passed at 1440, 1024, 768, 390 and 320px in light and dark: sidebar offsets,
  collapse/expand, More navigation, horizontal overflow, unobscured last content
  and runtime errors. Screenshots were reviewed for expanded/collapsed desktop
  and mobile states. Font and engagement data use fixture fallbacks.
- Live application verification is still limited by the existing localhost:3000
  server returning HTTP 500 from its Turbopack cache. An isolated dev-server
  attempt was also refused by Next.js because this checkout already has a server;
  the existing process was left running.

Next phase: PageHeader. Individual page layouts remain for their own phases.

## Phase 4: PageHeader

- Removed card-like framing, ring and shadow. Headers are left-aligned and use
  page-title (24px/32px), body-description (14px/22px) and caption tokens.
- Eyebrow is rendered as an optional, subdued context label. Description and
  action are optional, without empty placeholders.
- The text column and action group wrap according to available container width,
  including the narrower content area beside the desktop sidebar. Long titles
  and unbroken description text can wrap without horizontal overflow.
- Rooms, room details and Reflections now pass their actions to PageHeader
  instead of independently positioning them beside it. Room details use
  DialogTrigger asChild to avoid nested buttons.
- Roadmaps uses the shared Button for its header link and a section-gap token
  between the header and list. Its page content/localization remains for phase 7.

### Verification

- ESLint, TypeScript and diff checks passed.
- Browser fixture rendered the actual PageHeader, Button and Dialog with compiled
  global CSS. Tests passed at 1440, 768, 528, 390 and 320px in light/dark, with
  page padding: 24px titles, optional content, multiple actions, long unbroken
  text, no overlap/overflow, dialog open/close and no runtime errors.
- Reviewed desktop dark and mobile light screenshots. The fixture uses a
  sans-serif fallback; production font and authenticated page verification are
  still limited by the existing dev server returning HTTP 500.

Next phase: Dashboard (summary metrics, charts and information hierarchy).

## Phase 5: Dashboard

- Reordered the dashboard: activity summary, PBI scores/explanation, behaviour
  trend, then history/task status. Mobile follows the same reading order.
  Replaced percentage-based columns and the 672px trend panel with responsive
  grids and 256px chart plotting regions.
- Summary cards use 8px radius, 16px padding, 28px metrics, localized number
  formatting and existing period/context subtitles. Decorative hover movement
  and colored icon blocks are removed; mobile labels have more available space.
- Replaced glowing PBI gauges with two main scores and five comparable meters.
  Snapshot fractions are still converted to percentages; supplied explanations
  take precedence, with the original fallback components and score levels.
  Both standard/personalized scores, period and accessible meter values remain.
- Explanation uses a flat divided insight list with semantic badges. Restored
  the overall summary; removed nested cards, fixed minimum height and wide tracking.
- Charts share typography, surfaces and tooltip styling. Green/blue series are
  distinguishable; the standard PBI series is also dashed. Legend/tooltip text
  remains readable in both themes. Task colors are keyed by status, not order,
  and status labels use the existing locale translations.
- Added localized empty states for activity/task charts. Empty PBI/history states
  use the same panel styling; summary and chart skeletons match the new layout.
  Refresh includes a labeled text action, icon and busy state.
- Independent shared query promises, streaming Suspense boundaries, authentication,
  translation and refresh behavior are preserved. No database/query changes.

### Verification

- ESLint, TypeScript and diff checks passed.
- Nine targeted unit tests passed across PBI scores, shell navigation and token
  merging. New PBI tests cover locale formatting, percentage conversion, fallback
  components, explanation precedence, clamped meter bounds and absent snapshots.
- Browser fixture rendered actual dashboard components with Recharts and compiled
  global CSS. Populated/empty states passed at 1440, 1024, 768, 390 and 320px in
  light/dark. Checks cover nonblank chart paths, tooltips, five meters, fitting
  text, horizontal overflow and runtime errors. Desktop width accounts for the
  sidebar. Reviewed desktop light and mobile dark screenshots.
- Fixture uses sample data and a sans-serif fallback. Live authenticated dashboard
  verification remains limited by the existing dev server returning HTTP 500;
  full Supabase reads/refresh were not exercised by this visual fixture.

Next phase: Workspace (goal rail, lanes and task cards).
