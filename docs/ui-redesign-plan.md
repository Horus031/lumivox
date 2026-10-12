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
- [x] 6. Workspace: goal rail, lanes and task cards. Tasks/goals redirects
  belong to this workflow.
- [ ] 7. Focus, Roadmaps, Rooms/Groups and form-heavy screens.
- [ ] 8. Admin and remaining secondary pages; remove remaining hard-coded
  visual values as each screen is migrated.

Deliver one phase at a time. Record implementation and verification here.
Do not migrate unrelated screens while working on a foundation phase.

### Phase 7 Deliveries

- [x] 7a. Focus.
- [x] 7b. Roadmaps.
- [x] 7c. Rooms/Groups.
- [ ] 7d. Remaining form-heavy screens.

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

## Phase 6: Workspace

- Desktop goal rail is 224px and unframed, with compact navigation, neutral
  selected states, readable progress metadata and accessible progress meters.
  Its divider replaces the large rounded panel.
- Mobile/tablet uses a goal selector for all tasks, unassigned tasks and individual
  goals. The selected goal retains its actions and completion metadata; navigation
  uses the existing locale-aware workspace query route. Desktop keeps the list.
- Six board lanes remain, now 256px wide with simple headings/counts and no
  decorative enclosing cards. Horizontal scrolling stays inside the board,
  which is focusable and labeled for keyboard access. Empty lanes are unframed.
- Task cards use 8px radius and 12px padding. Priority/goal metadata sits below
  the title, away from the drag handle. Long titles wrap/clamp with hover titles;
  date/subtask metadata is only rendered when available.
- Priority badges use semantic tokens with readable text in light/dark. Drag
  and goal-action controls retain 44px mobile touch targets and compact desktop
  sizes. Goal creation/menu icon controls have hover titles.
- Status-transition rules, optimistic updates/rollback, review/deadline-managed
  lanes, goal-scoped quick creation, drawer state and legacy redirects are retained.
  Full drawer/editor redesign remains outside this phase.

### Verification

- ESLint, TypeScript and diff checks passed.
- All 24 existing Workspace unit tests passed: scope/grouping, legacy redirects,
  quick-create scope, optimistic transitions, rollback and details selection.
- Browser fixture used actual goal rail/selector, WorkspaceBoard, lanes/cards,
  Radix controls and dnd-kit. Server actions/router/form/drawer boundaries used
  controlled adapters and sample data. Checks passed at 1440, 1024, 768, 390 and
  320px in light/dark: all six lanes, opening a card, scoped quick-create requests,
  locked review handles, goal selection, keyboard horizontal scrolling, empty
  boards and absence of page-wide overflow/runtime errors. Actual pointer dragging
  from Todo to In Progress passed on desktop in both themes.
- Reviewed settled desktop and mobile screenshots, including long task/goal titles.
  Fixture uses a sans-serif fallback. Live authenticated verification is still
  limited by the existing localhost:3000 server returning HTTP 500; database
  persistence and full drawer/form behavior were not verified in the fixture.

Phase 7 will be delivered separately: 7a Focus, 7b Roadmaps, 7c Rooms/Groups,
then 7d remaining form-heavy screens. Next delivery: Focus only.

## Phase 7a: Focus

- Focus uses a responsive main/history grid. Session controls and the assistant
  are primary; recent sessions sit beside them on wide desktops and below on
  smaller screens. Panels use the established radius, padding and typography.
- Start form uses linked labels, a correctly selected unlinked-task default,
  duration presets with pressed states, a labeled custom duration input and
  native required/integer/1-240 validation. Controls disable while submitting;
  rejected requests retain the form, and thrown errors show localized feedback.
- Active session has one compact toolbar with 44px mobile/36px desktop icon
  targets, accessible names and hover titles. Timer remains visible when compact;
  expanded mode adds elapsed progress without a nested timer card. Collapse is
  linked to its controlled region; timer announcements are off between ticks.
- Existing elapsed/paused-time calculations, pause/resume, completion eligibility,
  cancel confirmation and optimistic completion remain. A thrown completion
  request now resets the optimistic state so the user can retry.
- Recent sessions use divided rows, semantic badges and readable metadata rather
  than nested framed items, tiny text and hard-coded neutral colors.
- Shared study assistant accepts className and an opt-in compact appearance used
  by Focus. Compact mode reduces empty/chat height and display text, and aligns
  composer controls with tokens. Other consumers keep the default appearance;
  question payloads, sources, document selection and conversation logic are intact.

### Verification

- ESLint, TypeScript and diff checks passed.
- 17 targeted unit tests passed across Focus UI, Workspace controller and token
  merging. Six new Focus tests cover countdown, paused clock, expired duration,
  expansion/progress, completion failures (including thrown requests), presets
  and unlinked-task creation payloads.
- Browser fixture used actual Focus form, timer, history and assistant with mock
  server actions/router responses. Checks passed at 1440, 1024, 768, 390 and 320px
  in light/dark: invalid duration blocking, custom duration/task linkage, timer
  ticking, pause/resume, failure recovery, chat focus-session scope, collapse,
  cancellation, empty history, touch targets and text/page overflow. Reviewed
  desktop start and mobile active screenshots; fixture uses a sans-serif fallback.
- Live application still returns HTTP 500 from the existing dev server. Database
  persistence and real model/document retrieval were not exercised by the fixture.

Next delivery: phase 7b, Roadmaps only.

## Phase 7b: Roadmaps

- List, creation and detail pages use shared PageHeader, compact typography,
  semantic tokens and shared controls. Repeated list items retain one frame;
  metadata and tree previews use flat divided rows instead of nested cards.
- Generation form has three separated sections with consistent labels, inputs,
  native selects and weekday pressed states. Existing generation fields and
  payload are preserved. Controls disable while pending; thrown requests show
  localized feedback without clearing the entered values.
- Detail actions follow roadmap status: drafts offer edit/apply, applied roadmaps
  link to goals. Confirmation and existing apply behavior remain unchanged.
- Visual editor uses 240px nodes, a smaller responsive canvas and an unframed
  node panel. Header actions use icons with accessible names; canvas controls
  have 36px desktop/44px mobile targets. Minimap is hidden on small screens;
  reduced minimum zoom allows fitting the tree on narrow viewports.
- Real XYFlow selection, dragging, connections, auto-layout, child creation,
  deletion and saved node payloads are retained. Adding a child refits the view.
  Node action buttons do not start dragging. Canvas theme overrides are scoped
  to Roadmaps, leaving other graph consumers unchanged.
- Main page, form, metadata, node and action labels now use English/Vietnamese
  messages. Existing server-provided feedback is not rewritten in this phase.

### Verification

- ESLint, TypeScript and diff checks passed.
- Seven targeted unit tests passed across roadmap presentation and token merging.
  Four new roadmap tests cover status-specific actions, localized list metadata,
  flat tree order and empty-state creation links.
- Browser fixture exercised actual components and XYFlow at 1440, 1024, 768,
  390 and 320px in light/dark. Checks cover custom-level generation payloads,
  node selection/edit/save, child relationships, auto-layout, apply confirmation,
  applied-state navigation, empty lists, canvas control sizes and editor overflow.
  Actual pointer node dragging passed on desktop in both themes. Reviewed desktop
  dark editor and mobile light form/editor screenshots.
- Fixture uses mock server actions/router and a sans-serif fallback; no real
  database writes or model calls were made. The existing localhost:3000 server
  now redirects unauthenticated Roadmaps requests to a working login page (200).
  Full authenticated application verification remains pending.

Next delivery: phase 7c, Rooms/Groups only.

## Phase 7c: Rooms/Groups

- Rooms and Groups use shared PageHeader, section-sized headings, semantic
  colors and compact repeated cards. Group creation moves to a header dialog;
  list sections are no longer enclosing cards. Room tabs use a locally scrollable
  line treatment; empty lists have simple dividers rather than nested frames.
- Room detail uses a responsive presence/chat grid instead of a fixed horizontal
  flex row. Room metadata in the details dialog is unframed; private invite codes
  remain restricted to owners. Group detail retains management/leaderboard gates
  and existing Suspense/query boundaries, with compact challenge and member areas.
- Presence and member lists use divided rows, readable identity wrapping and
  semantic connection/status colors in both themes. Presence status controls
  expose their selected state and disable before connection. Re-subscription
  resets the selected status to match the existing available tracking payload.
- Both chats have one bounded, scrollable tool surface, compact message bubbles,
  wrapping long content, named composers and icon send controls with hover titles.
  Pending composers disable; existing room Enter/Shift+Enter behavior, group
  broadcasts, message deduplication and room-leave events are retained.
- Creation dialogs use associated labels, native validation matching server
  limits, disabled pending fields and scrollable mobile content. Cancel controls
  do not submit forms. The duplicate group description input bound to the title
  is removed; the actual description textarea keeps its independent payload.
- Invite/challenge forms use shared controls and flatter layouts. Challenge
  meters are named and bounded for assistive technology. Leaderboard retains
  rank, identity, role, focus, tasks and score in a focusable local scroll region.
- Voice UI uses flat sections and shared controls. LiveKit font, control colors
  and sizes inherit tokens through scoped overrides, without changing credentials,
  token requests, audio connection options or other LiveKit consumers.
- No database, RLS, authentication, realtime subscription protocol, backend action
  or admin screen changes are included.

### Verification

- ESLint, TypeScript and diff checks passed.
- Fifteen targeted unit tests passed across social-study presentation, existing
  room/chat schemas and token merging. Six new tests cover deduplicated room
  navigation, bounded challenge meters, leaderboard scrolling, member metadata,
  independent group name/description payloads and rejected-creation recovery.
- Browser fixture used real UI components, Radix dialogs/tabs and compiled global
  CSS with mock actions/router/realtime and a LiveKit UI adapter. Checks passed at
  1440, 1024, 768, 390 and 320px in light/dark: room/group creation, public/code
  joining, confirmed leaving, presence status/broadcast payloads, room-message
  deduplication, group chat/broadcast, invite/challenge payloads, voice UI joining,
  microphone toggle/leaving, empty states and absence of page-wide overflow or
  runtime errors. Dialog close controls use 36px desktop/44px mobile targets.
- Reviewed desktop dark group, mobile dark room and 320px light creation-dialog
  screenshots. Fixture accounts for shell padding/sidebar and uses a sans-serif
  fallback. It does not verify the full RSC detail-dialog/query composition.
- The existing localhost:3000 server redirects unauthenticated Rooms requests
  to the Vietnamese login page (200). Authenticated persistence, multi-client
  Supabase realtime, actual LiveKit audio and microphone permissions were not
  exercised; no real rooms/groups/messages were created.

Next delivery: phase 7d, remaining form-heavy screens only.
