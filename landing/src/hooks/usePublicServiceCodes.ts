import { useEffect, useState } from 'react';

// Same origin in production; overridable in local dev, matching BookingForm.
import { getJson } from '../lib/clinicApi';

/**
 * Visit-type codes the clinic currently offers the public, from its own API.
 *
 * `/appointment-options` is the single source of truth for this vocabulary --
 * three booking forms once each invented their own and every submission 400'd.
 * A card, or a preselected service, whose code is missing here is not offered,
 * rather than posting a value the API would reject.
 *
 * Shared because the booking panel and the service tiles both need it, and
 * they must not disagree about what is bookable.
 */
export function usePublicServiceCodes(): string[] {
  const [codes, setCodes] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    getJson('/appointment-options')
      .then((data) => {
        if (cancelled || !data?.visit_types) return;
        setCodes(
          data.visit_types
            .filter((v: { public?: boolean }) => v.public)
            .map((v: { value: string }) => v.value),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return codes;
}
