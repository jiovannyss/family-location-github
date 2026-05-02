import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import {
  listInboxApi,
  markReadApi,
  sendToAllSharedCirclesApi,
  type MessageRow,
} from '@/services/api/messages';
import { notifications } from '@/services/notifications';
import { getQuestionByCode } from '@/lib/quickMessages';

export function useMessages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: messages, isLoading } = useQuery({
    queryKey: ['messages', user?.id],
    queryFn: () => (user ? listInboxApi(user.id) : Promise.resolve([])),
    enabled: !!user,
  });

  // Realtime: refresh on any change involving the current user
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`messages:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          const row = (payload.new || payload.old) as MessageRow | undefined;
          if (!row) return;
          if (row.sender_id !== user.id && row.recipient_id !== user.id) return;

          // Notify on incoming message addressed to me
          if (
            payload.eventType === 'INSERT' &&
            row.recipient_id === user.id &&
            row.sender_id !== user.id
          ) {
            notifications.notify({
              title: 'Ново съобщение',
              body: row.body,
            });
          }

          queryClient.invalidateQueries({ queryKey: ['messages', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const unreadCount = useMemo(() => {
    if (!user || !messages) return 0;
    return messages.filter((m) => m.recipient_id === user.id && !m.read_at).length;
  }, [messages, user?.id]);

  const markRead = useMutation({
    mutationFn: (messageId: string) => markReadApi(messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', user?.id] });
    },
  });

  return {
    messages: messages ?? [],
    unreadCount,
    isLoading,
    markRead: markRead.mutate,
  };
}

export function useSendQuickMessage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      recipientId: string;
      sharedCircleIds: string[];
      kind: 'question' | 'answer';
      code: string;
      body: string;
      inReplyTo?: string | null;
    }) => {
      if (!user) throw new Error('Not authenticated');
      return sendToAllSharedCirclesApi({
        senderId: user.id,
        ...args,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', user?.id] });
    },
  });
}

/**
 * Convenience: given a question code, returns the predefined answer options
 * (used by the recipient when replying).
 */
export function useAnswersForQuestion(questionCode: string | null | undefined) {
  return useMemo(() => {
    if (!questionCode) return [];
    return getQuestionByCode(questionCode)?.answers ?? [];
  }, [questionCode]);
}
