> Historical setup guide: the Staging observer and bootstrap publication are completed (PRs #144–#146). Do not re-run role creation against the existing Staging role. Current acceptance and next actions are recorded in phase-9-production-release.md.

# Phase 9C — Publish the monitor independently

Prepared from feature commit `855d4b68b2535acee9c8077da565fc6fb9713ff9` against default branch `main` at `a2701edc7ead686c4e1882e380a571dca5007f9a`.

The adjacent `phase-9-monitor-bootstrap.patch` contains exactly four added files:

- `.github/workflows/task-risk-recovery-monitor.yml`
- `scripts/ci/task-risk-monitor.sh`
- `scripts/check-task-risk-recovery-health.mjs`
- `scripts/task-risk-recovery-health.sql`

It contains no application code, migrations, deploy workflow or secrets. It does not enable either monitor variable. It is separate from the later feature PR into `product-release`. The user retains commit, push and merge control.

## Review and publication

Run from the existing repository after reviewing the patch. Use a fresh worktree, preserving the active feature worktree and uncommitted evidence:

```powershell
git fetch origin
git worktree add ../lumivox-monitor-bootstrap -b codex/phase9-monitor-bootstrap origin/main
cd ../lumivox-monitor-bootstrap
git apply --check ../lumivox-task-risk/docs/task-risk-recovery/phase-9-monitor-bootstrap.patch
git apply ../lumivox-task-risk/docs/task-risk-recovery/phase-9-monitor-bootstrap.patch
git diff --stat
git diff --check
```

Commit/push this worktree yourself and open a monitor-only PR to `main`. Review the diff and CI before merging. Confirm `PRODUCTION_CD_ENABLED=false` and that independent Git auto-deploy remains off before publication. Do not merge the complete feature release for this bootstrap.

The patch was verified to reverse-apply against its source commit. Re-run `git apply --check` against the fetched main before use; if it conflicts, review and refresh it instead of forcing application.

## Notification transport acceptance

The user's GitHub settings were inspected while logged in as `Horus031` on 2026-11-18. Actions notifications are already enabled for GitHub and email, failed workflows only. This confirms subscription settings, not actual delivery.

After the monitor workflow is on main, the user should initiate its manual run on `main` with `test_alert=true`. The run deliberately fails without checkout, credentials, database access or deployment. Record the run URL and notification receipt/acknowledgement. It is expected to be red. No such run has been executed yet.

The normal monitor will remain skipped until its repository enable variable is set. Do not label a skipped run healthy.

## Observer setup before enabling the schedule

Use the `staging` environment for Staging; create a distinct `production-monitor` environment for Production. Configure the variables/secrets listed in the Phase 9 evidence. Keep observer credentials separate from deploy credentials.

A dedicated observer needs correct visibility into RLS-protected data and cron metadata. In the local Supabase rehearsal, `cron.job` and `cron.job_run_details` are owned by `supabase_admin` and their RLS policies restrict rows to `username = current_user`. Merely granting SELECT to a new login does not establish visibility into jobs owned by postgres. Before accepting the observer, compare its aggregate snapshot with an administrative read-only snapshot, including a known cron row and an approved test backlog. Verify direct writes and worker RPC execution are denied. Do not reuse the deployment password or silently grant broad read/write service credentials.

No observer login, password or grants were created in hosted databases. No observer secret was found in repository/Staging environment metadata, and `production-monitor` did not yet exist at inspection time.

Production lacks the unreleased Recovery schema in the previous preflight snapshot. Validate the aggregate query on compatible Staging first; Production health acceptance follows the approved database stage. Keep Production deployment on HOLD until the release plan and prerequisites have been accepted.

## Remaining promotion configuration

Observed in the authenticated GitHub UI:

- `PRODUCTION_CD_ENABLED=false`; `STAGING_CD_ENABLED=true`.
- No Task Risk monitor enable variables exist at repository scope.
- Environment `Production` allows main only. Following the user's explicit reviewer selection, Required reviewers was enabled for `Horus031`, administrator bypass disabled, and the saved state verified after reload. Prevent self-review remains off to permit the selected owner approval model.
- Main is not protected.
- `VERCEL_TOKEN` is absent from repository and Production environment secret metadata. Only the older Vercel deploy hook is configured there. A real read-only Vercel preflight cannot run until the API credential is securely supplied.

The user explicitly chose `Horus031` as Production reviewer. This is owner manual approval, not independent review. Store the Vercel credential in Production environment secrets through the owner's normal secret-management flow; do not paste it in chat.

The subsequent feature PR into `product-release` remains pending the requested ordering and the user's evidence commit/push.
