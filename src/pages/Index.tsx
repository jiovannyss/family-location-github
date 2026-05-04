import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Users, Loader2, List, Map as MapIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useCircleMembers, useCircles } from '@/hooks/useCircles';
import { useRealtimeLocations } from '@/hooks/useLocation';
import { useAppBadgeSync } from '@/hooks/useAppBadge';
import { useHardwareBackButton } from '@/hooks/useHardwareBackButton';
import { useMapStyleSync } from '@/hooks/useMapStyleSync';
import { Circle, MemberWithLocation } from '@/lib/types';
import Header from '@/components/Header';
import CircleSelector from '@/components/CircleSelector';
import CircleMembers from '@/components/CircleMembers';
import SharingToggle from '@/components/SharingToggle';
import LocationMap from '@/components/LocationMap';
import NotificationPermissionPrompt from '@/components/NotificationPermissionPrompt';
import { Button } from '@/components/ui/button';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');
  const { circles } = useCircles();

  // Always derive selected circle from the freshest list (so renames propagate)
  const selectedCircle = useMemo<Circle | null>(() => {
    if (!selectedCircleId || !circles) return null;
    return circles.find((c) => c.id === selectedCircleId) || null;
  }, [circles, selectedCircleId]);

  const { members } = useCircleMembers(selectedCircle?.id || null);

  // Enable realtime updates for circle members
  const userIds = members?.filter(m => m.status === 'accepted').map(m => m.user_id) || [];
  useRealtimeLocations(userIds);

  // Sync на броя непрочетени с иконата на приложението (червено балонче)
  useAppBadgeSync();
  // Android hardware back → минимизирай вместо да пращаш в /auth
  useHardwareBackButton();
  // Sync избора на стил на картата с базата (между устройства)
  useMapStyleSync();

  // Always derive the selected member from the latest members list
  const selectedMember = useMemo<MemberWithLocation | null>(() => {
    if (!selectedMemberId || !members) return null;
    return members.find((m) => m.id === selectedMemberId) || null;
  }, [members, selectedMemberId]);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  // Push notifications се управляват глобално в `src/services/push.ts`
  // (auth-state listener регистрира/чисти tokens автоматично).

  const handleMemberClick = (member: MemberWithLocation) => {
    if (!member.last_location || !member.sharing_state?.is_sharing) {
      toast.info(`${member.profile?.display_name || 'Този член'} не споделя локация в момента`);
      return;
    }
    setSelectedMemberId(member.id);
    setMobileTab('map');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Зареждане...</p>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const sidebarContent = (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-4 sm:space-y-6"
    >
      <NotificationPermissionPrompt />
      <SharingToggle />

      <div className="bg-card rounded-xl border border-border p-3 sm:p-4 shadow-sm">
        <CircleSelector
          selectedCircle={selectedCircle}
          onSelectCircle={(c) => setSelectedCircleId(c?.id ?? null)}
        />
      </div>

      {selectedCircle && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl border border-border p-3 sm:p-4 shadow-sm"
        >
          <CircleMembers
            circle={selectedCircle}
            onMemberClick={handleMemberClick}
          />
        </motion.div>
      )}
    </motion.div>
  );

  const mapContent = (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-card rounded-xl border border-border overflow-hidden shadow-sm h-[calc(100vh-200px)] lg:h-full"
    >
      {selectedCircle && members && members.length > 0 ? (
        <LocationMap
          members={members}
          selectedMember={selectedMember}
          currentUserId={user.id}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            {selectedCircle ? (
              <Users className="w-8 h-8 sm:w-10 sm:h-10 text-primary/50" />
            ) : (
              <MapPin className="w-8 h-8 sm:w-10 sm:h-10 text-primary/50" />
            )}
          </div>
          <h3 className="text-base sm:text-lg font-medium text-foreground mb-2">
            {selectedCircle
              ? 'Няма локации за показване'
              : 'Изберете кръг'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {selectedCircle
              ? 'Членовете на кръга трябва да включат споделянето на местоположение, за да се виждат на картата.'
              : 'Изберете кръг от списъка, за да видите местоположенията на членовете.'}
          </p>
        </div>
      )}
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main
        className="container px-3 sm:px-4 py-4 sm:py-6 max-w-7xl pt-[calc(3.5rem+env(safe-area-inset-top)+1rem)] sm:pt-[calc(4rem+env(safe-area-inset-top)+1.5rem)]"
      >
        {/* Mobile tabs */}
        <div className="lg:hidden mb-4 flex gap-2 p-1 bg-muted rounded-xl">
          <Button
            variant={mobileTab === 'list' ? 'default' : 'ghost'}
            size="sm"
            className="flex-1 gap-2"
            onClick={() => setMobileTab('list')}
          >
            <List className="w-4 h-4" />
            Кръгове
          </Button>
          <Button
            variant={mobileTab === 'map' ? 'default' : 'ghost'}
            size="sm"
            className="flex-1 gap-2"
            onClick={() => setMobileTab('map')}
          >
            <MapIcon className="w-4 h-4" />
            Карта
          </Button>
        </div>

        {/* Desktop: two columns — map fixed to viewport, sidebar scrolls */}
        <div className="hidden lg:grid lg:grid-cols-[380px,1fr] gap-6 lg:h-[calc(100vh-4rem-env(safe-area-inset-top)-3rem)]">
          <div className="overflow-y-auto pr-2 -mr-2">
            {sidebarContent}
          </div>
          {mapContent}
        </div>

        {/* Mobile: tab switch */}
        <div className="lg:hidden">
          {mobileTab === 'list' ? sidebarContent : mapContent}
        </div>
      </main>
    </div>
  );
};

export default Index;

