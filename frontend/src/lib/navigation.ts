type Navigator = (path: string) => void;

// Used until the router registers, and it cannot be a bare path: production
// serves the SPA under /app (scripts/build-all.sh), so `/login` would land on the
// marketing site rather than the app. A native shell has no such prefix, and
// BASE_URL is '/' there.
let navigator: Navigator = (path) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  window.location.assign(`${base}${path}`);
};

export function setNavigator(next: Navigator): void {
  navigator = next;
}

// Navigates from outside the React tree — the fetch interceptor and the error
// boundary both need it. A full document load would work on the web but throws
// away the whole app in a native shell.
export function navigateTo(path: string): void {
  navigator(path);
}
