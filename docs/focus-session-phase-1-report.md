# Focus Session 2.0 - Phase 1 evidence

Date: 2026-10-17 (Asia/Bangkok).
Branch: `feature/focus-v2-foundation`.
Base: `48263b7e8fc3122a0b2aea6fc7508c3100827b2a`, matching
`origin/product-release` after fetching origin.

## Changes

- Reused the existing untracked clock utility for UI countdown and backend actual
  minutes. Open pauses freeze focus time; actual minutes are floored and capped.
- All updates filter authenticated ownership and confirm a returned row. Resume,
  Complete and Cancel compare the fetched status, pause total and nullable pause
  timestamp. Zero-row writes return a stale-state failure.
- Create handles PostgreSQL 23505 using the existing unique active-session index.
- Paused Cancel closes the pause without recording it as focus time. Engagement
  is scheduled only after confirmed completion. Its 10-minute rule is unchanged.
- Pause/Resume/Cancel catch rejected promises. Stale writes refresh server state
  with error feedback; ordinary failures do not refresh or show success.
- Added clock/action regression tests, expanded UI tests, and added an opt-in
  PostgREST integration test for RLS, active uniqueness and concurrent updates.

The redesigned UI, accessibility, Start/Recent components, queries, shared types,
schemas and migrations are unchanged. No auto-completion at 00:00 or later-phase
features were added.

## Local verification

Executed from `apps/web`:

| Check | Result |
| --- | --- |
| `npm ci` | PASS after retry outside sandbox for Windows EPERM |
| `npm run test:unit -- features/focus-sessions` | 60 passed; 1 integration test skipped |
| `npm run test:unit` | 331 passed; 1 integration test skipped |
| `tsc --noEmit` | PASS after retry for tsbuildinfo write permission |
| `npm run lint` | PASS |
| `npm run build` | PASS after retry for .next cache permission; 96 static pages |
| `git diff --check` | PASS |

No credentials or environment files were modified or committed.

## Database integration and staging checks still required

Docker engine was not running locally. Dedicated test database credentials were
not configured, so the real PostgREST test was skipped. Mock tests verify action
behavior and filters; they do not prove PostgreSQL concurrency or RLS.

Configure these variables for a disposable local or staging project, never production:

- `FOCUS_TEST_SUPABASE_URL`
- `FOCUS_TEST_SUPABASE_PUBLISHABLE_KEY`
- `FOCUS_TEST_SUPABASE_SECRET_KEY` (server-only admin credential)

Then run from `apps/web`:

```sh
npm run test:unit -- features/focus-sessions/focus-session.integration.test.ts
```

The test creates two temporary users, uses authenticated clients for assertions,
and deletes users in a finally block. Focus fixtures cascade on deletion. The
admin credential is used only for setup/cleanup, not the RLS assertions.

CI and staging deployment were not triggered. Remaining acceptance: branch CI,
real database integration, and staging manual checks with a test account:
Create/Pause/Reload/Resume/Complete, paused Cancel, two competing tabs, Recent
Sessions/Focus History, Tasks, Streak and Rewards. Phase 1 is not marked fully
PASS until these checks succeed.

## Supabase reference

The update return-row pattern follows
[update](https://supabase.com/docs/reference/javascript/update) and
[maybeSingle](https://supabase.com/docs/reference/javascript/maybesingle).
