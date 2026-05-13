import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy,
  Check,
  UserPlus,
  MapPin,
  Clock,
  Target,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useCircleMembers, useInvites } from '@/hooks/useCircles';
import { useAuth } from '@/hooks/useAuth';
import { Circle, MemberWithLocation } from '@/lib/types';
import { formatDistanceToNow, differenceInSeconds } from 'date-fns';
import { bg } from 'date-fns/locale';
import { toast } from 'sonner';
import ChatDialog from './ChatDialog';
import { useMessages } from '@/hooks/useMessages';

interface CircleMembersProps {
  circle: Circle;
  onMemberClick?: (member: MemberWithLocation) => void;
}

export default function CircleMembers({ circle, onMemberClick }: CircleMembersProps) {
  const { members, isLoading, currentMember } = useCircleMembers(circle.id);
  const { invites, createInvite, isCreating } = useInvites(circle.id);
  const { user } = useAuth();
  const { messages } = useMessages();

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  const isOwner = circle.owner_id === user?.id;
  const acceptedMembers = members?.filter(m => m.status === 'accepted') || [];

  const handleCreateInvite = () => {
    createInvite(circle.id, {
      onSuccess: (invite: any) => {
        toast.success('Кодът за покана е създаден!');
      },
      onError: () => {
        toast.error('Грешка при създаване на покана');
      },
    });
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      toast.success('Кодът е копиран!');
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      toast.error('Грешка при копиране');
    }
  };

  const getTimeAgo = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: bg });
    } catch {
      return 'неизвестно';
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base sm:text-lg font-semibold text-foreground">
          Членове ({acceptedMembers.length})
        </h2>
        {isOwner && (
          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="text-xs sm:text-sm">
                <UserPlus className="w-4 h-4" />
                Покани
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Поканете членове</DialogTitle>
                <DialogDescription>
                  Споделете кода за покана с хората, които искате да поканите
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                {invites && invites.length > 0 ? (
                  <div className="space-y-3">
                    {invites.map((invite) => (
                      <div
                        key={invite.id}
                        className="flex items-center justify-between gap-2 p-3 sm:p-4 bg-secondary rounded-lg"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xl sm:text-2xl font-mono font-bold tracking-widest text-foreground truncate">
                            {invite.code}
                          </div>
                          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                            Изтича {getTimeAgo(invite.expires_at)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyCode(invite.code)}
                          className="flex-shrink-0"
                        >
                          {copiedCode === invite.code ? (
                            <Check className="w-4 h-4 text-success" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">
                    Няма активни покани
                  </p>
                )}
                <Button
                  onClick={handleCreateInvite}
                  className="w-full"
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Създай нова покана
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {acceptedMembers.map((member) => (
            <motion.div
              key={member.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <Card 
                className="cursor-pointer transition-all duration-200 hover:shadow-md hover:bg-secondary/30"
                onClick={() => onMemberClick?.(member)}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start gap-3">
                    <div className="relative flex-shrink-0">
                      <Avatar className="w-10 h-10 sm:w-12 sm:h-12 border-2 border-background shadow-sm">
                        <AvatarImage src={member.profile?.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
                          {getInitials(member.profile?.display_name || 'U')}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full border-2 border-card ${
                          member.sharing_state?.is_sharing
                            ? 'status-sharing'
                            : 'status-offline'
                        }`}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="font-medium text-sm sm:text-base text-foreground truncate min-w-0">
                          {member.profile?.display_name}
                          {member.user_id === user?.id && (
                            <span className="text-muted-foreground font-normal"> (Вие)</span>
                          )}
                        </h3>
                        {member.role === 'owner' && (
                          <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 py-0 flex-shrink-0">
                            Собственик
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs sm:text-sm text-muted-foreground flex-wrap">
                        {member.sharing_state?.is_sharing ? (
                          <>
                            <span className="flex items-center gap-1 whitespace-nowrap">
                              <Eye className="w-3.5 h-3.5 flex-shrink-0" />
                              Споделя
                            </span>
                            {member.last_location && (
                              <>
                                <span className="flex items-center gap-1 whitespace-nowrap">
                                  <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                                  {getTimeAgo(member.last_location.recorded_at)}
                                </span>
                                {member.last_location.accuracy_m && (
                                  <span className="flex items-center gap-1 whitespace-nowrap">
                                    <Target className="w-3.5 h-3.5 flex-shrink-0" />
                                    ±{Math.round(member.last_location.accuracy_m)}м
                                  </span>
                                )}
                              </>
                            )}
                          </>
                        ) : (
                          <span className="flex items-center gap-1 whitespace-nowrap">
                            <EyeOff className="w-3.5 h-3.5 flex-shrink-0" />
                            Не споделя
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {member.user_id !== user?.id && (
                        <ChatDialog
                          recipient={member}
                          unreadCount={
                            messages.filter(
                              (m) =>
                                m.sender_id === member.user_id &&
                                m.recipient_id === user?.id &&
                                !m.read_at,
                            ).length
                          }
                        />
                      )}
                      {member.sharing_state?.is_sharing && member.last_location && (
                        <MapPin className="w-5 h-5 text-primary" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
