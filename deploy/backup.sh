#!/bin/sh
# Nightly: pg_dump → age → rclone. Runs inside the backup sidecar.
set -eu
STAMP=$(date -u +%Y%m%d-%H%M)
OUT=/tmp/wallet-${BACKUP_PREFIX}-${STAMP}.dump.age
pg_dump -h postgres -U wallet -d wallet -Fc | age -r "$AGE_PUBLIC_KEY" -o "$OUT"
rclone copy "$OUT" "$RCLONE_REMOTE/$BACKUP_PREFIX/"
rm -f "$OUT"
# retention: 30 days of dailies (monthlies are kept by a separate copy on the 1st)
if [ "$(date -u +%d)" = "01" ]; then rclone copy "$RCLONE_REMOTE/$BACKUP_PREFIX/wallet-${BACKUP_PREFIX}-${STAMP}.dump.age" "$RCLONE_REMOTE/$BACKUP_PREFIX-monthly/"; fi
rclone delete --min-age 30d "$RCLONE_REMOTE/$BACKUP_PREFIX/"
rclone delete --min-age 190d "$RCLONE_REMOTE/$BACKUP_PREFIX-monthly/"
echo "backup ok: wallet-${BACKUP_PREFIX}-${STAMP}.dump.age"
