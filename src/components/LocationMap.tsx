import { Fragment, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle as LeafletCircle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MemberWithLocation } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { bg } from 'date-fns/locale';
import { Clock, Target } from 'lucide-react';

// Fix for default marker icons in React-Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LocationMapProps {
  members: MemberWithLocation[];
  selectedMember?: MemberWithLocation | null;
  currentUserId?: string;
}

function createAvatarIcon(name: string, isCurrentUser: boolean = false) {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const bgColor = isCurrentUser ? '#2A9D8F' : '#219B9D';
  const borderColor = isCurrentUser ? '#4ECDC4' : '#ffffff';
  
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="position: relative;">
        <div style="
          position: absolute;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: ${bgColor}33;
          animation: markerPulse 2s ease-out infinite;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        "></div>
        <div style="
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: ${bgColor};
          border: 3px solid ${borderColor};
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 14px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          position: relative;
          z-index: 10;
        ">${initials}</div>
      </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -24],
  });
}

function MapController({ members, selectedMember }: { members: MemberWithLocation[], selectedMember?: MemberWithLocation | null }) {
  const map = useMap();

  useEffect(() => {
    if (selectedMember?.last_location) {
      map.flyTo(
        [selectedMember.last_location.lat, selectedMember.last_location.lng],
        15,
        { duration: 1 }
      );
    } else {
      const locationsWithData = members.filter(m => m.last_location);
      if (locationsWithData.length > 0) {
        const bounds = L.latLngBounds(
          locationsWithData.map(m => [m.last_location!.lat, m.last_location!.lng] as [number, number])
        );
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      }
    }
  }, [map, members, selectedMember]);

  return null;
}

export default function LocationMap({ members, selectedMember, currentUserId }: LocationMapProps) {
  const mapRef = useRef<L.Map>(null);
  
  const membersWithLocation = useMemo(() => 
    members.filter(m => m.last_location && m.sharing_state?.is_sharing),
    [members]
  );

  const getTimeAgo = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: bg });
    } catch {
      return 'неизвестно';
    }
  };

  // Default center (Sofia, Bulgaria)
  const defaultCenter: [number, number] = [42.6977, 23.3219];
  
  const initialCenter = useMemo(() => {
    if (membersWithLocation.length > 0) {
      const first = membersWithLocation[0].last_location!;
      return [first.lat, first.lng] as [number, number];
    }
    return defaultCenter;
  }, [membersWithLocation]);

  return (
    <div className="map-container h-full min-h-[400px]">
      <MapContainer
        ref={mapRef}
        center={initialCenter}
        zoom={13}
        className="w-full h-full"
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapController members={membersWithLocation} selectedMember={selectedMember} />

        {membersWithLocation.map((member) => {
          const loc = member.last_location!;
          const isCurrentUser = member.user_id === currentUserId;
          
          return (
            <div key={member.id}>
              {/* Accuracy circle */}
              {loc.accuracy_m && loc.accuracy_m > 10 && (
                <LeafletCircle
                  center={[loc.lat, loc.lng]}
                  radius={loc.accuracy_m}
                  pathOptions={{
                    color: isCurrentUser ? '#2A9D8F' : '#219B9D',
                    fillColor: isCurrentUser ? '#2A9D8F' : '#219B9D',
                    fillOpacity: 0.1,
                    weight: 1,
                  }}
                />
              )}
              
              <Marker
                position={[loc.lat, loc.lng]}
                icon={createAvatarIcon(member.profile?.display_name || 'U', isCurrentUser)}
              >
                <Popup>
                  <div className="p-2 min-w-[160px]">
                    <div className="font-semibold text-foreground mb-2">
                      {member.profile?.display_name}
                      {isCurrentUser && <span className="font-normal text-muted-foreground"> (Вие)</span>}
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{getTimeAgo(loc.recorded_at)}</span>
                      </div>
                      {loc.accuracy_m && (
                        <div className="flex items-center gap-2">
                          <Target className="w-3.5 h-3.5" />
                          <span>Точност: ±{Math.round(loc.accuracy_m)}м</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            </div>
          );
        })}
      </MapContainer>
    </div>
  );
}
