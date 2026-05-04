import { useAppBadgeSync } from '@/hooks/useAppBadge';
import { useAuth } from '@/hooks/useAuth';

/**
 * Държи badge-а на иконата на приложението синхронизиран с броя
 * непрочетени съобщения, независимо на коя страница е потребителят.
 * Поставя се веднъж най-горе в дървото (под AuthProvider).
 */
export function AppBadgeSync() {
  const { user } = useAuth();
  // useAppBadgeSync чете useMessages, който изисква user — рендираме само ако има.
  if (!user) return null;
  return <BadgeSyncInner />;
}

function BadgeSyncInner() {
  useAppBadgeSync();
  return null;
}
