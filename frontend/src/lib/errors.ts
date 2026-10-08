/**
 * Server error text, made fit for a person (live QA D3).
 *
 * The API flattens a validation error to `"<field>: <message>"`, so users read
 * "phone: Enter a phone number…" or "password: This password is too common.".
 * Strip an identifier-looking prefix; when the message itself is the generic
 * "This field …" phrasing, keep the field's name in plain words instead.
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

export function friendlyErrorMessage(raw: string): string {
  const m = FIELD_PREFIX.exec((raw || '').trim());
  if (!m) return raw;
  const [, field, rest] = m;
  if (field === 'non_field_errors' || field === 'detail') return rest;
  if (/^This field (may not be blank|is required|may not be null)\.?$/i.test(rest)) {
    return `${humanField(field)} is required.`;
  }
  if (/^This field\b/i.test(rest)) return `${humanField(field)} — ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
  return rest;
}

/** 10-15 digits, optional leading +, spaces/dashes/brackets allowed — the same
 *  rule the server applies, checked before submit so a typo is caught here. */
export function isPlausiblePhone(value: string): boolean {
  const cleaned = value.replace(/[\s\-.() ]/g, '');
  return /^\+?\d{10,15}$/.test(cleaned);
}

export const PHONE_HINT = 'Enter a 10-digit mobile number, e.g. 98765 43210 (a +91 prefix is fine).';
