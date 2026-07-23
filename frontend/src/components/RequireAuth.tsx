import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useMe } from "../api/auth";

// Guards the app routes: calls the live useMe() (GET /auth/me) and redirects to
// /login when unauthenticated. isLoading -> render null (no flash); a 401/error
// or no data -> Navigate to /login; success -> render the guarded route.
//
// Sprint 6 (Auth Hardening) verification — no logic change is needed here:
//  - Tokens absent/cleared (e.g. right after logout): GET /auth/me 401s; http.ts
//    finds no refresh token in the store so it does NOT attempt a refresh/retry,
//    useMe surfaces isError, and we redirect to /login. Because isLoading returns
//    null (not the guarded UI), the redirect happens with no flash/flicker.
//  - Silent refresh-retry (access expired but refresh still valid): http.ts
//    transparently refreshes and retries /auth/me inside the SAME query, so useMe
//    resolves to success with data. No isError, so no <Navigate>, no route change
//    and no layout shift on the authenticated screen (US-AUTH-02 parity holds).
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useMe();

  if (isLoading) return null;
  if (isError || !data) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
