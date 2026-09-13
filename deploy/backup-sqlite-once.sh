#!/usr/bin/env bash
# One-off: encrypt and upload the pre-cutover SQLite file. Run on the VPS as deploy.
# Requires ~/.local/bin/{age,rclone} and ~/.config/rclone/rclone.conf with an [r2] remote.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
PUB="age1ra0rk40y79kvyzezpla2duw38nj8jjueg9uupqgvepzvz52fwc3sx87a3z"
STAMP=$(date -u +%Y%m%d-%H%M)
TMP=$(mktemp -d)
docker exec financial-tracker-bot sqlite3 /app/data/transaction.db ".backup /tmp/tmp-backup.db"
docker cp financial-tracker-bot:/tmp/tmp-backup.db "$TMP/transaction.db"
docker exec financial-tracker-bot rm -f /tmp/tmp-backup.db
age -r "$PUB" -o "$TMP/sqlite-$STAMP.db.age" "$TMP/transaction.db"
rclone copy "$TMP/sqlite-$STAMP.db.age" r2:wallet/sqlite/
rm -rf "$TMP"
echo "uploaded sqlite-$STAMP.db.age"
rclone ls r2:wallet/sqlite/
