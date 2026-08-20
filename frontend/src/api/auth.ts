import { http } from '../lib/http';
import { setTokens, clearTokens, getRefreshToken } from '../lib/tokens';
import { User } from '../lib/types';

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
  return data;
}

export async function logout(): Promise<void> {
  try {
    await http('/auth/logout', { method: 'POST', data: { refresh: getRefreshToken() } });
  } finally {
    clearTokens();
  }
}

export async function updateProfile(data: Partial<User>): Promise<User> {
  return http<User>('/auth/profile', {
    method: 'PATCH',
    data,
  });
}
