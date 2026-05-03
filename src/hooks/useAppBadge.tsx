import { useEffect } from 'react';
import { useMessages } from './useMessages';
import { setAppBadge } from '@/services/appBadge';

/**
 * Синхронизира броя непрочетени съобщения с badge-а на иконата на приложението.
 */
export function useAppBadgeSync() {
  const { unreadCount } = useMessages();
  useEffect(() => {
    void setAppBadge(unreadCount);
  }, [unreadCount]);
}
