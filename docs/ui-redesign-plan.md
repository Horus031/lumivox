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
- [x] 7. Focus, Roadmaps, Rooms/Groups and form-heavy screens.
- [ ] 8. Admin and remaining secondary pages; remove remaining hard-coded
  visual values as each screen is migrated.

Deliver one phase at a time. Record implementation and verification here.
Do not migrate unrelated screens while working on a foundation phase.

### Phase 7 Deliveries

- [x] 7a. Focus.
- [x] 7b. Roadmaps.
- [x] 7c. Rooms/Groups.
- [x] 7d. Remaining form-heavy screens.

### Phase 7d Deliveries

- [x] 7d.1. Goal/Task create-edit forms and Task Details shell/overview.
- [x] 7d.2. Task subtabs (Subtasks/Review) and document forms/screens.
- [x] 7d.3. Settings and onboarding forms.

Keep phase 7d open until all three deliveries are complete.

### Phase 8 Deliveries

- [x] 8a. Admin navigation, overview and shared metric cards.
- [x] 8b. Admin Users/Documents lists, filters and detail screens.
- [x] 8c. Admin Groups and CMS Settings.
- [ ] 8d. Admin monitoring: AI/RAG, Roadmaps, Translations and Native Task Risk.
- [ ] 8e. Remaining learning pages: Leaderboard, Reflections and shared loading/error states.
- [ ] 8f. Auth and public secondary-page audit/migration, followed by final consistency QA.

Keep phase 8 open until all deliveries are complete. Large deliveries may be
split into smaller scoped parts; do not migrate all Admin screens in one turn.

### Phase 8d Deliveries

- [x] 8d.1. AI/RAG monitoring and session details.
- [x] 8d.2. Roadmap and Translation monitoring.
- [ ] 8d.3. Native Task Risk monitoring and prediction details.

Keep 8d open until all three monitoring deliveries are complete.

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

## Phase 7d.1: Goal/Task Forms

- Goal create/edit uses a compact responsive dialog, two-column desktop field
  layout, shared controls and associated unique labels. Description uses three
  rows; title/description limits match server schemas. Pending fields disable.
  Existing goal types, editable statuses, date payloads and reset behavior remain.
- The legacy CreateGoalModal now delegates to the existing CreateGoalForm instead
  of nesting a second dialog/content inside a trigger.
- Task creation/editing uses consistent spacing, three-row descriptions, labels,
  token-sized selects and disabled pending controls. The unassigned-goal default
  is displayed correctly while still submitting an empty goal id. Task status
  remains outside metadata editing, including expectedStatus/expectedUpdatedAt
  optimistic guards. Blank estimates and absent due dates retain their semantics.
- Goal/Task date pickers use unique trigger/time ids, localized date/month labels
  and bounded popovers. Date/time controls stack on narrow screens; the existing
  date selection, optional clearing and local-date/ISO serialization are retained.
- TaskModalShell now uses the existing Radix Dialog for focus trapping, nested
  popover dismissal and scroll locking. Center dialogs use 8px radius; details
  use a 576px desktop side drawer and full-width mobile drawer with fixed header
  and footer. Scrollable content fits short viewports. Close controls have hover
  titles, accessible names and token-sized targets. Focus returns to the opener.
- Task overview metadata is a flat definition list, with divided notes/system
  fields, localized dates, compact badges and line tabs. The redundant read-only
  overview hides while editing. Existing detail fetches, tab routing, deletion
  confirmation and child-panel callbacks remain. Shared badge tones now use
  semantic tokens for readable labels in both themes, also benefiting subtasks.
- Added the missing Task saving translation in English/Vietnamese. No backend,
  query, status-transition rule, database or authentication changes are included.
  Subtasks/Review/document panel interiors remain for 7d.2.

### Verification

- ESLint, TypeScript and diff checks passed.
- Thirty-four targeted unit tests passed across the new Goal/Task form tests,
  existing Workspace tests and token merging. Seven new tests cover task status
  guards, locked goal linkage, optional estimates, date/time combination/clearing,
  rejected saves, unassigned creation, goal creation and goal edit status/dates.
- Browser fixture used real forms, shell, overview, Radix selects/dialogs/popovers
  and react-day-picker. Action/router responses and the three drawer child panels
  used controlled adapters. Checks passed at 1440/1024/768 x 900, 390 x 844 and
  320 x 640 in light/dark: create/edit payloads, calendar dates/time, rejected save
  recovery, tab navigation, drawer sizing, internal scrolling, dialog/page bounds,
  focus trap/restoration, nested Escape dismissal and confirmed task deletion.
- Reviewed desktop creation/drawer, mobile goal edit, and 320px task/calendar
  screenshots. Fixture uses a sans-serif fallback; production font rendering and
  child-panel workflows were not verified in this fixture.
- The existing localhost:3000 server redirects unauthenticated Workspace requests
  to a working Vietnamese login page (200). Authenticated persistence was not
  exercised and no real goals/tasks were created, updated or deleted.

Next delivery: phase 7d.2, Task subtabs and document forms/screens only.

## Phase 7d.2: Task Subtabs And Documents

- Subtasks use divided rows, compact semantic badges, wrapping titles and icon
  actions. Creation stacks on narrow screens. Existing parent-state creation
  restrictions, normalization, transition guards, confirmations and scoped
  metadata editing are retained.
- Review states, assessment summaries, feedback and question rows are unframed
  or divided instead of large rounded cards. Flashcards remain a genuine framed
  tool with 8px radius and a stable 208px height; long content scrolls internally.
  Navigation/reset controls have accessible names and hover titles, and the flip
  control exposes its side and content. Selection, wraparound and reset remain.
- Quiz questions use named fieldsets, radio/checkbox options with selected states
  and readable wrapping. Answer indices, ordering, all-answered gating, attempt
  identity, generation rules, locale, threshold and polling are preserved.
  No grading/model logic or task-status rules are changed.
- Task/Goal document upload forms use shared file controls, pending states and
  scoped hidden identifiers. Goal uploads now require a file, matching the existing
  action contract. Accepted file types remain unchanged. Lists use flat divided
  rows, consistent process/preview/share/delete buttons and wrapping file names.
- Sharing and shared-preview pages use PageHeader and unframed sections. Access
  mode, email/role form, user permissions and copy controls use compact tokens
  and English/Vietnamese labels. Viewer/editor and private/shared/public payloads
  and owner/access query boundaries remain unchanged.
- Copied document links include the locale, hydrate consistently and report
  clipboard failures. Permission identities wrap on narrow screens; removal keeps
  its existing action. Links do not bypass access permissions.
- Text previews remain escaped and scrollable. Image previews now have a bounded
  container and valid Next Image fill/sizes properties; signed images bypass the
  optimization loader. PDF/Office iframe source construction is retained. Original
  file links use shared controls and safe external-link attributes.
- No backend actions, database, storage policy, permission rule, signed-URL query,
  extraction pipeline or AI generation changes are included. Settings/onboarding
  remain outside this delivery.

### Verification

- ESLint, TypeScript and diff checks passed.
- Fifty-five targeted unit tests passed across new Review/document tests, previous
  Goal/Task form tests, Workspace tests and token merging. Twenty-one new cases
  cover quiz gating/payloads/failure retention, flashcard controls, subtask creation
  restrictions/transitions, sharing defaults, clipboard failure, feedback, wrapping
  permission identities, text/image/PDF/Office preview markup, review-generation
  restrictions and request locale/threshold/identity.
- Browser fixture used actual Task drawer/subtabs, review components, document
  forms/list components and preview output with compiled CSS, Radix controls and
  controlled action/router/translation adapters. Checks passed at 1440/1024/768
  x 900, 390 x 844 and 320 x 640 in light/dark: subtask creation/transition/delete,
  scoped Task/Goal uploads, processing/deletion, review generation/submission,
  failure recovery, sorted answers, stable flashcard dimensions, copy, visibility,
  editor-role sharing, access removal, text escaping, image loading and absence
  of page/dialog overflow or runtime errors. Mobile screenshots were rechecked
  after fixing long file names and permission emails.
- Reviewed desktop sharing/review and mobile sharing, Task documents, flashcards
  and image preview screenshots. Fixtures use a sans-serif fallback, a Next Image
  adapter and an existing local image asset. Native PDF/Office viewer rendering
  and the complete authenticated RSC page/query composition were not exercised.
- The existing localhost:3000 server redirects unauthenticated Workspace requests
  to the Vietnamese login page (200). Real storage uploads, persistence, access
  enforcement, extraction and AI requests were not exercised; no production
  documents, permissions, tasks or assessments were changed.

Next delivery: phase 7d.3, Settings and onboarding forms only.

## Phase 7d.3: Settings And Onboarding

- Settings and onboarding share profile/PBI fields and initialization. Flat
  sections and divided weight rows replace oversized nested cards. Typography,
  spacing, input dimensions and submit controls use existing compact tokens.
- Profile names retain required/max-length semantics and autocomplete. Timezone
  choices preserve a saved timezone outside the common list. Reset only changes
  weights, not the profile. Totals use locale formatting and semantic feedback.
- Client validation rejects non-finite/out-of-range weights and preserves the
  server's total tolerance. Pending fieldsets disable edits and duplicate submits;
  rejected saves retain input. Existing eight-field payloads, Settings refresh,
  server onboarding redirect and backend validation are unchanged.
- Theme choices use named native radios, visible mobile labels, consistent touch
  targets and focus states. Selected hover retains readable contrast. Real
  next-themes preference storage and system-following behavior are retained.
- The unlocalized onboarding route gets an Intl provider using the validated
  NEXT_LOCALE cookie or routing default. English/Vietnamese headings and submit
  states are translated. PageHeader, bounded content and loading dimensions are
  consistent with the migrated pages. Auth guards and metadata remain unchanged.
- No backend actions, database, authentication, routing rules or PBI calculation
  changes are included. Phase 7 is complete; Admin is outside this delivery.

### Verification

- ESLint, TypeScript and diff checks passed. Fourteen targeted unit tests passed
  across profile calibration and token merging, covering shared payloads, total
  tolerance, invalid numbers, reset, saved timezone, failure retention and theme
  labels. Server schema agreement is checked for default values and tolerance.
- Browser fixture used actual forms, Radix Select, Intl and next-themes with
  compiled CSS. Checks passed at 1440/1024/768 x 900, 390 x 844 and 320 x 640 in
  light/dark and English/Vietnamese: reset, invalid totals, timezone selection,
  payloads, rejected-save recovery, theme storage/system changes, radio keyboard
  navigation and no horizontal overflow/runtime errors. Action/router responses
  are controlled adapters, not real authenticated requests.
- Reviewed desktop Settings and 320px dark onboarding screenshots; corrected
  selected-theme hover contrast and reran the matrix. Fixture uses a sans-serif
  fallback; production font rendering and full authenticated RSC composition
  were not exercised.
- Existing localhost:3000 Settings/onboarding routes redirect unauthenticated
  visitors to working login pages (200). Real profile persistence and successful
  server onboarding redirect were not exercised; no user records were changed.

Next delivery: phase 8, Admin and remaining secondary pages.

## Phase 8a: Admin Navigation And Overview

- Admin navigation uses real page links with aria-current instead of panel-tab
  semantics. All nine destinations and locale-aware routing are retained, with
  compact English/Vietnamese labels including the previously missing risk label.
  Longest matching route remains active for details and nested translation pages.
- Navigation is a flat, horizontally scrollable row with 36px desktop / 44px
  mobile targets. The current link scrolls into the row's visible area without
  moving the page. Sticky placement uses the 56px topbar token at every width;
  extra inset padding, blur and oversized floating tab containers are removed.
- Overview uses PageHeader and an unframed metric grid. Shared AdminMetricCard
  uses 8px radius, 16px padding, label/caption/metric tokens and wrapping numbers.
  Existing metric consumers in monitoring pages inherit this compact primitive;
  their grids, queries and other content are not migrated in this delivery.
- Recent users use a section heading, compact semantic table, neutral dividers,
  role badges and localized detail links. The bounded table scroll region has a
  name, keyboard focus, caption and scoped column headers. Empty state, display
  name precedence, visibility, timestamps and null-date fallback are retained.
- No query, action, auth/permission rule, database or monitoring-engine changes
  are included. Phase 8 remains open; management/monitoring interiors are pending.

### Verification

- ESLint, TypeScript and diff checks passed. Fourteen targeted tests passed:
  eleven new Admin cases and three token-merging cases. Coverage includes nine
  navigation links, current nested/detail routes in both locales, all ten metrics,
  query calls, localized number/null fallback, table identity/role/visibility,
  accessible scroll region, detail links and empty state.
- Browser fixture rendered actual Admin layout/overview/components and compiled
  CSS, with controlled read-only query, navigation and server-translation adapters.
  Checks passed at 1440/1024/768 x 900, 390 x 844 and 320 x 640 in light/dark and
  English/Vietnamese: active-link visibility, link keyboard activation, table
  keyboard scrolling, sticky offset, metric bounds, empty state and no page
  overflow/runtime errors. Reviewed desktop and 320px dark screenshots.
- Fixture uses a sans-serif fallback and a simplified shell topbar/sidebar inset;
  production font rendering, actual Admin queries and complete authenticated
  RSC/shell composition were not exercised. No real user records were modified.
- Existing localhost:3000 Admin routes in both locales redirect unauthenticated
  visitors to working localized login pages (200); authenticated access was not
  exercised.

Next delivery: phase 8b, Admin Users/Documents lists, filters and detail screens.

## Phase 8b: Admin Users And Documents

- Both lists and details use PageHeader, compact tokens and unframed sections.
  Detail pages include locale-aware back-to-list links. User detail keeps eight
  activity metrics and flattens its timeline; document detail presents all eight
  metadata values in a definition list instead of oversized metric cards.
- Search controls have associated labels and icon submit buttons. Document query,
  status and submit stack on narrow screens and align on desktop. Existing query
  trimming, URLSearchParams encoding, all-status omission and query arguments are
  retained. Status/role menu headings are localized.
- User/Document tables share a bounded, keyboard-focusable table section with a
  named region, caption and scoped column headers. Dense rows use compact text,
  neutral dividers, locale-aware detail links, wrapping names/emails, semantic
  status badges and named icon actions. Long MIME values truncate only in lists
  with a full-value tooltip; detail metadata retains the full string. Table minimum
  widths allow internal scrolling instead of page overflow.
- Role controls have readable widths and per-user accessible names. Leaderboard
  visibility uses the shared checkbox with a 44px mobile label target instead of
  text-input styling. Existing role/visibility payloads, controlled server values,
  toast feedback and refresh-on-success/failure remain. Pending changes disable
  controls; redundant/pending changes are guarded.
- Document process/reprocess keeps document/owner identity, status-dependent
  labels, processing restriction, failure feedback and refresh. List actions use
  named icons; detail actions keep text labels. Delete retains native confirmation,
  document/file-path payload, failure retention and success-only list navigation.
- Chunk disclosure remains native details/summary, now divided rather than nested
  cards. Preview/chunk text stays escaped, wraps long tokens and scrolls internally
  when long. Chunk identity/order, embedding metadata/fallbacks and raw status
  output remain unchanged.
- No backend action/query, permission, auth, storage, extraction, embedding or AI
  engine changes are included. Groups, CMS Settings and monitoring remain pending.

### Verification

- ESLint, TypeScript and diff checks passed. Thirty-three targeted tests passed:
  nineteen new management cases, eleven prior Admin overview cases and three
  token-merging cases. Coverage includes URL filters/encoding, scoped mutation
  payloads, pending role save, success/failure feedback and refresh, processing
  guard, canceled/confirmed deletion, localized links/table semantics, empty
  states, escaped content, detail queries/metadata and not-found behavior.
- Unit tests use a controlled select adapter; browser checks use actual Radix
  Select/Checkbox, actual four pages/components and compiled CSS with controlled
  query/action/router/server-translation adapters. Checks passed at 1440/1024/768
  x 900, 390 x 844 and 320 x 640 in light/dark and English/Vietnamese: filters,
  role/visibility saves and failure recovery, processing guard, delete confirmation
  and payload, detail/back navigation, native chunk keyboard disclosure, table
  keyboard scrolling, control alignment and no page overflow/runtime errors.
- Reviewed desktop Users/Documents and document detail, plus 320px dark document
  detail screenshots. Corrected filter alignment, long MIME row height and status
  label contrast, then reran browser checks. Fixtures use a sans-serif fallback
  and simplified shell insets; production font rendering and full authenticated
  RSC composition were not exercised.
- Existing localhost:3000 Users/Documents routes redirect unauthenticated visitors
  to working Vietnamese login pages (200). Real admin permissions, persistence,
  storage deletion and reprocessing were not exercised; no user roles, visibility
  settings, documents or chunks were changed in a real database.

Next delivery: phase 8c, Admin Groups and CMS Settings.

## Phase 8c: Admin Groups And CMS Settings

- Groups list/detail and CMS Settings use PageHeader and unframed sections.
  Group metadata keeps all six values in a flat definition list. Description,
  owner identity and saved admin note wrap naturally; detail has a localized
  back-to-list link. No query/filter or not-found contract changes are included.
- Groups reuse the bounded Admin table section, compact semantic badges,
  wrapping identities and named icon actions. Search query/status controls align
  on desktop and stack on mobile with associated labels and localized menus.
  Existing trimming, URLSearchParams encoding and all-status omission remain.
- Archive/restore controls keep native confirmation, group identity, archived
  polarity, note payload, failure retention and success-only refresh. Note has
  an associated label, existing action's 500-character limit and pending disable.
  List controls fit inline with icon tooltips; detail retains full labels.
- Members/messages are divided rows, not nested cards. Members now have an
  explicit empty state. Name precedence, identity fallbacks, role/membership
  labels and message timestamps remain. Messages stay escaped, wrap long tokens
  and scroll internally; named delete icons retain confirmation, group/message
  payloads, failure feedback and success-only refresh.
- CMS uses three unframed sections, shared checkboxes with named/described 44px
  label targets, associated select/number labels and localized option headings.
  All seven setting keys, default values, top-k choices 3/5/7, prompt choices,
  immediate per-control save and success/failure refresh/toasts are retained.
- Numeric targets keep blur-save and the original native min=0 / step=1 behavior.
  Empty/non-finite/invalid drafts do not submit or become zero; unchanged blur is
  skipped. Failed saves restore the persisted value; server value updates refresh
  the displayed draft. A pending fieldset disables other edits/duplicate saves.
- Backend actions/queries, RPCs, permissions, auth, feature interpretation, RAG
  engine and database schema are unchanged. No real settings were updated.

### Verification

- ESLint, TypeScript and diff checks passed. Fifty-eight targeted tests passed:
  twenty-five new Groups/CMS cases, thirty prior Admin cases and three token
  cases. Coverage includes filter URLs, canceled/confirmed archive/restore/delete,
  note identity/retention/limit, pending controls, success-only moderation refresh,
  localized links/table semantics, empty collections, escaped messages, detail
  queries/not-found, all seven setting payloads/defaults, invalid/zero/unchanged
  numeric blur, failure rollback and prop-driven numeric refresh.
- Unit tests use a select adapter; browser fixture uses actual Radix controls,
  actual three pages/components and compiled CSS with controlled query/action/
  router/server-translation adapters. Checks passed at 1440/1024/768 x 900,
  390 x 844 and 320 x 640 in light/dark and English/Vietnamese: aligned filters,
  scoped moderation payloads/confirmations/failure recovery, table keyboard scroll,
  detail/back links, empty states, all seven final CMS values, numeric rollback,
  escaped content and no horizontal page overflow/runtime errors.
- Reviewed desktop Groups/detail/Settings and 320px dark detail/Settings images.
  Reduced list row height with inline archive controls and reran the matrix.
  Fixture waits for aria-busy=false before asserting persisted CMS values.
  It uses a sans-serif fallback and simplified shell insets; production fonts
  and complete authenticated RSC/shell composition were not exercised.
- Existing localhost:3000 Groups/Settings requests redirect unauthenticated
  visitors to working Vietnamese login pages (200). Real permission enforcement,
  group moderation, database persistence and operational flag behavior were not
  exercised; no real groups, messages or CMS settings were modified.

Next delivery: phase 8d.1, AI/RAG monitoring and session details only.

## Phase 8d.1: AI/RAG Monitoring And Session Details

- Monitoring uses PageHeader, compact metric grid and labeled query/mode controls.
  Twelve metric items, values, descriptions, latency/null fallbacks and top-k
  counts remain. Top-k usage is three compact definition rows, not a hero-sized
  concatenated string, keeping long counts readable without splitting digits.
- Session list reuses the bounded Admin table section with scoped headers,
  caption and keyboard-focusable scroll region. Context badges use semantic
  tokens; user identities wrap, dates retain their existing updated/created
  fallback and named icon links retain locale-aware session destinations.
- Query trimming, URLSearchParams encoding, all-mode omission, query arguments
  and all monitoring reads are unchanged. Context-mode menu heading is localized.
- Session detail uses PageHeader and seven unframed metadata values, retaining
  selected-document count/IDs, top-k, prompt variant, message count, dates and
  null fallbacks. A localized back-to-list link is added. Selected IDs remain
  read-only, with wrapping rather than oversized pills.
- Conversation uses divided articles, role headings, timestamps and compact
  metadata instead of nested cards/badge strips. Original message order/content
  and role labels remain. Long text has a named keyboard-focusable scroll region.
  Source disclosure remains native details/summary and retains the assistant +
  truthy-sources condition, including empty arrays/objects. JSON.stringify output
  remains escaped and uses a bounded keyboard-scrollable neutral pre region.
- Empty-source answers use divided rows, wrapping owner/metadata, a restrained
  warning marker, clamped escaped preview and named session-review icon link.
  Empty-state handling and original review destinations/fallbacks remain.
- No backend query/action, database, authorization, retrieval, prompt, source
  selection, AI generation or monitoring calculation changes are included.
  Roadmap/Translation and Native Task Risk monitoring remain pending; 8d is open.

### Verification

- ESLint, TypeScript and diff checks passed. Seventy-three targeted tests passed:
  fifteen new AI/RAG cases, fifty-five prior Admin cases and three token cases.
  Coverage includes encoded filters, twelve metric/null states, all three top-k
  counts, localized table/link semantics, date/user fallbacks, escaped message/JSON
  content, source-visibility guards, empty collections, selected IDs, query calls,
  detail metadata, back link and not-found behavior.
- Unit tests use a select adapter; browser fixture uses actual Radix Select,
  actual two pages/components and compiled CSS with controlled read-only query,
  router and server-translation adapters. Checks passed at 1440/1024/768 x 900,
  390 x 844 and 320 x 640 in light/dark and English/Vietnamese: aligned filters
  and query reads, metric bounds, session/review/back navigation, selected IDs,
  role/source guards, JSON escaping/disclosure, table/content/JSON keyboard scroll,
  empty/null states and no horizontal page overflow/runtime errors.
- Reviewed desktop monitoring and 320px dark session screenshots. Changed top-k
  counts from narrow columns to definition rows after inspecting very large
  values, then reran the matrix. Fixtures use a sans-serif fallback and simplified
  shell insets; production fonts and full authenticated RSC composition were not
  exercised.
- Live localhost:3000 AI monitoring/detail requests returned HTTP 500. Dev logs
  report missing generated .next/dev runtime and routes-manifest artifacts. The
  existing server was not stopped/restarted and its generated files were not
  deleted or repaired in this delivery. Real Admin query/auth flows could not
  be verified; no real conversations, sources or AI requests were modified/run.

Next delivery: phase 8d.2, Roadmap and Translation monitoring only.

## Phase 8d.2: Roadmap And Translation Monitoring

- Both pages use PageHeader, compact metric grids and unframed sections.
  All four Roadmap/five Translation metrics, descriptions and zero fallbacks
  remain; no new calculation or monitoring query is introduced.
- Filters use shared Input/Select/Button primitives with associated labels and
  named search icons. Roadmap status and Translation target-locale/status choices
  are preserved. Translation filters use multiple rows at narrower widths rather
  than compressing three inputs into a small desktop content area. Query trimming,
  URLSearchParams encoding, all-value omission and page query contracts remain.
- Roadmap records are divided rows with compact semantic status badges, normal
  locale/node labels, section-sized titles and wrapping owner/study/AI metadata.
  Original node breakdown, date strings, provider/model and latency fallback are
  retained. No large nested cards or hard-coded neutral theme colors remain in
  this screen's migrated components.
- Archive/restore uses shared named icon buttons with tooltips and pending states.
  Applied roadmaps still expose neither operation. Native confirmations, roadmap
  identity/archived polarity, failure retention and success-only refresh/toasts
  remain; pending clicks are guarded.
- Translation records are divided rows with semantic status badges and wrapping
  locale/entity/owner/provider/date fields. Native details/summary disclosure keeps
  the original text escaped in a named keyboard-scrollable region bounded to
  320px. Error text remains escaped and uses a restrained danger border instead
  of another card; original error visibility and record identity are retained.
- Delete and clear-entity-cache remain distinct actions with named icon controls.
  Each retains its confirmation, scoped translation or entity type/id payload,
  pending disable, failure feedback and success-only refresh. Translation target
  locale remains independent of the current interface locale.
- Backend actions/queries, authorization, database/cache rules, AI generation and
  translation semantics are unchanged. Native Task Risk is outside this delivery;
  phase 8d remains open.

### Verification

- ESLint, TypeScript and diff checks passed. Ninety-five targeted tests passed:
  twenty-two new monitoring cases, seventy prior Admin cases and three token
  cases. Coverage includes filter encoding/omission, applied-roadmap restriction,
  archive/restore/delete/clear confirmations and scoped payloads, pending duplicate
  prevention, failure recovery/success-only refresh, metric/null/empty states,
  locale labels, metadata fallbacks, escaped translation/errors, disclosure region
  identity and both page query contracts.
- Unit tests use a select adapter; browser checks use actual Radix Select,
  both actual pages/components and compiled CSS with controlled query/action/
  router/server-translation adapters. Checks passed at 1440/1024/768 x 900,
  390 x 844 and 320 x 640 in light/dark and English/Vietnamese: filter/query reads,
  control alignment, mutation confirmations/guards/payloads/failure recovery,
  metrics and null/empty states, escaped content, native keyboard disclosure,
  translated-text keyboard scroll and no horizontal page overflow/runtime errors.
- Reviewed desktop and 320px dark Roadmap/Translation screenshots. Fixtures use a
  sans-serif fallback and simplified shell insets; production font rendering and
  full authenticated RSC composition were not exercised.
- Live localhost:3000 Roadmaps/Translations requests returned HTTP 500. Current
  dev logs report Turbopack failing to restore cache data because a referenced SST
  file under .next/dev/cache/turbopack is missing. The existing server/cache was
  not stopped, deleted or repaired. Real Admin persistence and cache invalidation
  were not exercised; no real roadmaps/translations/cache entries were modified.

Next delivery: phase 8d.3, Native Task Risk monitoring and prediction details.
