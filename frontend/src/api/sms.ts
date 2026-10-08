import { http } from '../lib/http';

export type SmsMode = 'android_gateway' | 'console' | 'disabled';

export type SmsStatus =
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'SKIPPED_OPTOUT'
  | 'SKIPPED_LIMIT'
  | 'SKIPPED_COUNTRY'
  | 'SKIPPED_DISABLED';

export interface SmsLogEntry {
  id: string;
  created_at: string;
  sent_at: string | null;
  /** Masked by the server: only the last four digits are real. */
  to: string;
  kind: string;
  status: SmsStatus;
  error: string;
  provider: string;
}

export interface SmsLogPage {
  mode: SmsMode;
  sent_today: number;
  daily_limit: number;
  count: number;
  page: number;
  page_size: number;
  results: SmsLogEntry[];
}

export async function fetchSmsLog(page = 1, pageSize = 20): Promise<SmsLogPage> {
  return http(`/sms/log?page=${page}&page_size=${pageSize}`);
}

export async function sendTestSms(to: string): Promise<SmsLogEntry> {
  return http('/sms/test', { method: 'POST', data: { to } });
}
