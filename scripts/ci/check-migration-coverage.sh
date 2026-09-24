#!/usr/bin/env bash
set -euo pipefail

required_objects=(
  "get_my_dashboard_activity"
  "process_engagement_activity_atomic"
  "get_global_weekly_leaderboard_bundle"
  "get_my_goals_with_progress"
  "get_my_tasks_page"
  "evaluate_engagement_streak_states"
)

missing=0

for object in "${required_objects[@]}"; do
  if ! grep -R --include='*.sql' --quiet "$object" supabase/migrations; then
    echo "::error::Required database object '$object' is not represented in supabase/migrations."
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  echo
  echo "Run 'supabase db pull --schema public', add any required cron migration,"
  echo "then commit the generated migration files before deploying."
  exit 1
fi

echo "Required Lumivox database objects are represented in migrations."
