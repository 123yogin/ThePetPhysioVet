import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

const ACCESS_KEY = 'petphysio_access_token';
const REFRESH_KEY = 'petphysio_refresh_token';

interface TokenStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// Web stays on localStorage rather than routing through the plugin's own web
// fallback, which prefixes keys with `capacitor-storage_` and would orphan every
// existing session the moment this ships.
const webStore: TokenStore = {
  async getItem(key) {
    return localStorage.getItem(key);
  },
  async setItem(key, value) {
    localStorage.setItem(key, value);
  },
  async removeItem(key) {
    localStorage.removeItem(key);
  },
};

// The keychain is the right place for a session token, but it can refuse a
// write for reasons that have nothing to do with this app being correct: a
// missing entitlement, a locked device, a restore from backup, an MDM policy.
// It did exactly that on iOS — every write failed with -34018
// (errSecMissingEntitlement), so `setTokens` rejected *after* POST /auth/login
// had already returned 200, the login mutation threw, and the user was left on
// the sign-in screen reading "An OS error occurred (-34018)". Sign-in was
// impossible on the whole platform.
//
// So the keychain is now preferred, not required. The first failure demotes
// this process to localStorage for the rest of its life — still sandboxed to
// this app, and the tokens are short-lived and refreshable — because a session
// the user cannot start is worse than a session stored one notch less well.
// `storeKind` records which one is live so this is diagnosable rather than
// invisible.
let secureStorageUsable = Capacitor.isNativePlatform();

const nativeStore: TokenStore = {
  async getItem(key) {
    if (secureStorageUsable) {
      try {
        const value = await SecureStorage.getItem(key);
        return typeof value === 'string' ? value : null;
      } catch {
        secureStorageUsable = false;
      }
    }
    return webStore.getItem(key);
  },
  async setItem(key, value) {
    if (secureStorageUsable) {
      try {
        await SecureStorage.setItem(key, value);
        return;
      } catch {
        secureStorageUsable = false;
      }
    }
    await webStore.setItem(key, value);
  },
  async removeItem(key) {
    if (secureStorageUsable) {
      try {
        await SecureStorage.removeItem(key);
      } catch {
        secureStorageUsable = false;
      }
    }
    // Always clear the fallback too. A token left behind in localStorage after
    // a sign-out — because an earlier write had been demoted — would be picked
    // up by loadTokens() and silently restore the previous user's session.
    await webStore.removeItem(key);
  },
};

const store: TokenStore = Capacitor.isNativePlatform() ? nativeStore : webStore;

export function storeKind(): 'keychain' | 'local' {
  return secureStorageUsable ? 'keychain' : 'local';
}

// The store is async, but getAccessToken() is read synchronously on every request
// and during render. loadTokens() fills this cache before the first render, which
// keeps the getters synchronous and their call sites untouched.
let accessToken: string | null = null;
let refreshToken: string | null = null;

export async function loadTokens(): Promise<void> {
  [accessToken, refreshToken] = await Promise.all([
    store.getItem(ACCESS_KEY),
    store.getItem(REFRESH_KEY),
  ]);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export async function setTokens(access: string, refresh?: string): Promise<void> {
  accessToken = access;
  await store.setItem(ACCESS_KEY, access);
  if (refresh) {
    refreshToken = refresh;
    await store.setItem(REFRESH_KEY, refresh);
  }
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  await Promise.all([store.removeItem(ACCESS_KEY), store.removeItem(REFRESH_KEY)]);
}
