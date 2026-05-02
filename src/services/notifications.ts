/**
 * Notifications abstraction layer.
 *
 * Web: in-app toast (sonner). Optional Web Notifications API kept opt-in.
 * Capacitor: swap with @capacitor/push-notifications + @capacitor/local-notifications
 * (and Firebase Cloud Messaging). Keep the public API identical.
 */
import { toast } from 'sonner';

export interface NotificationPayload {
  title: string;
  body?: string;
  /** Optional callback when the user taps the notification (in-app for web). */
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
    try {
      const result = await Notification.requestPermission();
      return result;
    } catch {
      return 'default';
    }
  }

  async notify(payload: NotificationPayload): Promise<void> {
    // Always show in-app toast (works regardless of OS permissions)
    toast(payload.title, {
      description: payload.body,
      action: payload.onClick
        ? { label: 'Виж', onClick: () => payload.onClick?.() }
        : undefined,
    });

    // Best-effort native browser notification when tab is hidden
    if (
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden' &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      try {
        const n = new Notification(payload.title, { body: payload.body });
        if (payload.onClick) n.onclick = () => payload.onClick?.();
      } catch {
        // ignore
      }
    }
  }
}

export const notifications: NotificationsService = new WebNotifications();
