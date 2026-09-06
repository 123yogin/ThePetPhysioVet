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

const store: TokenStore = Capacitor.isNativePlatform() ? SecureStorage : webStore;

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
