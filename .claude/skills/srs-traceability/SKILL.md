---
name: srs-traceability
description: Build or update the SRS traceability matrix for Pet Physio Vet — map every SRS acceptance criterion (AC-xx across §3.1–§3.9 and the §4 non-functional requirements) to the code, tests, and PRODUCT_PLAN phase that satisfy it, and report coverage gaps. Use to check "how much of the SRS is actually built and proven", before a demo, or at sprint end.
---

# SRS Traceability — Pet Physio Vet

Produce a matrix that ties requirements → implementation → verification, so coverage is
provable and gaps are visible.

## Steps
1. Read the SRS acceptance criteria (§3.1 Auth, §3.2 Dashboard, §3.3 Pets, §3.4
   Diagnosis, §3.5 Treatment, §3.6 Appointments, §3.7 Reminders, §3.8 Payments, §3.9
   Queries) and the §4 non-functional requirements. Also read `PRODUCT_PLAN.md`.
2. Search the codebase for the implementing code and the tests that exercise each AC.
3. For each AC, record a row:
   | AC id | Requirement (short) | Status (Done/Partial/Missing) | Code (file:line) | Test (name/file) | Plan phase |
4. Summarize: % ACs Done, list of Partial/Missing with the blocking reason, and the
   highest-priority gaps to close next.

## Output
Write the matrix to `docs/traceability.md` (overwrite/update) and give the user the
summary counts + top gaps. Do not mark an AC "Done" unless there is BOTH implementing
code AND a test/verification that exercises it — otherwise it is at most "Partial".

## Notes
- Be precise with file:line references; do not guess.
- Flag any AC that code claims to satisfy but no test covers (silent risk).
