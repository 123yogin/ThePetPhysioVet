// Auth hooks. Endpoints: /auth/me, /auth/login, /auth/logout, /auth/signup.
// GET /auth/me is wrapped in ensure_csrf_cookie server-side, so calling it on
// app load plants the csrftoken cookie whether it returns 200 (authed) or 401
// (anon) — the first login/signup POST then already carries X-CSRFToken.
//
// Sprint 6 (Auth Hardening): login/signup now also return a JWT {access, refresh}
// pair alongside the Me fields. We persist them via the token store so http.ts can
// attach the Bearer header and refresh on 401. Logout sends the refresh token so
// the server can blacklist it, then clears the local store. Bearer is attached by
// http.ts, so useMe needs no changes.

import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/http";
import { setTokens, clearTokens, getRefresh } from "../lib/tokens";
import type { Me } from "../lib/types";

// login / signup response = the Me fields plus the issued JWT pair.
export type LoginResponse = Me & { access: string; refresh: string };

export function useMe() {
  return useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => api<Me>("/auth/me"),
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (creds: { username: string; password: string }) =>
      api<LoginResponse>("/auth/login", { method: "POST", body: creds }),
    onSuccess: (data) => {
      setTokens({ access: data.access, refresh: data.refresh });
    },
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: () =>
      api<void>("/auth/logout", { method: "POST", body: { refresh: getRefresh() } }),
    onSuccess: () => {
      clearTokens();
    },
    onError: () => {
      // Even if the server call fails, drop local tokens so the client is logged out.
      clearTokens();
    },
  });
}

export interface SignupPayload {
  username: string;
  email: string;
  first_name: string;
  last_name?: string;
  clinic_name?: string;
  clinic_address?: string;
  password1: string;
  password2: string;
}

export function useSignup() {
  return useMutation({
    mutationFn: (payload: SignupPayload) =>
      api<LoginResponse>("/auth/signup", { method: "POST", body: payload }),
    onSuccess: (data) => {
      setTokens({ access: data.access, refresh: data.refresh });
    },
  });
}
