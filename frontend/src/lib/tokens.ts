// JWT token store over localStorage (Sprint 6 — Auth Hardening, SRS §3.1 + §4).
// Session auth is retained server-side, but the SPA now also carries a short-TTL
// Bearer access token with a rotating refresh token. These helpers are the single
// place that reads/writes those tokens; http.ts and api/auth.ts use them.

const ACCESS_KEY = "pp_access";
const REFRESH_KEY = "pp_refresh";

export interface Tokens {
  access: string;
  refresh: string;
}

export function getAccess(): string | null {
  try {
    return localStorage.getItem(ACCESS_KEY);
  } catch {
    return null;
  }
}

export function getRefresh(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function setTokens({ access, refresh }: Tokens): void {
  try {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  } catch {
    // localStorage unavailable (private mode / quota) — session cookie still works.
  }
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    // no-op
  }
}
