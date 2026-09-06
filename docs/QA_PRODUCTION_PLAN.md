# Production QA — brutal test plan

**Target:** `https://petphysio.vercel.app` (live: Vercel + Neon Postgres 18.6)
**Started:** 2026-09-06
**Method:** test → triage → fix → deploy → retest, looping until a full pass is clean.

---

## Why this is written down

Production is the only environment that exercises the real database, the real
CORS config, the real HTTPS edge and the real serverless cold start. Local
testing has already proven the *logic*; this proves the *deployment*.

**Exit condition:** one complete pass of §4 with zero SEV-1 or SEV-2 findings,
and every test datum removed afterwards.

---

## 1. What this is actually checking — in plain terms

Five questions a clinic owner would ask. Everything in §4 rolls up to one of them.

| # | The question | Why it matters | Severity if broken |
|---|---|---|---|
| Q1 | **Can my vet get in, and only my vet?** | A clinical record behind a broken lock is worse than no record | SEV-1 |
| Q2 | **Can one pet owner see another's records?** | Clinical data on someone else's animal. Legally and reputationally fatal | SEV-1 |
| Q3 | **Does the money add up?** | An invoice that computes the wrong total, or takes payment twice | SEV-1 |
| Q4 | **Does it hold up when several people use it at once?** | A busy clinic is not one person clicking slowly | SEV-2 |
| Q5 | **Does it work on the phone in the consulting room?** | The product ships as an app; a spinner is a failure | SEV-2 |

## 2. Severity

| | Meaning | Action |
|---|---|---|
| **SEV-1** | Data exposure, data loss, money wrong, or total lockout | Stop, fix, deploy, retest before continuing |
| **SEV-2** | A real user cannot complete a core task, or is misled | Fix in this session |
| **SEV-3** | Wrong-but-recoverable, cosmetic, or confusing copy | Record; fix if cheap |
| **NOTE** | Works as built; worth a product decision | Record only |

## 3. Rules for this run

1. **Never touch existing production records.** `dr_dhanvi`, `anita.live52888`,
   pet `Coco`, the 5 enquiries, and the 1 real appointment are read-only.
2. **Every test identity is prefixed `qa`** and its id recorded, so cleanup is
   exact rather than best-effort.
3. **A finding is not real until reproduced.** This session has already produced
   four false alarms from asserting on assumptions; anything reported here is
   confirmed against the database or a second observation.
4. **A fix is not done until the same attack is re-run against the deployed
   build and fails.** Not "the test passes" — the original attack fails.
5. **Report honestly.** Pre-existing failures are labelled as such, and my own
   test bugs are labelled as mine.

## 4. The test matrix

### A — Authentication (Q1)
A1 wrong password refused · A2 empty credentials · A3 SQL-ish payload · A4 correct
login issues a token · A5 token refresh rotates · A6 expired/tampered token rejected ·
A7 logout invalidates · A8 password-reset request does not leak whether an account exists

### B — Authorisation (Q2) — the section that matters most
B1 owner A reads owner B's pet → **404, never 403** · B2 owner A reads B's clinical
history · B3 owner A reads B's messages · B4 owner A books against B's pet ·
B5 owner reaches the doctor patient roster · B6 owner reaches dashboard stats ·
B7 owner reaches clinic revenue · B8 owner reaches the enquiry inbox ·
B9 owner escalates their own role via PATCH /auth/profile · B10 unauthenticated
access to every protected route

### C — Input validation (Q3, Q5)
C1 empty and whitespace-only names · C2 oversized strings · C3 script payloads
render inert · C4 invalid visit types · C5 malformed dates and times ·
C6 past-date bookings · C7 negative invoice quantity and price · C8 decimal
overflow · C9 empty invoices · C10 out-of-range outcome measures ·
C11 half-filled range-of-motion pair

### D — Concurrency and integrity (Q4)
D1 double-tap booking creates one appointment · D2 parallel bookings of the same
slot · D3 several owners writing at once · D4 payment idempotency ·
D5 invoice totals are computed, not client-supplied

### E — Deployment surface (Q5)
E1 CORS admits the native origins and nothing else · E2 HTTPS and cold start ·
E3 error bodies are RFC-7807 · E4 404 wording identical for "missing" and "not
yours" · E5 the mobile app reaches production end to end

## 5. Loop log

Filled in as the run proceeds: pass number, findings, fixes, deploy, re-verification.
