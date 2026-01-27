import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Users, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCircleMembers } from '@/hooks/useCircles';
import { useRealtimeLocations } from '@/hooks/useLocation';
import { Circle, MemberWithLocation } from '@/lib/types';
import Header from '@/components/Header';
import CircleSelector from '@/components/CircleSelector';
import CircleMembers from '@/components/CircleMembers';
import SharingToggle from '@/components/SharingToggle';
import LocationMap from '@/components/LocationMap';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberWithLocation | null>(null);
  const { members } = useCircleMembers(selectedCircle?.id || null);

  // Enable realtime updates for circle members
  const userIds = members?.filter(m => m.status === 'accepted').map(m => m.user_id) || [];
  useRealtimeLocations(userIds);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const handleMemberClick = (member: MemberWithLocation) => {
    if (member.last_location && member.sharing_state?.is_sharing) {
      setSelectedMember(member);
    }
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

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container px-4 py-6">
        <div className="grid lg:grid-cols-[380px,1fr] gap-6">
          {/* Sidebar */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            {/* Sharing Toggle */}
            <SharingToggle />

            {/* Circle Selector */}
            <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
              <CircleSelector 
                selectedCircle={selectedCircle}
                onSelectCircle={setSelectedCircle}
              />
            </div>

            {/* Circle Members */}
            {selectedCircle && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card rounded-xl border border-border p-4 shadow-sm"
              >
                <CircleMembers 
                  circle={selectedCircle}
                  onMemberClick={handleMemberClick}
                />
              </motion.div>
            )}
          </motion.div>

          {/* Map Area */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-card rounded-xl border border-border overflow-hidden shadow-sm min-h-[500px] lg:min-h-[calc(100vh-140px)]"
          >
            {selectedCircle && members && members.length > 0 ? (
              <LocationMap 
                members={members}
                selectedMember={selectedMember}
                currentUserId={user.id}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  {selectedCircle ? (
                    <Users className="w-10 h-10 text-primary/50" />
                  ) : (
                    <MapPin className="w-10 h-10 text-primary/50" />
                  )}
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  {selectedCircle 
                    ? 'Няма локации за показване' 
                    : 'Изберете кръг'}
                </h3>
                <p className="text-muted-foreground max-w-sm">
                  {selectedCircle 
                    ? 'Членовете на кръга трябва да включат споделянето на местоположение, за да се виждат на картата.'
                    : 'Изберете кръг от списъка вляво, за да видите местоположенията на членовете.'}
                </p>
              </div>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default Index;
