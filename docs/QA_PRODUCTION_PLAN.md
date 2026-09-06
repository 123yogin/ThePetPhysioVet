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

### Pass 1 — auth + authorisation · 21 checks, 0 failures
A1-A8 and B1-B10 all clean against the live API. Notable: **B9 passed** — the
privilege escalation `tests/test_exploits.py` documents (an owner PATCHing
`role: DOCTOR` onto themselves) is genuinely closed in production. Cross-owner
reads return **404, not 403**, so existence never leaks.

### Pass 2 — validation, concurrency, deployment · 21 checks, 2 failures, both mine
C1-C11, D1/D3, E1/E3/E4. Two "failures" triaged to test defects, not product
defects, and proven so:
- **D3** — my time template produced `14:00`, the slot D1 had just taken; the 400
  was the duplicate constraint working. Five *distinct* slots in parallel:
  `201,201,201,201,201`.
- **E4** — the pet I picked had `doctor_name: null`, i.e. it sits in the
  **claimable pool** `CLAUDE.md` documents as deliberate. A doctor reading it is
  by design.

**Not covered, and not claimed as passing:** the real E4 case — a doctor from
another practice reading an *assigned* pet — is untestable on production, which
has a single doctor account.

### Pass 3 — money · 8 checks, 0 failures
Client-supplied `subtotal`, `total` and `amount_paid` are all ignored (they are
computed properties). Payment idempotency holds under a genuine parallel race:
three submissions of one key produced **1 payment, ₹500 total**, confirmed in
Postgres. Overpayment refused, negative payment refused, and an owner cannot
settle their own invoice.

**Finding (SEV-3):** `tax` *is* a stored, client-supplied column with no
server-side rate. A ₹1,600 invoice stored `tax = 0.00` because that is what was
sent. The 18% GST exists only in `InvoiceFormScreen.tsx`. This compounds the
open question that veterinary clinical services appear to be **Nil-rated** under
Entry 46 of Notification 12/2017-CTR.

### Pass 4 — the app itself · pass
Signed release APK against production: doctor signs in, lands on Clinic
Dashboard, and the patient list shows **Coco** — real production data on a real
device. Logcat clean: no CORS, mixed-content or fetch failures.

### Fix loop
One genuine defect fixed and re-verified against the deployed build:

| | |
|---|---|
| Defect | Signup derived `email.split("@")[0]` client-side with no uniqueness check |
| Impact | `info@clinic-one` and `info@clinic-two` collided; the second person was refused, citing a field the form told them to leave blank |
| Fix | Derived server-side via the existing `_unique_owner_username()`; PR #9, `ea61772` |
| Re-verified live | `info` → `info1` → `info2`; explicit duplicate still a clean 400 |

A trap caught by existing tests: declaring `username` on the serializer dropped
DRF's generated `UniqueValidator`, turning a duplicate into a 500. Restored by hand.

### Exit condition — met
**58 checks, zero SEV-1 or SEV-2 product defects.** Production restored to its
exact pre-test baseline: `users=2 pets=1 appts=1 invoices=0 payments=0
enquiries=5`, users `dr_dhanvi` + `anita.live52888`, pet `Coco`.

### Still open (recorded, not fixed)
| | Severity | Note |
|---|---|---|
| No request timeout anywhere in the client | SEV-3 | No `AbortController`/`AbortSignal`; a flaky connection spins forever |
| `tax` client-supplied; GST rate frontend-only | SEV-3 | Needs a CA opinion on the rate before changing |
| Neon credential exposed in a transcript | — | Rotate `neondb_owner` |
