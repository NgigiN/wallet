#!/bin/sh
# Nightly: pg_dump → age → rclone. Runs inside the backup sidecar.
#
# busybox crond hands its jobs a bare environment, so the variables the sidecar
# was started with are re-read from /etc/backup.env, which the sidecar's command
# writes (root-only) before starting crond. Manual runs
# (`docker compose exec -T backup sh /backup.sh`) pick up the same file.
set -euo pipefail

if [ -f /etc/backup.env ]; then
  set -a
  . /etc/backup.env
  set +a
fi

: "${PGPASSWORD:?PGPASSWORD is not set}"
: "${AGE_PUBLIC_KEY:?AGE_PUBLIC_KEY is not set}"
: "${RCLONE_REMOTE:?RCLONE_REMOTE is not set}"
: "${BACKUP_PREFIX:?BACKUP_PREFIX is not set}"

STAMP=$(date -u +%Y%m%d-%H%M)
NAME="wallet-${BACKUP_PREFIX}-${STAMP}.dump.age"
OUT="/tmp/${NAME}"
trap 'rm -f "$OUT"' EXIT

pg_dump -h postgres -U wallet -d wallet -Fc | age -r "$AGE_PUBLIC_KEY" -o "$OUT"

# Size floor: an empty-schema dump is already ~34 kB, so anything under 10 kB
# means pg_dump or age produced garbage. Never upload it — a truncated file
# would silently become "the latest backup".
MIN_BYTES=10000
SIZE=$(stat -c%s "$OUT")
if [ "$SIZE" -lt "$MIN_BYTES" ]; then
  echo "backup FAILED: $NAME is only ${SIZE} bytes (minimum ${MIN_BYTES}); not uploading" >&2
  exit 1
fi

rclone copy "$OUT" "$RCLONE_REMOTE/$BACKUP_PREFIX/"
# Monthlies are uploaded from the same local file (not copied remote→remote, so
# a failed daily upload cannot produce a monthly that points at nothing).
if [ "$(date -u +%d)" = "01" ]; then
  rclone copy "$OUT" "$RCLONE_REMOTE/$BACKUP_PREFIX-monthly/"
fi
# retention: 30 days of dailies, 190 days of monthlies
rclone delete --min-age 30d "$RCLONE_REMOTE/$BACKUP_PREFIX/"
rclone delete --min-age 190d "$RCLONE_REMOTE/$BACKUP_PREFIX-monthly/"
echo "backup ok: $NAME (${SIZE} bytes)"
