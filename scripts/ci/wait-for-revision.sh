#!/usr/bin/env bash
set -euo pipefail

url="${1:?health URL is required}"
expected_sha="${2:?expected git SHA is required}"
timeout_seconds="${3:-900}"
expected_model_version="${4:-}"
sleep_seconds=10
started_at="$(date +%s)"

if [[ -n "$expected_model_version" ]]; then
  echo "Waiting for $url to report revision $expected_sha and native model $expected_model_version"
else
  echo "Waiting for $url to report revision $expected_sha"
fi

while true; do
  now="$(date +%s)"

  if (( now - started_at >= timeout_seconds )); then
    echo "Timed out waiting for deployment revision after ${timeout_seconds}s."
    exit 1
  fi

  response="$(curl --silent --show-error --location --max-time 10 "$url" || true)"

  if [[ -n "$response" ]]; then
    status="$(jq -r '.status // empty' <<<"$response" 2>/dev/null || true)"
    revision="$(jq -r '.revision // empty' <<<"$response" 2>/dev/null || true)"

    if [[ "$status" == "ok" && "$revision" == "$expected_sha" ]]; then
      if [[ -z "$expected_model_version" ]]; then
        echo "Deployment is healthy and matches revision $expected_sha"
        exit 0
      fi

      model_status="$(jq -r '.models.native_task_risk.status // empty' <<<"$response" 2>/dev/null || true)"
      model_version="$(jq -r '.models.native_task_risk.model_version // empty' <<<"$response" 2>/dev/null || true)"

      if [[ "$model_status" == "ready" && "$model_version" == "$expected_model_version" ]]; then
        echo "Deployment is healthy, matches revision $expected_sha, and loaded native model $expected_model_version"
        exit 0
      fi

      echo "Revision is correct, but native model status=${model_status:-unknown}, model_version=${model_version:-unknown}"
    else
      echo "Current status=${status:-unknown}, revision=${revision:-unknown}"
    fi
  else
    echo "Health endpoint is not reachable yet."
  fi

  sleep "$sleep_seconds"
done
