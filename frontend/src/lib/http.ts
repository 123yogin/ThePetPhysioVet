import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './tokens';
import { navigateTo } from './navigation';

// Endpoints that must never trigger a refresh attempt on 401 — attempting to
// refresh for any of these would either be nonsensical (login/signup are
// unauthenticated) or loop forever (refresh itself).
const NO_REFRESH_PATHS = [
  '/auth/login',
  '/auth/signup',
  '/auth/refresh',
  // Password reset is the flow a locked-out user reaches for, and they often
  // still have a stale access token in localStorage from an old session. DRF
  // applies JWTAuthentication globally, so an expired bearer token 401s these
  // routes *before* their AllowAny permission is consulted. Without this
  // exemption the interceptor would then try to refresh with an equally dead
  // refresh token, fail, clear storage and bounce the user to /login —
  // silently killing the very reset they were in the middle of.
  '/auth/password-reset/request',
  '/auth/password-reset/confirm',
];

function isAuthExemptPath(endpoint: string): boolean {
  const path = endpoint.split('?')[0];
  return NO_REFRESH_PATHS.some((exempt) => path === exempt || path.endsWith(exempt));
}

// Native builds have no proxy and their document origin is the app bundle
// (`capacitor://localhost`), so a relative `/api/v1/...` resolves against the bundle
// and never reaches the server. Empty on web, where the origin already serves /api.
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

function apiUrl(endpoint: string): string {
  if (endpoint.startsWith('http')) {
    return endpoint;
  }
  const path = endpoint.startsWith('/api')
    ? endpoint
    : `/api/v1${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  return `${API_BASE}${path}`;
}

function redirectToLogin(): void {
  navigateTo('/login');
}

// Module-level in-flight promise. Every 401 that needs a refresh awaits this
// same promise instead of starting its own — so five parallel queries that
// all 401 at once still trigger exactly one POST /auth/refresh. The promise
// is cleared (in `finally`) once it settles, so the *next* expiry cycle
// starts a fresh refresh rather than reusing a stale resolved/rejected one.
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise;
  }

  const refresh = getRefreshToken();
  if (!refresh) {
    await clearTokens();
    redirectToLogin();
    throw new Error('Session expired. Please log in again.');
  }

  refreshPromise = (async () => {
    let response: Response;
    try {
      const refreshTimeout = withTimeout(REQUEST_TIMEOUT_MS);
      try {
        response = await fetch(apiUrl('/auth/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh }),
          signal: refreshTimeout.signal,
        });
      } finally {
        refreshTimeout.done();
      }
    } catch (err) {
      // Network failure — do not clear tokens or bounce, this may be
      // transient. Let the caller surface the original error.
      throw err instanceof Error ? err : new Error('Network request failed');
    }

    if (!response.ok) {
      await clearTokens();
      redirectToLogin();
      throw new Error('Session expired. Please log in again.');
    }

    const data = await response.json().catch(() => ({}));
    if (!data.access) {
      await clearTokens();
      redirectToLogin();
      throw new Error('Session expired. Please log in again.');
    }

    // /auth/refresh rotates: it returns a new refresh token and blacklists the
    // one we just presented. Store both, or the next refresh sends a
    // blacklisted token and the user is logged out anyway. `data.refresh` is
    // optional so a non-rotating server still works.
    await setTokens(data.access, data.refresh);
    return data.access as string;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

// Nothing in this client ever timed out. On a flaky connection — which is the
// normal case for a phone in a consulting room — fetch simply hangs, so the user
// sees a spinner with no error and no retry, and taps again. That is how the
// duplicate-booking defect got its second submission.
//
// Generous rather than snappy: the API is serverless and a cold start plus a
// Neon resume is genuinely slow. Uploads get longer still, because a photo over
// mobile data legitimately takes a while.
const REQUEST_TIMEOUT_MS = 20000;
const UPLOAD_TIMEOUT_MS = 120000;

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

export async function http<T = any>(
  endpoint: string,
  options: RequestInit & { data?: any } = {},
  _isRetry = false
): Promise<T> {
  const { data, headers: customHeaders, ...customConfig } = options;

  const url = apiUrl(endpoint);

  // Never send a bearer token to a route that exists for people who do not have
  // a usable one. DRF applies JWTAuthentication globally and SimpleJWT *raises*
  // on an expired token, so the 401 lands before AllowAny is consulted: sending
  // a stale token to /auth/login made correct credentials fail, and the user
  // stayed locked out because the dead token was still in storage on the next
  // attempt. The server-side fix is `authentication_classes([])` on those views;
  // this is the other half, and it is what the request should have looked like
  // regardless — a login is not an authenticated call.
  const token = isAuthExemptPath(endpoint) ? null : getAccessToken();
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(customHeaders as Record<string, string>),
  };

  let body: any = options.body;
  if (data) {
    if (data instanceof FormData) {
      body = data;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(data);
    }
  }

  const timeout = withTimeout(data instanceof FormData ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  const config: RequestInit = {
    method: data ? 'POST' : 'GET',
    headers,
    body,
    signal: timeout.signal,
    ...customConfig,
  };

  let response: Response;
  try {
    response = await fetch(url, config);
  } catch (err) {
    // An abort here is our own timer, not the user navigating away: this
    // function never exposes a signal for a caller to abort with.
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('The server took too long to respond. Check your connection and try again.');
    }
    throw err;
  } finally {
    timeout.done();
  }

  // On a 401 from any endpoint except login/signup/refresh, try exactly one
  // silent refresh-and-retry before giving up. `options` (and therefore
  // `data`) is the original caller-supplied object, untouched by the first
  // fetch — `data` is only ever converted into `body` here, inside this
  // function, never consumed as a stream beforehand. So re-invoking `http`
  // with the same `endpoint`/`options` rebuilds an equivalent request from
  // scratch (including a fresh Authorization header with the new access
  // token), which also sidesteps the "FormData can't be replayed" problem —
  // we never resend the already-sent FormData instance, we hand the browser
  // the same FormData object again and let it re-serialize it for a brand
  // new request.
  if (response.status === 401 && !_isRetry && !isAuthExemptPath(endpoint)) {
    try {
      await refreshAccessToken();
    } catch (refreshError) {
      throw refreshError instanceof Error ? refreshError : new Error('Session expired. Please log in again.');
    }
    return http<T>(endpoint, options, true);
  }

  if (!response.ok) {
    if (response.status === 204) {
      return {} as T;
    }
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.detail || errorData.message || response.statusText;
    throw new Error(message || 'Network request failed');
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}
