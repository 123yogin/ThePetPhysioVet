import { http } from '../lib/http';

export async function fetchNotificationPrefs(ownerPhone: string): Promise<any> {
  return http(`/notification-prefs?owner_phone=${encodeURIComponent(ownerPhone)}`);
}

export async function updateNotificationPrefs(data: { owner_phone: string; sms_opt_out: boolean }): Promise<any> {
  return http('/notification-prefs', {
    method: 'PUT',
    data,
  });
}
