import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { MapPin, Settings, LogOut, Loader2, User, Bell, FileText, Shield, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';


export default function Header() {
  const { user, signOut } = useAuth();
  const { profile, isLoading } = useProfile();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    toast.info('Излязохте от профила си');
    navigate('/auth');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 inset-x-0 z-50 glass border-b border-border/50"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="container flex items-center justify-between h-14 sm:h-16 px-3 sm:px-4 max-w-7xl">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-md flex-shrink-0">
            <MapPin className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-base sm:text-lg text-foreground truncate">Семейна Локация</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">Бъдете свързани</p>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0 touch-manipulation">
              {isLoading ? (
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : (
                <Avatar className="w-10 h-10 border-2 border-primary/20">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary font-medium">
                    {getInitials(profile?.display_name || user?.email?.split('@')[0] || 'U')}
                  </AvatarFallback>
                </Avatar>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="font-medium">{profile?.display_name}</span>
                <span className="text-xs text-muted-foreground font-normal">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/profile')}>
              <User className="w-4 h-4 mr-2" />
              Профил
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <Settings className="w-4 h-4 mr-2" />
              Настройки
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/push-diagnostics')}>
              <Bell className="w-4 h-4 mr-2" />
              Push диагностика
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/documents')}>
              <FileText className="w-4 h-4 mr-2" />
              Документи
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/privacy-data')}>
              <Shield className="w-4 h-4 mr-2" />
              Поверителност и данни
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/about')}>
              <Info className="w-4 h-4 mr-2" />
              За приложението
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Изход
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.header>
  );
}
