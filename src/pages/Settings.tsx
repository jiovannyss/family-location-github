import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, User, Trash2, Loader2, Save, Shield, FileText, Info } from 'lucide-react';
import { getAppVersionInfo, APP_VERSION, type AppVersionInfo } from '@/lib/version';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { storage } from '@/services/storage';
import { Preferences } from '@capacitor/preferences';
import { isNative } from '@/services/platform';
import { toast } from 'sonner';
import Header from '@/components/Header';
import PushDiagnostics from '@/components/PushDiagnostics';
import { useHardwareBackButton } from '@/hooks/useHardwareBackButton';

export default function Settings() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile, updateProfile, isUpdating } = useProfile();

  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  useHardwareBackButton();

  const handleSaveProfile = () => {
    if (!displayName.trim()) {
      toast.error('Името не може да е празно');
      return;
    }
    updateProfile({ display_name: displayName }, {
      onSuccess: () => toast.success('Профилът е обновен'),
      onError: () => toast.error('Грешка при обновяване на профила'),
    });
  };

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
    // Web localStorage и Capacitor Preferences пълно почистване
    try { window.localStorage.clear(); } catch { /* ignore */ }
    try { window.sessionStorage.clear(); } catch { /* ignore */ }
    if (isNative()) {
      try { await Preferences.clear(); } catch { /* ignore */ }
    }
    // safety re-init за storage abstraction
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
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container max-w-2xl px-4 py-6 pt-[calc(3.5rem+env(safe-area-inset-top)+1rem)] sm:pt-[calc(4rem+env(safe-area-inset-top)+1.5rem)]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="flex items-center gap-2 sm:gap-4 sticky top-[calc(3.5rem+env(safe-area-inset-top)+0.25rem)] z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 py-1">
            <Button variant="outline" size="sm" onClick={() => navigate('/')} aria-label="Назад към началото" className="shrink-0 gap-2">
              <ArrowLeft className="w-5 h-5" />
              <span>Назад</span>
            </Button>
            <h1 className="text-2xl font-bold text-foreground">Настройки</h1>
          </div>

          {/* Profile Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Профил
              </CardTitle>
              <CardDescription>
                Управлявайте информацията за вашия профил
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Имейл</Label>
                <Input id="email" type="email" value={user?.email || ''} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Име</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Вашето име"
                />
              </div>
              <Button
                onClick={handleSaveProfile}
                disabled={isUpdating || displayName === profile?.display_name}
              >
                {isUpdating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Запази промените
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <PushDiagnostics />

          {/* Legal links */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Документи
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to="/privacy" className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg hover:bg-secondary transition">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Shield className="w-4 h-4" /> Политика за поверителност
                </span>
                <span className="text-xs text-muted-foreground">→</span>
              </Link>
              <Link to="/terms" className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg hover:bg-secondary transition">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="w-4 h-4" /> Условия за ползване
                </span>
                <span className="text-xs text-muted-foreground">→</span>
              </Link>
            </CardContent>
          </Card>

          {/* Privacy / Data */}
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
        </motion.div>
      </main>
    </div>
  );
}
