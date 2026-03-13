import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MemberWithLocation } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { bg } from 'date-fns/locale';

interface LocationMapProps {
  members: MemberWithLocation[];
  selectedMember?: MemberWithLocation | null;
  currentUserId?: string;
}

function createAvatarIcon(name: string, isCurrentUser = false) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function LocationMap({ members, selectedMember, currentUserId }: LocationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  const membersWithLocation = useMemo(
    () => members.filter((m) => m.last_location && m.sharing_state?.is_sharing),
    [members]
  );

  const getTimeAgo = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: bg });
    } catch {
      return 'неизвестно';
    }
  };

  const defaultCenter: [number, number] = [42.6977, 23.3219];

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    map.setView(defaultCenter, 13);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (layersRef.current) {
      layersRef.current.remove();
      layersRef.current = null;
    }

    const layerGroup = L.layerGroup().addTo(map);

    membersWithLocation.forEach((member) => {
      const loc = member.last_location!;
      const isCurrentUser = member.user_id === currentUserId;
      const displayName = member.profile?.display_name || 'Потребител';

      if (loc.accuracy_m && loc.accuracy_m > 10) {
        L.circle([loc.lat, loc.lng], {
          radius: loc.accuracy_m,
          color: isCurrentUser ? '#2A9D8F' : '#219B9D',
          fillColor: isCurrentUser ? '#2A9D8F' : '#219B9D',
          fillOpacity: 0.1,
          weight: 1,
        }).addTo(layerGroup);
      }

      const marker = L.marker([loc.lat, loc.lng], {
        icon: createAvatarIcon(displayName, isCurrentUser),
      }).addTo(layerGroup);

      marker.bindPopup(`
        <div style="min-width:160px;padding:4px 2px;">
          <div style="font-weight:600;margin-bottom:6px;">
            ${escapeHtml(displayName)}${isCurrentUser ? ' (Вие)' : ''}
          </div>
          <div style="font-size:13px;color:#6b7280;line-height:1.5;">
            <div>Последно: ${escapeHtml(getTimeAgo(loc.recorded_at))}</div>
            ${loc.accuracy_m ? `<div>Точност: ±${Math.round(loc.accuracy_m)}м</div>` : ''}
          </div>
        </div>
      `);

      if (selectedMember?.id === member.id) {
        marker.openPopup();
      }
    });

    layersRef.current = layerGroup;

    return () => {
      layerGroup.remove();
      if (layersRef.current === layerGroup) {
        layersRef.current = null;
      }
    };
  }, [membersWithLocation, currentUserId, selectedMember, getTimeAgo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectedMember?.last_location) {
      map.flyTo([selectedMember.last_location.lat, selectedMember.last_location.lng], 15, {
        duration: 1,
      });
      return;
    }

    if (membersWithLocation.length > 0) {
      const bounds = L.latLngBounds(
        membersWithLocation.map((m) => [m.last_location!.lat, m.last_location!.lng] as [number, number])
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      return;
    }

    map.setView(defaultCenter, 13);
  }, [membersWithLocation, selectedMember]);

  return (
    <div className="map-container h-full min-h-[400px]">
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
}
