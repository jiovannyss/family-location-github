/**
 * Notifications abstraction layer.
 *
 * Web: in-app toast (sonner) + best-effort Web Notifications when tab is hidden.
 * Native (Capacitor): in-app toast + LocalNotifications for OS-level banner
 * (Push Notifications изискват FCM/APNs setup и се добавят отделно).
 */
import { toast } from 'sonner';
import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from './platform';

export interface NotificationPayload {
  title: string;
  body?: string;
  onClick?: () => void;
}

export interface NotificationsService {
  requestPermission(): Promise<'granted' | 'denied' | 'default'>;
  notify(payload: NotificationPayload): Promise<void>;
}

class WebNotifications implements NotificationsService {
  async requestPermission(): Promise<'granted' | 'denied' | 'default'> {
    if (typeof Notification === 'undefined') return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    try { return await Notification.requestPermission(); } catch { return 'default'; }
  }

  async notify(payload: NotificationPayload): Promise<void> {
    toast(payload.title, {
      description: payload.body,
      action: payload.onClick ? { label: 'Виж', onClick: () => payload.onClick?.() } : undefined,
    });
    if (
      typeof document !== 'undefined' && document.visibilityState === 'hidden' &&
      typeof Notification !== 'undefined' && Notification.permission === 'granted'
    ) {
      try {
        const n = new Notification(payload.title, { body: payload.body });
        if (payload.onClick) n.onclick = () => payload.onClick?.();
      } catch { /* ignore */ }
    }
  }
}

class NativeNotifications implements NotificationsService {
  async requestPermission(): Promise<'granted' | 'denied' | 'default'> {
    try {
      const r = await LocalNotifications.checkPermissions();
      if (r.display === 'granted') return 'granted';
      if (r.display === 'denied') return 'denied';
      const req = await LocalNotifications.requestPermissions();
      if (req.display === 'granted') return 'granted';
      if (req.display === 'denied') return 'denied';
      return 'default';
    } catch { return 'default'; }
  }

  async notify(payload: NotificationPayload): Promise<void> {
    toast(payload.title, {
      description: payload.body,
      action: payload.onClick ? { label: 'Виж', onClick: () => payload.onClick?.() } : undefined,
    });
    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: Math.floor(Math.random() * 2_000_000_000),
          title: payload.title,
          body: payload.body ?? '',
          schedule: { at: new Date(Date.now() + 50) },
        }],
      });
    } catch { /* ignore */ }
  }
}

export const notifications: NotificationsService = isNative() ? new NativeNotifications() : new WebNotifications();
