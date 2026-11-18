#!/usr/bin/env bash
set -euo pipefail
target="${1:?staging or production is required}"
case "$target" in
  staging) project=atbdbbamqjmfkvahqidj ;;
  production) project=lslybjylsxtnznghrtyj ;;
  *) echo "::error::Unknown monitor target."; exit 2 ;;
esac
if [[ "${PGHOST:-}" != "db.${project}.supabase.co" ]]; then
  if [[ "${PGHOST:-}" != *.pooler.supabase.com || "${PGUSER:-}" != *."$project" ]]; then
    echo "::error::Monitor connection does not match the approved $target project."
    exit 2
  fi
fi
if [[ -z "${PGUSER:-}" || -z "${PGPASSWORD:-}" || -z "${TASK_RISK_MONITOR_CA_PEM:-}" ]]; then
  echo "::error::Configure the $target read-only observer credentials and TLS CA."
  exit 2
fi
unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGOPTIONS
export PGDATABASE=postgres PGSSLMODE=verify-full PGCONNECT_TIMEOUT=5
export PGOPTIONS="-c default_transaction_read_only=on"
umask 077
PGSSLROOTCERT="$(mktemp)"
export PGSSLROOTCERT
trap 'rm -f -- "$PGSSLROOTCERT"' EXIT
printf '%s\n' "$TASK_RISK_MONITOR_CA_PEM" > "$PGSSLROOTCERT"
set +e
snapshot="$(node scripts/check-task-risk-recovery-health.mjs)"
status=$?
set -e
{
  echo "## Task Risk Recovery health · $target"
  if [[ -n "$snapshot" ]]; then
    echo '```json'
    printf '%s\n' "$snapshot"
    echo '```'
  else
    echo "Health probe did not return a snapshot."
  fi
} >> "${GITHUB_STEP_SUMMARY:?job summary path is required}"
if [[ "$status" == 1 ]]; then
  echo "::error::Task Risk Recovery raised an operational alert. See the job summary."
elif [[ "$status" != 0 ]]; then
  echo "::error::Task Risk Recovery health probe is unavailable."
fi
exit "$status"
