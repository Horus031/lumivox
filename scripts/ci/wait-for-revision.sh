#!/usr/bin/env bash
set -euo pipefail

url="${1:?health URL is required}"
expected_sha="${2:?expected git SHA is required}"
timeout_seconds="${3:-900}"
sleep_seconds=10
started_at="$(date +%s)"

echo "Waiting for $url to report revision $expected_sha"

while true; do
  now="$(date +%s)"

  if (( now - started_at >= timeout_seconds )); then
    echo "Timed out waiting for deployment revision after ${timeout_seconds}s."
    exit 1
  fi

  response="$(curl --silent --show-error --max-time 10 "$url" || true)"

  if [[ -n "$response" ]]; then
    status="$(jq -r '.status // empty' <<<"$response" 2>/dev/null || true)"
    revision="$(jq -r '.revision // empty' <<<"$response" 2>/dev/null || true)"

    if [[ "$status" == "ok" && "$revision" == "$expected_sha" ]]; then
      echo "Deployment is healthy and matches revision $expected_sha"
      exit 0
    fi

    echo "Current status=${status:-unknown}, revision=${revision:-unknown}"
  else
    echo "Health endpoint is not reachable yet."
  fi

  sleep "$sleep_seconds"
done
