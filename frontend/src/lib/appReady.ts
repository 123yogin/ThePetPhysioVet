/**
 * Tells the launch frame in index.html when the app is genuinely on screen.
 *
 * That frame used to leave as soon as React rendered anything, which meant it
 * handed over to "Loading session..." — the auth check is still in flight at
 * that point, and on a cold serverless start it can take a second. A branded
 * splash dropping the user onto bare loading text is worse than holding the
 * splash, so the frame now waits for this signal instead.
 *
 * Called wherever the session question is answered: the two route guards once
 * their query settles, and the login screen, which needs no session at all.
 * It is a plain DOM flag rather than React state because the reader is an
 * inline script that runs before the bundle loads.
 */
export function markAppReady(): void {
  document.documentElement.dataset.appReady = '1';
}
