# Restore drill

Run at the end of every phase and record the result in PROGRESS.md.

`PREFIX` selects which set of dumps to restore: `prod` (default) or `staging`.

```bash
PREFIX=${1:-prod}
```

1. On the laptop: `rclone ls r2:wallet/pg/$PREFIX/ | sort -k2 | tail -1` → note the newest file.
2. `rclone copy r2:wallet/pg/$PREFIX/<file> /tmp/wallet-restore/`
3. `age -d -i ~/.config/wallet-backup/age-key.txt -o /tmp/wallet-restore/wallet.dump /tmp/wallet-restore/<file>`
4. `docker run -d --name wallet-restore -e POSTGRES_PASSWORD=x -p 127.0.0.1:5499:5432 postgres:16-alpine`
5. Wait for it to accept connections before restoring:
   `until docker exec wallet-restore pg_isready -U postgres -q; do sleep 1; done`
6. `PGPASSWORD=x pg_restore -h 127.0.0.1 -p 5499 -U postgres -d postgres --create --no-owner /tmp/wallet-restore/wallet.dump`
7. Compare with the source (run the same three on the VPS — `docker compose -p wallet2 exec postgres psql -U wallet -d wallet -c ...`, or `-p wallet2-staging` for the staging prefix):
   - `select count(*) from transactions where deleted_at is null;`
   - `select count(*) from "user";`
   - `select max(seq) from transactions;`
   Read them back from the restored copy with
   `PGPASSWORD=x psql -h 127.0.0.1 -p 5499 -U postgres -d wallet -c '...'`.
8. `docker rm -f wallet-restore && rm -rf /tmp/wallet-restore`
9. Record date, prefix, file name, and the three numbers in PROGRESS.md.
