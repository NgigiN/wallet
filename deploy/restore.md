# Restore drill

Run at the end of every phase and record the result in PROGRESS.md.

1. On the laptop: `rclone ls r2:wallet/pg/prod/ | sort -k2 | tail -1` → note the newest file.
2. `rclone copy r2:wallet/pg/prod/<file> /tmp/wallet-restore/`
3. `age -d -i ~/.config/wallet-backup/age-key.txt -o /tmp/wallet-restore/wallet.dump /tmp/wallet-restore/<file>`
4. `docker run -d --name wallet-restore -e POSTGRES_PASSWORD=x -p 127.0.0.1:5499:5432 postgres:16-alpine`
5. `pg_restore -h 127.0.0.1 -p 5499 -U postgres -d postgres --create --no-owner /tmp/wallet-restore/wallet.dump`
6. Compare with production (run the same three on the VPS via `docker compose -p wallet2 exec postgres psql -U wallet -d wallet -c ...`):
   - `select count(*) from transactions where deleted_at is null;`
   - `select count(*) from "user";`
   - `select max(seq) from transactions;`
7. `docker rm -f wallet-restore && rm -rf /tmp/wallet-restore`
8. Record date, file name, and the three numbers in PROGRESS.md.
