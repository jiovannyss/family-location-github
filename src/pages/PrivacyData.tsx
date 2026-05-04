import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Preferences } from '@capacitor/preferences';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { storage } from '@/services/storage';
import { isNative } from '@/services/platform';
import AccountMenuLayout from '@/components/AccountMenuLayout';

export default function PrivacyData() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleDeleteHistory = async () => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('location_points')
        .delete()
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success('Историята на местоположенията е изтрита');
    } catch {
      toast.error('Грешка при изтриване на историята');
    }
  };

  const wipeLocalState = async () => {
    try { window.localStorage.clear(); } catch { /* ignore */ }
    try { window.sessionStorage.clear(); } catch { /* ignore */ }
    if (isNative()) {
      try { await Preferences.clear(); } catch { /* ignore */ }
    }
    void storage;
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (confirmText.trim() !== 'ИЗТРИЙ') {
      toast.error('Моля въведете ИЗТРИЙ за потвърждение');
      return;
    }
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', {
        method: 'POST',
      });
      if (error) throw error;
      if (data && (data as { error?: string }).error) {
        throw new Error((data as { error: string }).error);
      }
      await signOut();
      await wipeLocalState();
      toast.success('Акаунтът е изтрит');
      navigate('/auth', { replace: true });
    } catch (e) {
      console.error(e);
      toast.error('Грешка при изтриване на акаунта. Опитайте отново.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AccountMenuLayout title="Поверителност и данни">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-5 h-5" />
            Поверителност и данни
          </CardTitle>
          <CardDescription>Управлявайте вашите данни</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg gap-3">
            <div className="min-w-0">
              <p className="font-medium text-foreground">Изтрий историята на местоположенията</p>
              <p className="text-sm text-muted-foreground">Изтрива всички записани локации</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">Изтрий</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Изтриване на история</AlertDialogTitle>
                  <AlertDialogDescription>
                    Сигурни ли сте, че искате да изтриете цялата история на местоположенията?
                    Това действие е необратимо.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отказ</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteHistory}>Изтрий</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div className="p-4 bg-destructive/10 rounded-lg space-y-3">
            <div>
              <p className="font-medium text-destructive">Изтрий акаунта</p>
              <p className="text-sm text-muted-foreground">
                Изтрива акаунта и всички данни завинаги
              </p>
            </div>
            <AlertDialog onOpenChange={(o) => { if (!o) setConfirmText(''); }}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isDeleting} className="w-full sm:w-auto">
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Изтрий акаунта'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Изтриване на акаунт — необратимо</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3">
                      <p>Това действие <strong>не може да бъде отменено</strong>. Ще бъдат изтрити завинаги:</p>
                      <ul className="list-disc pl-5 text-sm space-y-1">
                        <li>Вашият профил и имейл</li>
                        <li>Цялата история на местоположенията</li>
                        <li>Push токени за известия</li>
                        <li>Всички ваши съобщения</li>
                        <li>Кръговете, на които сте собственик (заедно с членовете и поканите им)</li>
                        <li>Членството ви в други кръгове</li>
                      </ul>
                      <p className="text-sm">За потвърждение, въведете <strong>ИЗТРИЙ</strong> по-долу:</p>
                      <Input
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="ИЗТРИЙ"
                        autoFocus
                      />
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отказ</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    disabled={confirmText.trim() !== 'ИЗТРИЙ' || isDeleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Изтрий завинаги'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </AccountMenuLayout>
  );
}
