# VPS Setup Guide — wallet.samtama.lol

How to take the VPS from "old Discord-bot-only deployment" to "serving the
authenticated wallet API over HTTPS behind Cloudflare". Follow the phases in
order — the order matters (data rescue before any redeploy; cert before the
TLS config).

```
Android app ──HTTPS──> Cloudflare ──HTTPS──> nginx (443, TLS) ──HTTP──> 127.0.0.1:8080 (Docker container)
                                                                          ├── /health
                                                                          └── /api/transactions  (Bearer API_TOKEN)
```

---

## Phase 0 — RESCUE THE LIVE DATABASE (do this before anything else)

The currently-running container opens `transaction.db` in `/app` (inside the
container's writable layer), but the Docker volume is mounted at `/app/data`.
That means **your transaction history is destroyed every time the container
is rebuilt**. Copy it into the volume before the next deploy:

```bash
docker cp financial-tracker-bot:/app/transaction.db /home/deploy/opt/wallet/data/transaction.db
sqlite3 /home/deploy/opt/wallet/data/transaction.db "SELECT COUNT(*) FROM transactions;"   # sanity check
```

The new code reads `DB_PATH=data/transaction.db` (set automatically by
`start_app.sh`), so after the next deploy the DB lives on the volume and
survives rebuilds.

---

## Phase 1 — API_TOKEN

**What it is:** a random secret string *you* generate — it doesn't come from
anywhere. It is not a Safaricom/Airtel/Cloudflare thing.

**Why it exists:** the server previously had no public HTTP endpoints beyond
`/health`. The Android app adds two (`POST` and `GET /api/transactions`) that
expose and accept your financial data, and `wallet.samtama.lol` is reachable
by the whole internet. The token is the lock on that door: every request must
carry `Authorization: Bearer <API_TOKEN>`, compared in constant time on the
server; anything else gets `401`.

**Generate it once:**

```bash
openssl rand -hex 32
```

**It must live in exactly three places (same value):**

| Where | How | Used for |
|---|---|---|
| VPS `.env` (`/home/deploy/opt/wallet/.env`) | add line `API_TOKEN=<value>` | the Go server reads it at startup (refuses to start without it) |
| GitHub repo secret `API_TOKEN` | repo → Settings → Secrets and variables → Actions | CI forwards it to `start_app.sh` so fresh servers get it into `.env` |
| Android app → Settings tab | paste into "API token" | the phone sends it on every sync request |

While editing `.env`, also add (the deploy script would add it anyway):

```
DB_PATH=data/transaction.db
```

---

## Phase 2 — Cloudflare DNS

Dashboard → samtama.lol zone → DNS → add record:

- Type `A`, name `wallet`, content `193.187.129.179`, **Proxied** (orange cloud)
- SSL/TLS mode for the zone should be **Full (strict)** (you'll have a valid
  Let's Encrypt cert on the origin after Phase 3)

Cloudflare exempts `/.well-known/acme-challenge/` from Always-Use-HTTPS, so
cert issuance works through the proxy. If issuance still fails, temporarily
switch the record to DNS-only (grey cloud), issue, then re-enable the proxy.

---

## Phase 3 — nginx + certificate (two-phase install)

You cannot install the final TLS config first: its `ssl_certificate` lines
point at files certbot hasn't created yet, `nginx -t` fails, and
`certbot --nginx` refuses to run against a failing config. So: minimal
HTTP-only config → issue cert → full config.

**Step 3.1 — minimal port-80 config** (replaces whatever half-state is there):

```bash
sudo tee /etc/nginx/sites-available/wallet.samtama.lol >/dev/null <<'EOF'
server {
    include snippets/block-probes.conf;
    listen 80;
    server_name wallet.samtama.lol;
    location / { return 404; }
}
EOF
sudo ln -sf /etc/nginx/sites-available/wallet.samtama.lol /etc/nginx/sites-enabled/wallet.samtama.lol
sudo nginx -t && sudo systemctl reload nginx
```

**Step 3.2 — issue the certificate** (`certonly` = obtain only, don't touch
config; always with sudo):

```bash
sudo certbot certonly --nginx -d wallet.samtama.lol
```

Success looks like: `Successfully received certificate ... saved at
/etc/letsencrypt/live/wallet.samtama.lol/fullchain.pem`. Renewal is automatic
via the existing certbot timer.

**Step 3.3 — install the full config.** Copy the two `server` blocks from
`deploy/nginx-wallet.conf` in this repo into
`/etc/nginx/sites-available/wallet.samtama.lol` (overwrite the minimal file;
make sure `listen 443 ssl http2;` is NOT commented out), then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**Step 3.4 — retire the old irs-bot site** (its IP-based `/health` proxy is
superseded):

```bash
sudo rm /etc/nginx/sites-enabled/irs-bot
sudo nginx -t && sudo systemctl reload nginx
```

---

## Phase 4 — deploy the new code

The new backend is on the `sms-tracker` branch. Deployment is triggered by a
push to `main` (GitHub Actions → SSH → `start_app.sh` rebuilds the container).
Merge and push only after Phases 0-3 are done.

What the deploy does now: binds the container to `127.0.0.1:8080` (loopback
only — nginx is the only public entrance), ensures `API_TOKEN` and `DB_PATH`
exist in `.env`, rebuilds, restarts.

---

## Phase 5 — verify

From anywhere:

```bash
curl -s https://wallet.samtama.lol/health
# → {"status":"healthy",...}

curl -s https://wallet.samtama.lol/api/transactions      # no token
# → {"error":"unauthorized"}

curl -s https://wallet.samtama.lol/api/transactions -H "Authorization: Bearer $API_TOKEN" | head -c 200
# → JSON array of your historical transactions
```

On the VPS, confirm the data survived:

```bash
sqlite3 /home/deploy/opt/wallet/data/transaction.db "SELECT COUNT(*) FROM transactions;"
docker logs --tail 5 financial-tracker-bot
```

Then on the phone: Wallet app → Settings → URL `https://wallet.samtama.lol`
+ the token → Save → "Sync history from server" → Stats should show your
Discord-era history.

---

## Troubleshooting (errors seen in the wild)

| Symptom | Cause | Fix |
|---|---|---|
| `[Errno 13] Permission denied: '/var/log/letsencrypt/.certbot.lock'` | certbot run without root | prefix with `sudo` |
| `cannot load certificate ".../fullchain.pem" ... no such file` | TLS config installed before the cert exists | Phase 3 order: minimal config → `certonly` → full config |
| `certbot install --cert-name ...` → "doesn't know how to configure" | `install` only wires up an *existing* cert, and needs a passing `nginx -t` | use `certonly` for first issuance |
| `[warn] protocol options redefined for 0.0.0.0:443` | another site (landlords) already declares `http2` on 443 | harmless warning; ignore |
| Container restart-looping after deploy, logs say "API token is not set" | `.env` on the server lacks `API_TOKEN` | Phase 1 |
| App syncs nothing, rows pile up TAGGED | wrong URL/token in app Settings, or Cloudflare record not proxied/DNS not propagated | check `curl` verifications above |

---

## v2 staging + weekly tombstone purge

The v2 backend (TypeScript/Hono + Postgres) runs as its own compose project so
it cannot touch the live Go bot. Staging binds `127.0.0.1:8082`; the Go
container keeps `127.0.0.1:8080`.

```
Browser/app ──HTTPS──> Cloudflare ──HTTPS──> nginx (wallet-staging.samtama.lol)
                                               └─HTTP──> 127.0.0.1:8082  (wallet2-staging-api-1)
                                                            ├── postgres  (wallet2-staging-postgres-1, no host port)
                                                            └── backup    (wallet2-staging-backup-1, crond)
```

### Bring the stack up

```bash
cd /home/deploy/opt/wallet && git fetch && git checkout feat/server-1a && git pull
cp -n deploy/env.staging.example deploy/.env.staging   # then fill in real secrets
chmod 600 deploy/.env.staging
cd deploy && docker compose --env-file .env.staging -f compose.yml -f compose.staging.yml up -d --build
curl -s http://127.0.0.1:8082/health      # → {"status":"healthy","db":"ok","version":"staging",...}
```

`deploy/.env.staging` is gitignored and never committed. It holds
`POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `SENTRY_DSN`, `API_PORT=8082`,
`ENV_FILE=.env.staging`, and the `age` **public** key used to encrypt backups
(the private key lives only on the laptop at
`~/.config/wallet-backup/age-key.txt`).

`ENV_FILE` is load-bearing: the api service declares `env_file: ${ENV_FILE:-.env}`,
a single entry, because compose **concatenates** `env_file` lists across
overlays — an entry in `compose.staging.yml` would pull a future production
`deploy/.env` into the staging container as well.

### nginx vhost (needs sudo — see `deploy/nginx-wallet-staging.conf`)

The cert must exist before the 443 block can load, so install the port-80 block
first, run certbot, then install the full file. The exact commands are in the
header of `deploy/nginx-wallet-staging.conf`.

### Backups

The `backup` sidecar installs `postgresql16-client`, `age` and `rclone` on start,
writes the variables `backup.sh` needs to a root-only `/etc/backup.env` (busybox
`crond` does **not** pass the container environment to its jobs), then runs
`crond` with `${BACKUP_CRON:-0 2 * * *} sh /backup.sh` (02:00 UTC by default).
Each run does `pg_dump -Fc | age -r $AGE_PUBLIC_KEY`, refuses to upload anything
under 10000 bytes, `rclone copy`s to `r2:wallet/pg/<prefix>/` (`staging` or
`prod`), keeps 30 days of dailies, uploads the 1st-of-month dump a second time to
`…-monthly/` and keeps those 190 days. `set -euo pipefail` plus a `trap` means a
failed `pg_dump` fails the job and never leaves a temp file behind. Restore
drill: `deploy/restore.md`.

To prove the *scheduled* path (not just a manual run), put `BACKUP_CRON=* * * * *`
in `.env.staging`, recreate the sidecar, wait a minute, check the bucket, then
remove the override and recreate again:

```bash
cd /home/deploy/opt/wallet/deploy
docker compose --env-file .env.staging -f compose.yml -f compose.staging.yml up -d --force-recreate backup
docker logs wallet2-staging-backup-1 | tail       # crond: USER root pid N cmd sh /backup.sh
~/.local/bin/rclone ls r2:wallet/pg/staging/
```

Run one on demand:

```bash
cd /home/deploy/opt/wallet/deploy
docker compose --env-file .env.staging -f compose.yml -f compose.staging.yml exec -T backup sh /backup.sh
~/.local/bin/rclone ls r2:wallet/pg/staging/
```

### Weekly tombstone purge (host cron — documented, not yet installed)

Soft-deleted rows older than 90 days are hard-deleted by
`dist/scripts/purge-tombstones.js` inside the api container. It cannot run from
the backup sidecar (no docker socket there), so it goes in the **deploy user's**
crontab (`crontab -e`), Sundays at 03:00:

```cron
0 3 * * 0 cd /home/deploy/opt/wallet/deploy && docker compose --env-file .env.staging -f compose.yml -f compose.staging.yml exec -T api node dist/scripts/purge-tombstones.js >> /home/deploy/opt/wallet/deploy/purge.log 2>&1
```

For production, swap the `--env-file`/overlay for the prod pair:
`cd /home/deploy/opt/wallet/deploy && docker compose --env-file .env -f compose.yml exec -T api node dist/scripts/purge-tombstones.js >> /home/deploy/opt/wallet/deploy/purge.log 2>&1`.

The script deletes in one transaction (all-or-nothing), logs a count per table,
exits 2 if `DATABASE_URL` is unset, and skips category tombstones that are still
referenced by a transaction, budget or rule — those FKs have no `ON DELETE`
action, so purging a referenced category would abort the whole run.

**Caveat:** a device that has been offline for more than 90 days can miss a
tombstone entirely — it pulls from its stored cursor and the delete row is gone,
so the row reappears locally. The sync protocol has no stale-cursor guard yet;
until it does, such a device needs a full resync (clear local state and pull
from `since=0`).
