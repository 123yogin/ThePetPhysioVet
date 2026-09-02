import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './tokens';

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

function redirectToLogin(): void {
  if (typeof window !== 'undefined') {
    window.location.assign('/login');
  }
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
    clearTokens();
    redirectToLogin();
    throw new Error('Session expired. Please log in again.');
  }

  refreshPromise = (async () => {
    let response: Response;
    try {
      response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });
    } catch (err) {
      // Network failure — do not clear tokens or bounce, this may be
      // transient. Let the caller surface the original error.
      throw err instanceof Error ? err : new Error('Network request failed');
    }

    if (!response.ok) {
      clearTokens();
      redirectToLogin();
      throw new Error('Session expired. Please log in again.');
    }

    const data = await response.json().catch(() => ({}));
    if (!data.access) {
      clearTokens();
      redirectToLogin();
      throw new Error('Session expired. Please log in again.');
    }

    // /auth/refresh rotates: it returns a new refresh token and blacklists the
    // one we just presented. Store both, or the next refresh sends a
    // blacklisted token and the user is logged out anyway. `data.refresh` is
    // optional so a non-rotating server still works.
    setTokens(data.access, data.refresh);
    return data.access as string;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function http<T = any>(
  endpoint: string,
  options: RequestInit & { data?: any } = {},
  _isRetry = false
): Promise<T> {
  const { data, headers: customHeaders, ...customConfig } = options;

  let url = endpoint;
  if (!url.startsWith('http')) {
    if (!url.startsWith('/api')) {
      url = `/api/v1${url.startsWith('/') ? '' : '/'}${url}`;
    }
  }

  const token = getAccessToken();
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

  const config: RequestInit = {
    method: data ? 'POST' : 'GET',
    headers,
    body,
    ...customConfig,
  };

  const response = await fetch(url, config);

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
