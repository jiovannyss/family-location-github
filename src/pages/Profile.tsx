import { useState } from 'react';
import { Loader2, Save, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import AccountMenuLayout from '@/components/AccountMenuLayout';

export default function Profile() {
  const { user } = useAuth();
  const { profile, updateProfile, isUpdating } = useProfile();
  const [displayName, setDisplayName] = useState(profile?.display_name || '');

  const handleSave = () => {
    if (!displayName.trim()) {
      toast.error('Името не може да е празно');
      return;
    }
    updateProfile({ display_name: displayName }, {
      onSuccess: () => toast.success('Профилът е обновен'),
      onError: () => toast.error('Грешка при обновяване на профила'),
    });
  };

  return (
    <AccountMenuLayout title="Профил">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Профил
          </CardTitle>
          <CardDescription>Управлявайте информацията за вашия профил</CardDescription>
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
            onClick={handleSave}
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
    </AccountMenuLayout>
  );
}
