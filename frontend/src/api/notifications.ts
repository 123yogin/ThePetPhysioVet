import { http } from '../lib/http';
import { NotificationItem } from '../lib/types';

export async function fetchNotifications(): Promise<{ results: NotificationItem[]; unread_count: number }> {
  return http('/notifications');
}

export async function markAllNotificationsRead(): Promise<void> {
  return http('/notifications/mark-all-read', { method: 'POST' });
}

export async function fetchNotificationPrefs(ownerPhone: string): Promise<any> {
  return http(`/notification-prefs?owner_phone=${encodeURIComponent(ownerPhone)}`);
}

export async function updateNotificationPrefs(data: { owner_phone: string; sms_opt_out: boolean }): Promise<any> {
  return http('/notification-prefs', {
    method: 'PUT',
    data,
  });
}
