# Duplicate Code

## Consolidated

### `frontend/src/api/facility.ts` — query-string construction
Two sibling API modules built list-endpoint URLs differently:

- `api/enquiries.ts` (canonical): `const query = status ? \`?status=...\` : ''`
  then `\`/enquiries${query}\``.
- `api/facility.ts` (divergent): `\`/facility/bookings${query ? \`?${query}\` : ''}\``
  — an inline ternary whose whitespace also broke the SPA-route guard test.

Action: `facility.ts` was brought in line with `enquiries.ts`. Same URL emitted;
the divergent pattern is gone. This was the only behaviour-equivalent duplication
consolidated.

## Found but deliberately NOT merged

### The bulk model/serializer import block (11 view modules)
Every view module carried an identical copy of the full `from ..models import`
and `from ..serializers import` blocks. This is *duplicate text*, not duplicate
*logic* — the fix is trimming each to what it uses (done, see `dead-code.md`),
not extracting a shared abstraction. Consolidating imports behind a helper would
add indirection for no benefit.

### The public split-posture view pattern (`enquiries_view`, `facility_bookings_view`)
Both hand-roll the same "POST is public, GET authenticates + checks IsDoctor by
hand" block. It looks duplicated, but each is a deliberate, documented exception
to the app's one-permission-per-view rule, and the two differ in their payloads.
**Not merged** — extracting it would create a shared abstraction over security
code, which is exactly where a "looks similar" merge is most dangerous. Flagged
in `remaining-work.md` as a possible future helper, for review only.
