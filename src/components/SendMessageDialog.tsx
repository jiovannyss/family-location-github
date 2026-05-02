import { useState } from 'react';
import { MessageCircle, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useCircles } from '@/hooks/useCircles';
import { useSendQuickMessage } from '@/hooks/useMessages';
import { useAuth } from '@/hooks/useAuth';
import { QUICK_QUESTIONS } from '@/lib/quickMessages';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MemberWithLocation } from '@/lib/types';

interface SendMessageDialogProps {
  recipient: MemberWithLocation;
  /** Trigger element. Defaults to a small icon button. */
  trigger?: React.ReactNode;
}

/**
 * Lets the current user send a predefined quick message to a circle member.
 * The message is fanned out across all circles where both users are members
 * (RLS allows this only when both are accepted members of the target circle).
 */
export default function SendMessageDialog({ recipient, trigger }: SendMessageDialogProps) {
  const { user } = useAuth();
  const { circles } = useCircles();
  const sendMessage = useSendQuickMessage();
  const [open, setOpen] = useState(false);

  const recipientName = recipient.profile?.display_name || 'Потребител';

  const handleSend = async (code: string, body: string) => {
    if (!user) return;

    // Find all circles where BOTH the sender and the recipient are accepted members.
    const myCircleIds = (circles ?? []).map((c) => c.id);
    if (myCircleIds.length === 0) {
      toast.error('Нямате общи кръгове с този потребител');
      return;
    }

    const { data: shared, error } = await supabase
      .from('circle_members')
      .select('circle_id')
      .eq('user_id', recipient.user_id)
      .eq('status', 'accepted')
      .in('circle_id', myCircleIds);

    if (error) {
      toast.error('Грешка при намиране на общи кръгове');
      return;
    }
    const sharedCircleIds = Array.from(new Set((shared ?? []).map((r) => r.circle_id)));
    if (sharedCircleIds.length === 0) {
      toast.error('Нямате общи кръгове с този потребител');
      return;
    }

    sendMessage.mutate(
      {
        recipientId: recipient.user_id,
        sharedCircleIds,
        kind: 'question',
        code,
        body,
      },
      {
        onSuccess: () => {
          toast.success(`Съобщението е изпратено на ${recipientName}`);
          setOpen(false);
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Неуспешно изпращане';
          toast.error(msg);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Изпрати съобщение на ${recipientName}`}
          >
            <MessageCircle className="w-4 h-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="max-w-[calc(100vw-2rem)] sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Изпрати съобщение</DialogTitle>
          <DialogDescription>
            Изберете готово съобщение за {recipientName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 pt-2">
          {QUICK_QUESTIONS.map((q) => (
            <Button
              key={q.code}
              variant="outline"
              className="w-full justify-start h-auto py-3 text-left whitespace-normal"
              disabled={sendMessage.isPending}
              onClick={() => handleSend(q.code, q.body)}
            >
              {sendMessage.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin flex-shrink-0" />
              ) : (
                <Send className="w-4 h-4 mr-2 flex-shrink-0" />
              )}
              <span>{q.body}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
