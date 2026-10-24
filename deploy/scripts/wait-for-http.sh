#!/usr/bin/env bash
set -euo pipefail

url="${1:?usage: wait-for-http.sh <url> [max-attempts] [retry-delay]}"
max_attempts="${2:-20}"
retry_delay="${3:-3}"

for attempt in $(seq 1 "$max_attempts"); do
  if curl --fail --silent --show-error "$url" >/dev/null; then
    echo "Ready: $url"
    exit 0
  fi
  if [[ "$attempt" -lt "$max_attempts" ]]; then
    echo "Not ready ($attempt/$max_attempts); retrying in ${retry_delay}s"
    sleep "$retry_delay"
  fi
done

echo "ERROR: readiness check timed out: $url" >&2
exit 1
