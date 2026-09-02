# Deployment — Oracle Cloud Always Free + Coolify

**Target chosen 2026-08-20:** Oracle Cloud Always Free ARM VM running
[Coolify](https://coolify.io) (Apache-2.0), deploying to a **bare IP, no domain, no TLS**
for now. £0/month, never sleeps.

Everything in this repo is vendor-neutral Docker, so if Oracle's ARM capacity lottery
defeats you, the same containers deploy unchanged to Hetzner (~€11/mo) or any Docker host.

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
- Assign the domain/IP to the **frontend** service, **port 80**. nginx proxies `/api` and
  `/media` internally, so the app is same-origin and needs no Traefik path rules.

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

**Do not run `seed_data` here.** It creates demo accounts whose passwords are committed to
this repository — `dr_dhanvi / DoctorPass123!` has full access to every patient record.
The command now refuses to run when `DEBUG` is off, so this is enforced rather than trusted,
but the reason is worth knowing.

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
   attachments. Database backups do not cover it.

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
create_doctor                     real clinician account (seed_data is dev-only)
GET  /                            200   SPA loads through nginx
GET  /invoices/1                  200   deep link returns SPA, not 404
POST /api/v1/auth/login           200   same-origin proxy works
POST  (wrong password)            401
GET  /api/v1/dashboard/stats      real aggregates from Postgres
POST /owner/pets/1/history 5000ch 400   (SQLite hid this; Postgres would 500)
GET  /media/                      Content-Disposition: attachment present
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
