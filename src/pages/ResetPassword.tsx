import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Loader2, Eye, EyeOff, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type RecoveryOtpType = 'recovery';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const bootstrapRecovery = async () => {
      const hash = window.location.hash.startsWith('#')
        ? new URLSearchParams(window.location.hash.slice(1))
        : new URLSearchParams();

      const type = hash.get('type');
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');

      const search = new URLSearchParams(window.location.search);
      const searchType = search.get('type');
      const searchAccessToken = search.get('access_token');
      const searchRefreshToken = search.get('refresh_token');

      const finalType = type ?? searchType;
      const finalAccessToken = accessToken ?? searchAccessToken;
      const finalRefreshToken = refreshToken ?? searchRefreshToken;

      if (finalType === 'recovery' && finalAccessToken && finalRefreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: finalAccessToken,
          refresh_token: finalRefreshToken,
        });

        if (error) {
          toast.error('Линкът за смяна на парола е невалиден или е изтекъл');
          navigate('/auth', { replace: true });
          return;
        }

        window.history.replaceState({}, document.title, window.location.pathname);

        if (active) {
          setReady(true);
        }

        return;
      }

      const code = search.get('code');
      if (search.get('type') === 'recovery' && code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          toast.error('Линкът за смяна на парола е невалиден или е изтекъл');
          navigate('/auth', { replace: true });
          return;
        }

        window.history.replaceState({}, document.title, window.location.pathname);

        if (active) {
          setReady(true);
        }

        return;
      }

      const tokenHash = search.get('token_hash');
      if (search.get('type') === 'recovery' && tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          type: 'recovery' as RecoveryOtpType,
          token_hash: tokenHash,
        });

        if (error) {
          toast.error('Линкът за смяна на парола е невалиден или е изтекъл');
          navigate('/auth', { replace: true });
          return;
        }

        window.history.replaceState({}, document.title, window.location.pathname);

        if (active) {
          setReady(true);
        }

        return;
      }

      const { data } = await supabase.auth.getSession();
      if (active && data.session) {
        setReady(true);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true);
      }
    });

    void bootstrapRecovery();

    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Паролата трябва да е поне 6 символа');
      return;
    }
    if (password !== confirm) {
      toast.error('Паролите не съвпадат');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Паролата е сменена успешно');
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--gradient-hero)' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-glow">
            <MapPin className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Нова парола</h1>
        </div>
        <Card className="shadow-lg border-0">
          <CardHeader>
            <CardTitle className="text-xl text-center">Задайте нова парола</CardTitle>
            <CardDescription className="text-center">
              {ready ? 'Въведете новата си парола.' : 'Проверяваме линка за смяна на паролата...'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Нова парола</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Въведете парола"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    disabled={!ready}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Повторете паролата</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirm"
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Повторете паролата"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="pl-10"
                    disabled={!ready}
                  />
                </div>
              </div>
              <Button type="submit" variant="hero" size="lg" className="w-full" disabled={loading || !ready}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Запази новата парола'}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => navigate('/auth')}
                className="text-sm text-muted-foreground hover:text-primary"
              >
                Назад към вход
              </button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
