---
title: Pet Physio Vet
emoji: 🐾
colorFrom: yellow
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# Pet Physio Vet

Veterinary physiotherapy & rehabilitation platform — Django REST API + React SPA,
in a single container.

## Required Space secrets

Set these under **Settings → Variables and secrets**:

| Name | Notes |
|---|---|
| `SECRET_KEY` | 64 random chars. `python3 -c 'import secrets;print(secrets.token_urlsafe(64))'` |
| `DATABASE_URL` | Neon Postgres connection string |
| `ALLOWED_HOSTS` | `<user>-<space>.hf.space,localhost,127.0.0.1` |
| `FRONTEND_BASE_URL` | `https://<user>-<space>.hf.space` |
| `EMAIL_BACKEND` | `django.core.mail.backends.console.EmailBackend` until SMTP exists |
| `DEFAULT_FROM_EMAIL` | any address |
| `CSRF_TRUSTED_ORIGINS` | `https://<user>-<space>.hf.space` |

`DEBUG` stays unset. HTTPS enforcement is on by default and Spaces terminate TLS,
so `ALLOW_INSECURE_HTTP` is **not** needed here.

## After the first build

Demo accounts cannot be created here — `seed_data` refuses to run outside DEBUG,
by design, because its passwords are committed to the repository. Create a real
clinician instead:

```
python manage.py create_doctor <username> <email>
```

Pet owners sign themselves up; the public signup endpoint can only ever create
an OWNER.

## Known limitation

Uploaded files (X-rays, scans, message attachments) are written to the
container's ephemeral disk and **are lost when the Space restarts or sleeps**.
Everything else persists in Postgres. Persistent storage on Spaces is a paid
upgrade; the alternative is moving media to object storage.
