#!/bin/sh
# Suitable for a cron job or an external monitoring probe. Exit nonzero to alert.
set -eu
URL="${NEXO_HEALTH_URL:-http://127.0.0.1:8014/healthz/}"
BACKUP_DIR="${NEXO_BACKUP_DIR:-./backups}"
MAX_BACKUP_AGE_HOURS="${NEXO_MAX_BACKUP_AGE_HOURS:-30}"
curl --fail --silent --show-error --max-time 10 "$URL" >/dev/null
newest=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'nexo-*.dump' -printf '%T@\n' | sort -nr | head -1)
test -n "$newest" || { echo 'No PostgreSQL backup found' >&2; exit 1; }
now=$(date +%s)
age=$(awk "BEGIN {printf \"%.0f\", $now - $newest}")
test "$age" -le "$((MAX_BACKUP_AGE_HOURS * 3600))" || {
  echo "PostgreSQL backup is ${age}s old" >&2
  exit 1
}
