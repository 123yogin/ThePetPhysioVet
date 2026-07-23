// Minimal fetch wrapper for the DRF backend.
// Session auth + CSRF is retained server-side, so we keep credentials:'include'
// and attach the csrftoken cookie as X-CSRFToken on mutating requests. Sprint 6
// (Auth Hardening) additionally carries a short-TTL JWT: when an access token is
// present we attach `Authorization: Bearer <access>`, and on a 401 we transparently
// refresh once (rotating refresh token) and retry the original request. Same-origin
// in dev via the Vite proxy, so no CORS handling is needed.

import { getAccess, getRefresh, setTokens, clearTokens } from "./tokens";

const API_BASE = "/api/v1";

// Auth endpoints must never trigger a refresh/retry — refreshing off their own
// 401 would loop. (login / refresh / signup issue or rotate tokens directly.)
const AUTH_NO_REFRESH = ["/auth/login", "/auth/refresh", "/auth/signup"];

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[2]) : null;
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, data: unknown, message?: string) {
    super(message ?? `API error ${status}`);
    this.status = status;
    this.data = data;
  }
}

function shouldTryRefresh(path: string): boolean {
  return !AUTH_NO_REFRESH.some((p) => path === p || path.startsWith(p + "?"));
}

// Single-flight refresh: concurrent 401s share ONE in-flight refresh promise so
// they don't stampede the endpoint or rotate the refresh token multiple times.
let refreshPromise: Promise<string> | null = null;

async function performRefresh(): Promise<string> {
  const refresh = getRefresh();
  if (!refresh) throw new ApiError(401, null, "No refresh token");

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const csrf = getCookie("csrftoken");
  if (csrf) headers["X-CSRFToken"] = csrf;

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) throw new ApiError(res.status, null, "Token refresh failed");

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!data || !data.access || !data.refresh) {
    throw new ApiError(500, data, "Malformed refresh response");
  }
  setTokens({ access: data.access, refresh: data.refresh });
  return data.access as string;
}

function refreshTokens(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// Refresh failed (or none available): behave exactly like an unauthenticated
// session today — drop tokens and send the user to /login.
function onRefreshFailure(): void {
  clearTokens();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | undefined>;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, params } = opts;

  let url = `${API_BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") qs.set(k, v);
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const isMutation = method !== "GET" && method !== "HEAD";

  const doFetch = (accessToken: string | null) => {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (isMutation) {
      const csrf = getCookie("csrftoken");
      if (csrf) headers["X-CSRFToken"] = csrf;
    }
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

    return fetch(url, {
      method,
      credentials: "include",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doFetch(getAccess());

  if (res.status === 401 && shouldTryRefresh(path) && getRefresh()) {
    try {
      const newAccess = await refreshTokens();
      res = await doFetch(newAccess);
    } catch {
      onRefreshFailure();
      // fall through: the original 401 is surfaced as an ApiError below, exactly
      // as an unauthenticated request is today.
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export interface UploadOptions {
  method?: string; // default POST (use PATCH/PUT for replace)
  onProgress?: (percent: number) => void;
}

// Multipart upload helper for FileField endpoints (diagnosis upload / replace).
// Deliberately separate from api(): we must NOT set Content-Type so the browser
// writes the multipart boundary itself, and we use XMLHttpRequest so the caller
// can render real upload progress. CSRF + cookies + Bearer + 401 refresh are
// handled exactly like api().
export function apiUpload<T>(
  path: string,
  form: FormData,
  opts: UploadOptions = {},
): Promise<T> {
  const method = opts.method ?? "POST";
  const url = `${API_BASE}${path}`;

  const send = (accessToken: string | null): Promise<{ status: number; data: unknown }> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.withCredentials = true;
      xhr.setRequestHeader("Accept", "application/json");
      const csrf = getCookie("csrftoken");
      if (csrf) xhr.setRequestHeader("X-CSRFToken", csrf);
      if (accessToken) xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);

      if (xhr.upload && opts.onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) opts.onProgress!(Math.round((e.loaded / e.total) * 100));
        };
      }

      xhr.onload = () => {
        const text = xhr.responseText;
        let data: unknown = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = text;
        }
        resolve({ status: xhr.status, data });
      };
      xhr.onerror = () => reject(new ApiError(0, null, "Network error during upload"));

      xhr.send(form);
    });

  const finish = (status: number, data: unknown): T => {
    if (status >= 200 && status < 300) {
      return (status === 204 ? undefined : data) as T;
    }
    throw new ApiError(status, data);
  };

  return (async () => {
    let { status, data } = await send(getAccess());

    if (status === 401 && shouldTryRefresh(path) && getRefresh()) {
      try {
        const newAccess = await refreshTokens();
        ({ status, data } = await send(newAccess));
      } catch {
        onRefreshFailure();
      }
    }

    return finish(status, data);
  })();
}
