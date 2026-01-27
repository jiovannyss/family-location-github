import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, User, Trash2, Loader2, Save } from 'lucide-react';
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
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import Header from '@/components/Header';

export default function Settings() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile, updateProfile, isUpdating } = useProfile();
  
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSaveProfile = () => {
    if (!displayName.trim()) {
      toast.error('Името не може да е празно');
      return;
    }
    updateProfile({ display_name: displayName }, {
      onSuccess: () => {
        toast.success('Профилът е обновен');
      },
      onError: () => {
        toast.error('Грешка при обновяване на профила');
      },
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

  const handleDeleteAccount = async () => {
    if (!user) return;
    
    setIsDeleting(true);
    try {
      // Delete profile (cascade will handle related data)
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', user.id);

      if (profileError) throw profileError;

      await signOut();
      toast.success('Акаунтът е изтрит');
      navigate('/auth');
    } catch {
      toast.error('Грешка при изтриване на акаунта');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container max-w-2xl px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="w-5 h-5" />
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
                <Input
                  id="email"
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="bg-muted"
                />
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

          {/* Privacy Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" />
                Поверителност и данни
              </CardTitle>
              <CardDescription>
                Управлявайте вашите данни
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg">
                <div>
                  <p className="font-medium text-foreground">Изтрий историята на местоположенията</p>
                  <p className="text-sm text-muted-foreground">
                    Изтрива всички записани локации
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      Изтрий
                    </Button>
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
                      <AlertDialogAction onClick={handleDeleteHistory}>
                        Изтрий
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <div className="flex items-center justify-between p-4 bg-destructive/10 rounded-lg">
                <div>
                  <p className="font-medium text-destructive">Изтрий акаунта</p>
                  <p className="text-sm text-muted-foreground">
                    Изтрива акаунта и всички данни завинаги
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={isDeleting}>
                      {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Изтрий'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Изтриване на акаунт</AlertDialogTitle>
                      <AlertDialogDescription>
                        Сигурни ли сте, че искате да изтриете акаунта си? 
                        Всички ваши данни ще бъдат изтрити завинаги. 
                        Това действие е необратимо.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отказ</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteAccount}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Изтрий завинаги
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
