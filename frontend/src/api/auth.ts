import { http } from '../lib/http';
import { setTokens, clearTokens, getRefreshToken } from '../lib/tokens';
import { User } from '../lib/types';
import { queryClient } from './queryClient';

export async function fetchMe(): Promise<User> {
  return http<User>('/auth/me');
}

export async function login(username: string, password?: string, role?: string): Promise<User> {
  const data = await http<User & { access: string; refresh: string }>('/auth/login', {
    method: 'POST',
    data: { username, password, role },
  });
  if (data.access) {
    setTokens(data.access, data.refresh);
  }
  // Seed ['me'] with the identity we were just handed. Without this the first
  // render after login can read a PREVIOUS user's cached profile (staleTime is
  // 30s), which decides both the RequireAuth role gate and which nav the
  // sidebar draws -- so signing in as an owner within 30s of a doctor signing
  // out would bounce them to /dashboard showing the doctor's name.
  queryClient.setQueryData(['me'], data);
  return data;
}

export async function signup(userData: Record<string, any>): Promise<User> {
  const data = await http<User & { access: string; refresh: string }>('/auth/signup', {
    method: 'POST',
    data: userData,
  });
  if (data.access) {
    setTokens(data.access, data.refresh);
  }
  queryClient.setQueryData(['me'], data);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await http('/auth/logout', { method: 'POST', data: { refresh: getRefreshToken() } });
  } finally {
    clearTokens();
    // Drop every cached response, not just ['me']. The cache holds one user's
    // pets, invoices and appointments; leaving it in place means the next
    // person to sign in on this browser can be shown the previous user's data
    // until each query goes stale.
    queryClient.clear();
  }
}

export async function updateProfile(data: Partial<User>): Promise<User> {
  return http<User>('/auth/profile', {
    method: 'PATCH',
    data,
  });
}
