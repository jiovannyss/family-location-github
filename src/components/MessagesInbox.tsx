import { useState } from 'react';
import { Bell, Check, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMessages, useSendQuickMessage } from '@/hooks/useMessages';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { getQuestionByCode } from '@/lib/quickMessages';
import { formatDistanceToNow } from 'date-fns';
import { bg } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Message } from '@/lib/types';

function timeAgo(d: string) {
  try {
    return formatDistanceToNow(new Date(d), { addSuffix: true, locale: bg });
  } catch {
    return '';
  }
}

export default function MessagesInbox() {
  const { user } = useAuth();
  const { messages, unreadCount, markRead } = useMessages();
  const sendMessage = useSendQuickMessage();
  const [open, setOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  if (!user) return null;

  // Show only inbound messages in the inbox view; the sender already knows what they sent.
  const inbound = messages.filter((m) => m.recipient_id === user.id);

  const handleReply = async (msg: Message, code: string, body: string) => {
    setReplyingTo(msg.id);
    try {
      const myCircleIds = await supabase
        .from('circle_members')
        .select('circle_id')
        .eq('user_id', user.id)
        .eq('status', 'accepted');
      if (myCircleIds.error) throw myCircleIds.error;
      const myIds = (myCircleIds.data ?? []).map((r) => r.circle_id);

      const { data: shared, error } = await supabase
        .from('circle_members')
        .select('circle_id')
        .eq('user_id', msg.sender_id)
        .eq('status', 'accepted')
        .in('circle_id', myIds);
      if (error) throw error;
      const sharedIds = Array.from(new Set((shared ?? []).map((r) => r.circle_id)));
      if (sharedIds.length === 0) throw new Error('Нямате общи кръгове');

      await new Promise<void>((resolve, reject) => {
        sendMessage.mutate(
          {
            recipientId: msg.sender_id,
            sharedCircleIds: sharedIds,
            kind: 'answer',
            code,
            body,
            inReplyTo: msg.id,
          },
          {
            onSuccess: () => {
              markRead(msg.id);
              toast.success('Отговорът е изпратен');
              resolve();
            },
            onError: (e) => reject(e),
          }
        );
      });
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Неуспешно изпращане';
      toast.error(m);
    } finally {
      setReplyingTo(null);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-10 w-10" aria-label="Съобщения">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center"
              variant="destructive"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(360px,calc(100vw-1rem))] max-h-[70vh] overflow-y-auto"
      >
        <DropdownMenuLabel>Съобщения</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {inbound.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Нямате съобщения
          </div>
        ) : (
          <div className="space-y-2 p-2">
            {inbound.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                onMarkRead={() => markRead(m.id)}
                onReply={(code, body) => handleReply(m, code, body)}
                isReplying={replyingTo === m.id}
              />
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MessageItem({
  message,
  onMarkRead,
  onReply,
  isReplying,
}: {
  message: Message;
  onMarkRead: () => void;
  onReply: (code: string, body: string) => void;
  isReplying: boolean;
}) {
  const { profile: senderProfile } = useProfile(message.sender_id);
  const isUnread = !message.read_at;
  const answers =
    message.kind === 'question' ? getQuestionByCode(message.code)?.answers ?? [] : [];

  return (
    <div
      className={`rounded-lg border p-3 ${
        isUnread ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">
            {senderProfile?.display_name || 'Потребител'} · {timeAgo(message.created_at)}
          </div>
          <div className="mt-1 text-sm font-medium text-foreground">{message.body}</div>
        </div>
        {isUnread && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 flex-shrink-0"
            onClick={onMarkRead}
            aria-label="Отбележи като прочетено"
          >
            <Check className="w-4 h-4" />
          </Button>
        )}
      </div>

      {message.kind === 'question' && answers.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {answers.map((a) => (
            <Button
              key={a.code}
              size="sm"
              variant="secondary"
              className="w-full justify-start h-auto py-2 text-left whitespace-normal"
              disabled={isReplying}
              onClick={() => onReply(a.code, a.body)}
            >
              {isReplying ? (
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin flex-shrink-0" />
              ) : (
                <Send className="w-3.5 h-3.5 mr-2 flex-shrink-0" />
              )}
              <span className="text-xs">{a.body}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
