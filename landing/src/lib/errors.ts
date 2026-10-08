/**
 * Error text from the clinic API, made fit for a visitor (live QA D3).
 *
 * The API flattens a validation error to `"<field>: <message>"`, so visitors
 * read "phone: Enter a phone number…" or "ownerPhone: …". Strip an
 * identifier-looking prefix; when the message is the generic "This field …"
 * phrasing, keep the field's name in plain words instead.
 */
const FIELD_PREFIX = /^([A-Za-z_][A-Za-z0-9_]*(?:\.\d+)?):\s+([\s\S]+)$/;

function humanField(field: string): string {
  const words = field
    .replace(/\.\d+$/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function friendlyApiError(raw: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return fallback;
  const m = FIELD_PREFIX.exec(text);
  if (!m) return text;
  const [, field, rest] = m;
  if (field === 'non_field_errors' || field === 'detail') return rest;
  if (/^This field (may not be blank|is required|may not be null)\.?$/i.test(rest)) {
    return `${humanField(field)} is required.`;
  }
  if (/^This field\b/i.test(rest)) return `${humanField(field)} — ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
  return rest;
}

/** 10-15 digits with an optional leading +; spaces, dashes and brackets are
 *  fine. The same rule the server applies, checked before sending. */
export function isPlausiblePhone(value: string): boolean {
  return /^\+?\d{10,15}$/.test(value.replace(/[\s\-.() ]/g, ''));
}

export const PHONE_HINT = 'Enter a 10-digit mobile number, e.g. 98765 43210.';
