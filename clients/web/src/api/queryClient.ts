import { QueryClient, QueryCache } from "@tanstack/react-query";
import { ApiError } from "../lib/http";

// Global mid-session 401 handling: if any query (other than the ['me']
// bootstrap, which RequireAuth already drives) fails with a 401, the session
// has expired. Clear the cached doctor so RequireAuth flips to unauthenticated
// and send the user to /login. Guarded against the /login and /signup pages so
// the redirect can't loop.
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (error instanceof ApiError && error.status === 401) {
        if (query.queryKey[0] === "me") return;
        queryClient.removeQueries({ queryKey: ["me"] });
        const path = window.location.pathname;
        if (path !== "/login" && path !== "/signup") {
          window.location.assign("/login");
        }
      }
    },
  }),
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});
