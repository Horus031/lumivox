# Lumivox UI Redesign

Direction: compact, modern operational UI inspired by shadcn/ui. Keep the
Lumivox green accent and Plus Jakarta Sans (including Vietnamese support),
with neutral surfaces, clear hierarchy, restrained borders and shadows.

## Phase Tracking

- [x] 1. Foundation tokens: colors, typography, radius, spacing, elevation.
- [x] 2. Core primitives: button, card, input, select, tabs, badge, form states.
- [ ] 3. App shell: desktop sidebar, topbar, mobile header and bottom nav.
- [ ] 4. PageHeader: consistent title, description and action alignment.
- [ ] 5. Dashboard: summary metrics, charts and information hierarchy.
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
