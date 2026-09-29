#!/bin/sh
# Run after a successful local dump, once RESTIC_REPOSITORY and RESTIC_PASSWORD_FILE
# point to an approved encrypted repository outside this server.
set -eu
: "${RESTIC_REPOSITORY:?Set RESTIC_REPOSITORY}"
: "${RESTIC_PASSWORD_FILE:?Set RESTIC_PASSWORD_FILE}"
BACKUP_DIR="${NEXO_BACKUP_DIR:-./backups}"
test -f "$RESTIC_PASSWORD_FILE" || { echo 'Restic password file is missing' >&2; exit 1; }
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'nexo-*.dump' -print -quit | grep -q . || {
  echo 'No PostgreSQL dump available for offsite backup' >&2
  exit 1
}
restic backup "$BACKUP_DIR" --tag nexo-postgres
restic snapshots --latest 1 --tag nexo-postgres >/dev/null
