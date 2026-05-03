import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send, Loader2, X, Plus, Reply } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useMessages, useSendQuickMessage } from '@/hooks/useMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCircles } from '@/hooks/useCircles';
import { QUICK_QUESTIONS, getQuestionByCode } from '@/lib/quickMessages';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { bg } from 'date-fns/locale';
import type { MemberWithLocation, Message } from '@/lib/types';

interface ChatDialogProps {
  recipient: MemberWithLocation;
  unreadCount: number;
}

function timeAgo(d: string) {
  try {
    return formatDistanceToNow(new Date(d), { addSuffix: true, locale: bg });
  } catch {
    return '';
  }
}

export default function ChatDialog({ recipient, unreadCount }: ChatDialogProps) {
  const { user } = useAuth();
  const { circles } = useCircles();
  const { messages, markRead } = useMessages();
  const sendMessage = useSendQuickMessage();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'list' | 'new' | 'reply'>('list');
  const [replyToMsg, setReplyToMsg] = useState<Message | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const recipientName = recipient.profile?.display_name || 'Потребител';

  const conversation = useMemo(() => {
    if (!user) return [];
    return messages
      .filter(
        (m) =>
          (m.sender_id === user.id && m.recipient_id === recipient.user_id) ||
          (m.sender_id === recipient.user_id && m.recipient_id === user.id),
      )
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [messages, user?.id, recipient.user_id]);

  // Маркирай като прочетени всички входящи при отваряне
  useEffect(() => {
    if (!open || !user) return;
    conversation
      .filter((m) => m.recipient_id === user.id && !m.read_at)
      .forEach((m) => markRead(m.id));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Скролни до дъното при ново съобщение/отваряне
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, [open, conversation.length]);

  const resolveSharedCircleIds = async (): Promise<string[]> => {
    if (!user) return [];
    const myCircleIds = (circles ?? []).map((c) => c.id);
    if (myCircleIds.length === 0) return [];
    const { data, error } = await supabase
      .from('circle_members')
      .select('circle_id')
      .eq('user_id', recipient.user_id)
      .eq('status', 'accepted')
      .in('circle_id', myCircleIds);
    if (error) throw error;
    return Array.from(new Set((data ?? []).map((r) => r.circle_id)));
  };

  const handleSend = async (
    kind: 'question' | 'answer',
    code: string,
    body: string,
    inReplyTo?: string,
  ) => {
    if (!user) return;
    try {
      const sharedCircleIds = await resolveSharedCircleIds();
      if (sharedCircleIds.length === 0) {
        toast.error('Нямате общи кръгове');
        return;
      }
      await new Promise<void>((resolve, reject) => {
        sendMessage.mutate(
          {
            recipientId: recipient.user_id,
            sharedCircleIds,
            kind,
            code,
            body,
            inReplyTo: inReplyTo ?? null,
          },
          {
            onSuccess: () => resolve(),
            onError: (e) => reject(e),
          },
        );
      });
      setMode('list');
      setReplyToMsg(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Неуспешно изпращане');
    }
  };

  const replyAnswers =
    mode === 'reply' && replyToMsg && replyToMsg.kind === 'question'
      ? getQuestionByCode(replyToMsg.code)?.answers ?? []
      : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setMode('list');
          setReplyToMsg(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative h-8 w-8 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Чат с ${recipientName}`}
        >
          <MessageCircle className="w-4 h-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center pointer-events-none"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-[calc(100vw-1rem)] sm:max-w-md p-0 gap-0 max-h-[85dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="text-base">Чат с {recipientName}</DialogTitle>
        </DialogHeader>

        {/* История */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[180px]">
          {conversation.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              Все още няма съобщения
            </div>
          ) : (
            conversation.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div
                  key={m.id}
                  className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                      mine
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-secondary text-secondary-foreground rounded-bl-sm'
                    }`}
                  >
                    <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                    <div
                      className={`mt-1 flex items-center gap-2 text-[10px] ${
                        mine ? 'text-primary-foreground/70' : 'text-muted-foreground'
                      }`}
                    >
                      <span>{timeAgo(m.created_at)}</span>
                      {!mine && m.kind === 'question' &&
                        (getQuestionByCode(m.code)?.answers.length ?? 0) > 0 && (
                          <button
                            className="inline-flex items-center gap-0.5 underline underline-offset-2"
                            onClick={() => {
                              setReplyToMsg(m);
                              setMode('reply');
                            }}
                          >
                            <Reply className="w-3 h-3" /> Отговори
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Долен панел: бутони/шаблони */}
        <div className="border-t bg-muted/30 px-3 py-2 shrink-0">
          {mode === 'list' && (
            <Button
              className="w-full"
              size="sm"
              onClick={() => setMode('new')}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Ново съобщение
            </Button>
          )}

          {mode === 'new' && (
            <div className="space-y-2 max-h-[40dvh] overflow-y-auto pr-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Изберете въпрос
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => setMode('list')}
                  aria-label="Затвори"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              {QUICK_QUESTIONS.map((q) => (
                <Button
                  key={q.code}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start h-auto py-2 text-left whitespace-normal"
                  disabled={sendMessage.isPending}
                  onClick={() => handleSend('question', q.code, q.body)}
                >
                  {sendMessage.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin flex-shrink-0" />
                  ) : (
                    <Send className="w-3.5 h-3.5 mr-2 flex-shrink-0" />
                  )}
                  <span className="text-xs">{q.body}</span>
                </Button>
              ))}
            </div>
          )}

          {mode === 'reply' && replyToMsg && (
            <div className="space-y-2 max-h-[40dvh] overflow-y-auto pr-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground truncate">
                  Отговор на: „{replyToMsg.body}"
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => {
                    setMode('list');
                    setReplyToMsg(null);
                  }}
                  aria-label="Затвори"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              {replyAnswers.length === 0 ? (
                <div className="text-xs text-muted-foreground py-2">
                  Няма предварителни отговори за това съобщение.
                </div>
              ) : (
                replyAnswers.map((a) => (
                  <Button
                    key={a.code}
                    variant="secondary"
                    size="sm"
                    className="w-full justify-start h-auto py-2 text-left whitespace-normal"
                    disabled={sendMessage.isPending}
                    onClick={() => handleSend('answer', a.code, a.body, replyToMsg.id)}
                  >
                    {sendMessage.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin flex-shrink-0" />
                    ) : (
                      <Send className="w-3.5 h-3.5 mr-2 flex-shrink-0" />
                    )}
                    <span className="text-xs">{a.body}</span>
                  </Button>
                ))
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
