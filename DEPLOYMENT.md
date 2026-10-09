# Deployment — Oracle Cloud Always Free + Coolify

**Target chosen 2026-08-20:** Oracle Cloud Always Free ARM VM running
[Coolify](https://coolify.io) (Apache-2.0), deploying to a **bare IP, no domain, no TLS**
for now. £0/month, never sleeps.

Everything in this repo is vendor-neutral Docker, so if Oracle's ARM capacity lottery
defeats you, the same containers deploy unchanged to Hetzner (~€11/mo) or any Docker host.

> **Uploads live in a private Vercel Blob store (2026-10-08).** Vercel's serverless
> filesystem is read-only, so writing uploads to `MEDIA_ROOT` crashed every
> diagnostic-report, query attachment and pet-photo upload with an HTML 500. New uploads now
> go to the **private** Blob store **`petphysio-files`** (region `iad1`), which is connected
> to the Vercel project; Vercel injects **`BLOB_READ_WRITE_TOKEN`** into Production, Preview
> and Development, but only **Production** (`VERCEL_ENV=production`) selects
> `appointments/storage_blob.py::BlobStorage` from it.
> The `StoredFile` table stays as the index (name, size, type, uploader, blob URL; migration
> `0025` made `content` nullable and added `blob_url`), so the owner quota and global
> ceiling still sum `StoredFile.size`. Private blobs are never public URLs: the signed
> `GET /api/v1/files/<token>` route fetches the blob server-side with the token and streams
> it back (attachment + nosniff + original filename).
>
> **Storage selection** (`settings._default_storage_backend`):
> - `FILE_STORAGE=blob` → Blob, in any environment (no or a malformed token refuses to boot).
> - `FILE_STORAGE` unset + `BLOB_READ_WRITE_TOKEN` set + `VERCEL_ENV=production` → Blob.
> - `FILE_STORAGE=db`, or `FILE_STORAGE` unset on Vercel otherwise (Preview, Development,
>   or no token) → Postgres (`DatabaseStorage`). Previews hold the same token but must never
>   write to or delete from the production store, which a preview database copied from
>   production could otherwise do.
> - Anything else, e.g. local dev with a `.env` from `vercel env pull` → the local
>   filesystem. (If that `.env` also carries `VERCEL=1`, the Vercel rule above gives
>   Postgres; still never Blob.) Set `FILE_STORAGE=filesystem` to be explicit.
>
> Rows written earlier by `DatabaseStorage` keep their bytes in `StoredFile.content` and are
> still served from Postgres; move them with `python manage.py migrate_files_to_blob` (dry
> run) then `--apply` (production had 0 stored files at the switch). A `pg_dump` no longer
> contains Blob-backed uploads — the store is their only copy.
>
> **Orphan blobs.** If an upload's request transaction rolls back after the Blob PUT, the
> blob has no `StoredFile` row. `python manage.py cleanup_orphan_blobs` (dry run) lists
> blobs older than 1 hour with no row; `--apply` deletes them. Run it against production
> with the production token and `DATABASE_URL` only. Listing costs one advanced operation
> per 1,000 blobs; deletes are free.
>
> **Vercel Blob Hobby limits** (vercel.com/docs/vercel-blob/usage-and-pricing, updated
> 2026-09-23): 1 GB storage/month, 10,000 simple operations (cache-miss reads, `head`),
> 2,000 advanced operations (`put`, `copy`, `list`), 10 GB Blob data transfer; `del` is
> free. Exceeding a Hobby limit blocks Blob access until 30 days have passed — it is not
> billed. Each upload is one advanced operation, so ~2,000 uploads/month is the ceiling;
> `exists`/`size` answer from the `StoredFile` index instead of `head` to save operations.
> Serving through the function also costs Fast Data Transfer on the way out.
>
> **Why 4 MB per file:** Vercel caps a serverless function's request body at 4.5 MB and
> rejects anything larger at its edge with a plain 413 that never reaches Django; uploads
> still pass through the function, so the cap stays. Lifting it means client-direct uploads
> (browser → Blob with a short-lived client token, `@vercel/blob/client` `upload()` /
> `handleUpload`), which would need a new token-issuing endpoint plus an upload-completed
> step to create the `StoredFile` row. **Abuse limits:** 30 uploads/hour/user, 60/hour/IP,
> 100 MB per owner account (doctors exempt), 10 signups/hour/IP, and a global ceiling —
> `FILE_STORAGE_MAX_MB` (default 700, under Blob's 1 GB Hobby storage and Neon's 1 GB) →
> 503, with a server error log each time it triggers. These counters need the shared cache
> (`REDIS_URL` or the database cache), not per-process memory. Uploads are never served by
> path: there is no `/media/` route in Django or nginx, only the signed
> `GET /api/v1/files/<token>`. The Coolify/Docker topology below still uses the filesystem
> (`media_data` volume) unless you set `FILE_STORAGE=db` or `blob`.

---

## Why this host

Researched 2026-08-20 against current provider docs. The shortlist that survived:

| Platform | Sleeps? | Cost | Verdict |
|---|---|---|---|
| **Oracle Always Free ARM + Coolify** | No¹ | **£0** | **Chosen** |
| Hetzner CAX21 + Coolify | No | €10.99/mo | Fallback, zero risk |
| Northflank Sandbox | No | £0 | Fallback, specs unpublished |
| Render | **Yes** — 15 min idle | £0 | Excluded by request |
| Koyeb | **Yes** — 1h, cannot disable | £0 | Excluded |
| Fly.io | Configurable | ~$6–12 | No free tier since 2026 |
| Neon / Supabase / Aiven Postgres | **Yes** — all idle-suspend | £0 | Excluded |

¹ **Only if you upgrade to Pay-As-You-Go.** See the warning below — this is the single
most important step on this page.

---

## ⚠️ Three Oracle facts to know before you start

1. **Free accounts DO get reclaimed.** Oracle
   [documents](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
   that an instance is reclaimed if, over 7 days, its 95th-percentile CPU **and** network
   **and** memory are all under 20%. A low-traffic clinic API trips all three easily.
   **Upgrading to Pay-As-You-Go exempts you and keeps you at $0 inside Always Free limits.**

   **Evidence caveat, stated honestly:** the PAYG exemption is **not in Oracle's formal
   documentation**. It appears only in Oracle's own reclamation emails ("you can keep idle
   compute instances from being stopped by converting your account to Pay As You Go") and
   is corroborated by many PAYG users reporting no terminations. Treat it as strong
   convention, not a contractual guarantee.

2. **The allowance was halved on 15 June 2026** — from 4 OCPU / 24 GB to **2 OCPU / 12 GB**,
   with no public announcement. Oracle began **terminating** over-quota instances on
   **18 August 2026**. Request 2 OCPU / 12 GB, not more.

3. **ARM capacity is a lottery.** "Out of host capacity" on `VM.Standard.A1.Flex` is endemic
   in popular regions and can persist for days. **Your home region is permanent at signup** —
   choose a less-popular one. Budget for several attempts over days, not minutes.

---

## Part 1 — What you must do (about 20 minutes)

These need your identity, your card, and your decisions. Nobody can do them for you.

1. **Sign up** at <https://signup.oraclecloud.com>. Needs a phone number and a **real credit
   card** (~$1 auth hold, refunded). Virtual/prepaid cards frequently fail; match the billing
   address exactly. **Pick your home region carefully — it cannot be changed.**

2. **Upgrade to Pay-As-You-Go** immediately: Billing → Upgrade. This is what prevents idle
   reclamation. You remain at $0 while inside Always Free limits.

3. **Set a budget alert at $1**: Billing → Cost Management → Budgets. Non-optional. PAYG
   means real charges become possible if you ever drift over a limit.

4. **Create the VM**: Compute → Instances → Create.
   - Image: **Ubuntu 24.04** (aarch64)
   - Shape: **`VM.Standard.A1.Flex`**, **2 OCPU / 12 GB**
   - Boot volume: 50–100 GB
   - **Save the SSH private key it offers — you cannot download it again.**

5. **Open ports in the VCN**: Networking → your VCN → Security Lists → add ingress rules for
   TCP **80**, **443**, and **8000** from `0.0.0.0/0`.

6. **Send me the public IP and the SSH key**, and I take it from here.

---

## Part 2 — What I automate

### 2.1 Oracle's hidden firewall

Oracle's Ubuntu images ship restrictive local `iptables` rules that block 80/443 **even
after** you open the VCN security list. This is the single most common "my server is
unreachable" cause on OCI.

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8000 -j ACCEPT
sudo netfilter-persistent save
```

### 2.2 Install Coolify

```bash
sudo apt update && sudo apt -y upgrade
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

Then open `http://<SERVER_IP>:8000`, create the admin account **immediately** (it is
unprotected until you do), and go to **Settings → disable Auto Update**. A Coolify
auto-update once silently swapped the proxy from Caddy to Traefik and took HTTPS down
([#9127](https://github.com/coollabsio/coolify/issues/9127)).

### 2.3 Postgres as a managed resource — not in compose

**+ New → Database → PostgreSQL 16.** Copy its **Internal URL**.

Do **not** put Postgres in the compose file. Coolify bug
[#7528](https://github.com/coollabsio/coolify/issues/7528) (open 9 months) means a database
declared inside a git-based compose file is never registered, so it gets **zero automated
backups**. That is why this repo has a separate `docker-compose.coolify.yml` with no
postgres service.

### 2.4 Deploy the app

**+ New → Application → your git repo → Build Pack: Docker Compose**, and set the compose
file to **`docker-compose.coolify.yml`**.

- Enable **Connect to Predefined Network** so the app can reach the managed database.
- Assign the domain/IP to the **frontend** service, **port 80**. nginx proxies `/api`
  internally, so the app is same-origin and needs no Traefik path rules. (It no longer
  serves `/media/`; uploads go through the signed `/api/v1/files/<token>` route.)

Environment variables (set in the Coolify UI — **never** commit these):

```
SECRET_KEY=<64 random chars>
DEBUG=False
ALLOWED_HOSTS=<SERVER_IP>,localhost,127.0.0.1
DATABASE_URL=<Internal URL from step 2.3>

# Required — the app refuses to boot without these. Password reset emails
# come from here; a wrong value silently sends links that go nowhere.
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
DEFAULT_FROM_EMAIL=no-reply@<your domain>
FRONTEND_BASE_URL=http://<SERVER_IP>
EMAIL_HOST=<smtp host>
EMAIL_PORT=587
EMAIL_HOST_USER=<smtp user>
EMAIL_HOST_PASSWORD=<smtp password>
EMAIL_USE_TLS=True

# ONLY while you have no domain and no certificate. HTTPS is enforced by
# default; this switches it off and prints a warning at every boot. Delete it
# the moment a certificate exists — see Part 3.
ALLOW_INSECURE_HTTP=true
```

> **Without an SMTP provider, password reset does not work.** The app will start,
> but the reset email is never delivered and a locked-out user stays locked out.
> Any transactional provider works (Brevo, Mailgun, SES); the free tiers are ample
> for a single clinic.

`localhost,127.0.0.1` are required for the container healthcheck to pass.

Generate the secret with:

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(64))'
```

### 2.5 Create the first real clinician account

There is no `seed_data` command — it was removed because it fabricated demo
accounts with passwords committed to the repository. Create the first clinician
explicitly instead (below); there is no demo data to avoid any more.

```bash
docker exec -it <backend-container> python manage.py create_doctor <username> <email>
```

It prompts for a password interactively so it never lands in your shell history. Pet owners
sign themselves up; the public signup endpoint can only ever create an OWNER.

Migrations, the cache table and `collectstatic` all run automatically in the entrypoint
before gunicorn binds, so there is nothing else to do.

---

## Part 3 — Adding a domain later (no redeploy needed)

The app currently ships with HTTPS enforcement **off**, because forcing an HTTPS redirect on
a bare IP with no certificate makes the app permanently unreachable.

When you have a domain:

1. Point an A record at the server IP.
2. In Coolify, set the domain on the frontend service — Let's Encrypt issues and auto-renews
   automatically.
3. Add these environment variables and redeploy:

```
ALLOWED_HOSTS=app.yourdomain.com,localhost,127.0.0.1
CSRF_TRUSTED_ORIGINS=https://app.yourdomain.com
FRONTEND_BASE_URL=https://app.yourdomain.com
```

**and delete `ALLOW_INSECURE_HTTP`.** HTTPS enforcement, secure cookies and HSTS are on by
default in production and all switch on together the moment that variable is gone — there
are no longer three separate flags to keep in agreement. (They used to be independent, and
setting the cookie flags without the redirect made the browser silently drop the session
cookie, so login failed with no visible error.)

`CSRF_TRUSTED_ORIGINS` is **required** — Django admin login over HTTPS fails CSRF without it.

> **Do not put real patient data on the bare-IP deployment.** With no TLS, owner names,
> phone numbers, emails and medical history travel in plaintext. Add the domain and
> certificate first.

---

## Part 4 — Backups (assume Coolify's are broken until proven otherwise)

Coolify has **32 open backup issues**, with a recurring "local dump succeeds, S3 upload
fails" pattern. Belt and braces:

1. **Coolify's own:** managed Postgres → Backups → cron `0 3 * * *` → S3 (Backblaze B2 is
   free to 10 GB). Click **Test**, then **verify a file actually landed in the bucket.**
   This is precisely where Coolify fails silently.

2. **Independent host cron** that does not depend on Coolify at all:

```bash
# /etc/cron.d/pgdump — 03:30 daily
30 3 * * * root docker exec $(docker ps -qf name=postgres) \
  pg_dump -Fc -U USER DB > /var/backups/pg-$(date +\%F).dump
```

3. **Back up the `media_data` volume too.** It holds uploaded diagnostic reports and query
   attachments. Database backups do not cover it (unless `FILE_STORAGE=db`, in which case
   uploads are rows in `appointments_storedfile` and `pg_dump` already has them).

4. **Do a restore drill now, not after an incident.** Coolify has no UI restore:

```bash
pg_restore --verbose --clean -h localhost -U postgres -d postgres backup.dump
```

An untested backup is not a backup.

---

## Verified locally before writing this

Run on 2026-08-20 against real Postgres 16 in Docker, not asserted from inspection:

```
docker compose build              both images built (amd64 + arm64)
docker compose up                 postgres / backend / frontend all healthy
migrations                        0001–0007 applied on Postgres
create_doctor                     real clinician account (the only account-creation command)
GET  /                            200   SPA loads through nginx
GET  /invoices/1                  200   deep link returns SPA, not 404
POST /api/v1/auth/login           200   same-origin proxy works
POST  (wrong password)            401
GET  /api/v1/dashboard/stats      real aggregates from Postgres
POST /owner/pets/1/history 5000ch 400   (SQLite hid this; Postgres would 500)
GET  /media/                      Content-Disposition: attachment present (route removed 2026-10-08; now 404)
manage.py test appointments       191/191
manage.py check --deploy          0 warnings (with HTTPS env vars set)
```

---

## Ongoing cost of self-hosting

Honest accounting, since this is the trade for never sleeping:

- **Monthly:** apply Coolify updates manually (auto-update is off for good reason).
- **Quarterly:** run a restore drill. ~30 minutes.
- **Always:** verify backups actually reach the bucket. Do not trust the Test button alone.
- **Watch:** Oracle changed free-tier terms twice without announcement. Keep off-platform
  backups so you can rebuild anywhere from a compose file plus a Postgres dump.

---

## SMS via Android gateway

The clinic texts owners when a visit or boarding stay is confirmed, the day before a visit,
and on the morning an overnight stay ends. Texts go out from an Android phone with the
clinic's SIM, running the open-source **SMS Gateway for Android** by capcom6 (Apache-2.0,
<https://github.com/capcom6/android-sms-gateway>, docs <https://docs.sms-gate.app>), in
**Cloud mode**. The backend calls the gateway's Cloud API
(`POST https://api.sms-gate.app/3rdparty/v1/messages`, HTTP Basic auth); the phone polls
the Cloud server and sends the SMS itself.

### 1. Set up the phone
1. On a spare Android phone (Android 5+) with the clinic SIM, install the latest APK from
   <https://github.com/capcom6/android-sms-gateway/releases> and grant **SEND_SMS**.
2. Toggle **Cloud Server** on and tap **Online**. The Cloud Server section shows a
   **username** and **password**: these are the gateway credentials.
3. Keep the phone on charge and on Wi-Fi or data, and exempt the app from battery
   optimisation. If the phone is offline, sends fail (`Gateway HTTP 503: phone offline…`) and
   the gateway drops anything older than 24 h.

### 2. Set Vercel environment variables — **Production environment only**
Scope `SMS_GATEWAY_USERNAME`, `SMS_GATEWAY_PASSWORD` and `CRON_SECRET` to **Production**, not
Preview/Development: every preview deployment of a branch would otherwise hold the clinic's
gateway login. Even if they leak into a preview, the gateway is only switched on
automatically when `VERCEL_ENV=production` (set by Vercel); other environments stay
`disabled` unless `SMS_BACKEND` is set explicitly.

| Variable | Value |
| --- | --- |
| `SMS_BACKEND` | `android_gateway` |
| `SMS_GATEWAY_USERNAME` | from the app's Cloud Server section |
| `SMS_GATEWAY_PASSWORD` | from the app's Cloud Server section |
| `CRON_SECRET` | a random string of 16+ characters (e.g. `openssl rand -hex 24`). Vercel sends it as `Authorization: Bearer …` to the cron |
| `SMS_DAILY_LIMIT` | optional, default `90` |
| `SMS_PER_PHONE_DAILY_LIMIT` | optional, default `3` texts per number per day |
| `SMS_ALLOWED_COUNTRY_CODES` | optional, default `+91`; comma-separated (e.g. `+91,+44`). Other numbers are recorded `SKIPPED_COUNTRY` |
| `SMS_WEBHOOK_SIGNING_KEY` | optional; from the app's **Settings → Webhooks → Signing Key**, to enable delivery status |
| `CLINIC_NAME` / `CLINIC_PHONE` | optional, default `Pet Physio Vet` / `+91 72840 73241` |
| `SMS_GATEWAY_URL` | optional, default `https://api.sms-gate.app/3rdparty/v1` (must be https; change it only for a private gateway server) |

If `SMS_BACKEND` is unset, SMS is on only when the credentials are present **and**
`VERCEL_ENV=production`; otherwise it is **disabled** (each message recorded as
`SKIPPED_DISABLED`).
`SMS_BACKEND=android_gateway` without credentials stops the deploy at boot, by design.
Redeploy after changing variables. Then open **SMS Reminders** in the staff app: the mode
should read *Android gateway (live)*. Use **Send test SMS** to your own phone.

**Cron:** `vercel.json` schedules `GET /api/v1/cron/sms-reminders` twice, at `30 3 * * *` and
`30 4 * * *` (09:00 and 10:00 IST). The run is idempotent, so the second pass only sends what
the first skipped, deferred or failed to send (e.g. the phone was briefly offline). On the
Hobby plan each cron is daily-only and may fire any time within its hour. Vercel runs crons only on the production deployment. If a run reports
`deferred` > 0 (phone offline), fix the phone and re-run it by hand:
`curl -H "Authorization: Bearer $CRON_SECRET" https://thepetphysiovet.com/api/v1/cron/sms-reminders`.
It is idempotent, so nobody is texted twice.

**Delivery status (optional):** register the webhook once per event:
```sh
for ev in sms:sent sms:delivered sms:failed; do
  curl -X POST -u "$SMS_GATEWAY_USERNAME:$SMS_GATEWAY_PASSWORD" -H "Content-Type: application/json" \
    -d "{\"url\": \"https://thepetphysiovet.com/api/v1/sms/webhook\", \"event\": \"$ev\"}" \
    https://api.sms-gate.app/3rdparty/v1/webhooks
done
```
Requests are verified with the HMAC signing key. The endpoint returns 404 until
`SMS_WEBHOOK_SIGNING_KEY` is set.

### 3. TRAI limits (read before relying on this)
- **An ordinary prepaid/postpaid SIM is capped at about 100 SMS a day.** The app stops at
  `SMS_DAILY_LIMIT` (default 90, counted from texts accepted today, IST) and records the rest
  as `SKIPPED_LIMIT`. Test SMS count too.
- **Commercial SMS in India should come from a DLT-registered sender** (a 6-character
  header and pre-approved templates). A personal SIM is not that. Operators can throttle or
  block a SIM that looks like bulk business traffic. This setup is meant for low-volume
  **transactional** texts only: confirmations and reminders for something the owner booked.
  **Never add offers or promotions** to `backend/appointments/sms/templates.py`.
- Owners who opted out on the SMS Reminders screen are never texted (`SKIPPED_OPTOUT`).
- **Abuse limits:** reminders go only to visits a doctor booked, confirmed or moved (an owner
  booking their own visit can never trigger a reminder); only `SMS_ALLOWED_COUNTRY_CODES`
  are texted; one number gets at most `SMS_PER_PHONE_DAILY_LIMIT` texts a day. Visits booked
  before this release have no doctor confirmation recorded, so they get **no reminder until a
  doctor confirms, books or moves them**.

### 4. Swapping to a DLT-registered provider later
All sending goes through `send_sms()` in `backend/appointments/sms/service.py`. Idempotency,
opt-out, the daily cap and the `SmsMessage` log are provider-independent. To switch:
1. Register the clinic's entity, a header, and the five templates in
   `sms/templates.py` on a DLT portal (Jio/Airtel/Vi/BSNL), using your provider's process.
2. Add a backend class in `sms/backends.py` with `name` and
   `send(to_e164, body, message_id, timeout) -> SendResult` (never raise; 5 s timeout), add it
   to `BACKENDS`, and add its name to `SMS_BACKENDS` and its credential check in
   `petphysio/settings.py`.
3. Set `SMS_BACKEND` to the new name and raise `SMS_DAILY_LIMIT` to suit the plan. Nothing
   else changes. If the provider has its own delivery callbacks, extend `sms/webhook.py`.

