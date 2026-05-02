import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Users, ChevronRight, Loader2, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useCircles, useJoinCircle } from '@/hooks/useCircles';
import { useAuth } from '@/hooks/useAuth';
import { Circle } from '@/lib/types';
import { toast } from 'sonner';

interface CircleSelectorProps {
  selectedCircle: Circle | null;
  onSelectCircle: (circle: Circle) => void;
}

export default function CircleSelector({ selectedCircle, onSelectCircle }: CircleSelectorProps) {
  const { circles, isLoading, createCircle, deleteCircle, renameCircle, isCreating, isRenaming } = useCircles();
  const joinCircle = useJoinCircle();
  const { user } = useAuth();

  const [newCircleName, setNewCircleName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Circle | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleCreateCircle = () => {
    if (!newCircleName.trim()) {
      toast.error('Моля, въведете име за кръга');
      return;
    }
    createCircle(newCircleName, {
      onSuccess: (circle) => {
        toast.success(`Кръгът "${newCircleName}" е създаден!`);
        setNewCircleName('');
        setIsCreateOpen(false);
        onSelectCircle(circle as Circle);
      },
      onError: (error) => {
        toast.error('Грешка при създаване на кръга');
      },
    });
  };

  const handleJoinCircle = () => {
    if (!inviteCode.trim()) {
      toast.error('Моля, въведете код за покана');
      return;
    }
    joinCircle.mutate(inviteCode, {
      onSuccess: (invite: any) => {
        toast.success(`Присъединихте се към "${invite.circle.name}"!`);
        setInviteCode('');
        setIsJoinOpen(false);
      },
      onError: (error: Error) => {
        toast.error(error.message);
      },
    });
  };

  const handleDeleteCircle = (circle: Circle) => {
    deleteCircle(circle.id, {
      onSuccess: () => {
        toast.success(`Кръгът "${circle.name}" е изтрит`);
        if (selectedCircle?.id === circle.id) {
          onSelectCircle(circles?.find(c => c.id !== circle.id) || null as any);
        }
      },
      onError: () => {
        toast.error('Грешка при изтриване на кръга');
      },
    });
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
        <h2 className="text-base sm:text-lg font-semibold text-foreground">Вашите кръгове</h2>
        <div className="flex gap-2">
          <Dialog open={isJoinOpen} onOpenChange={setIsJoinOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">Присъединете се</span>
                <span className="sm:hidden">Присъедини</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Присъединете се към кръг</DialogTitle>
                <DialogDescription>
                  Въведете кода за покана, който сте получили
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Input
                  placeholder="Въведете код (напр. ABC123)"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="text-center text-xl sm:text-2xl tracking-widest font-mono"
                />
                <Button
                  onClick={handleJoinCircle}
                  className="w-full"
                  disabled={joinCircle.isPending}
                >
                  {joinCircle.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Присъединяване'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="text-xs sm:text-sm">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Нов кръг</span>
                <span className="sm:hidden">Нов</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Създайте нов кръг</DialogTitle>
                <DialogDescription>
                  Дайте име на вашия семеен кръг
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Input
                  placeholder="напр. Семейство, Приятели..."
                  value={newCircleName}
                  onChange={(e) => setNewCircleName(e.target.value)}
                />
                <Button
                  onClick={handleCreateCircle}
                  className="w-full"
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Създаване'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {circles?.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-8 text-muted-foreground"
            >
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Все още нямате кръгове</p>
              <p className="text-sm">Създайте нов или се присъединете към съществуващ</p>
            </motion.div>
          ) : (
            circles?.map((circle) => (
              <motion.div
                key={circle.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card 
                  className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                    selectedCircle?.id === circle.id 
                      ? 'ring-2 ring-primary shadow-md' 
                      : 'hover:bg-secondary/50'
                  }`}
                  onClick={() => onSelectCircle(circle)}
                >
                  <CardContent className="p-3 sm:p-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Users className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-sm sm:text-base text-foreground truncate">{circle.name}</h3>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          {circle.owner_id === user?.id ? 'Собственик' : 'Член'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {circle.owner_id === user?.id && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent
                            className="max-w-[calc(100vw-2rem)] sm:max-w-lg"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <AlertDialogHeader>
                              <AlertDialogTitle>Изтриване на кръг</AlertDialogTitle>
                              <AlertDialogDescription>
                                Сигурни ли сте, че искате да изтриете "{circle.name}"?
                                Това действие е необратимо.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
                              <AlertDialogCancel className="mt-0">Отказ</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteCircle(circle)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Изтрий
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
