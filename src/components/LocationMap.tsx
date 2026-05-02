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

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface ClusterEntry {
  member: MemberWithLocation;
  isCurrentUser: boolean;
  displayName: string;
}

interface Cluster {
  lat: number;
  lng: number;
  accuracy_m: number | null;
  entries: ClusterEntry[];
}

function createClusterIcon(entries: ClusterEntry[]) {
  const maxShown = 3;
  const shown = entries.slice(0, maxShown);
  const extra = entries.length - shown.length;

  const chips = shown
    .map((e, i) => {
      const bg = e.isCurrentUser ? '#2A9D8F' : '#219B9D';
      const initials = getInitials(e.displayName);
      // Negative margin so circles overlap slightly
      const ml = i === 0 ? '0' : '-10px';
      return `
        <div style="
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: ${bg};
          border: 3px solid #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 12px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25);
          margin-left: ${ml};
          position: relative;
          z-index: ${10 + i};
        ">${initials}</div>
      `;
    })
    .join('');

  const extraChip =
    extra > 0
      ? `
        <div style="
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #4b5563;
          border: 3px solid #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 12px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25);
          margin-left: -10px;
          position: relative;
          z-index: ${10 + shown.length};
        ">+${extra}</div>
      `
      : '';

  // Total width depends on number of chips
  const chipCount = shown.length + (extra > 0 ? 1 : 0);
  const width = 36 + (chipCount - 1) * 26;

  const isSingle = entries.length === 1;
  const pulseColor = entries[0].isCurrentUser ? '#2A9D8F' : '#219B9D';
  const pulse = isSingle
    ? `<div style="
          position: absolute;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: ${pulseColor}33;
          animation: markerPulse 2s ease-out infinite;
          top: 50%;
          left: 18px;
          transform: translate(-50%, -50%);
          z-index: 1;
        "></div>`
    : '';

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="position: relative; display: flex; align-items: center; width: ${width}px; height: 42px;">
        ${pulse}
        ${chips}${extraChip}
      </div>
    `,
    iconSize: [width, 42],
    iconAnchor: [width / 2, 21],
    popupAnchor: [0, -21],
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

// Distance in meters between two lat/lng points (haversine, sufficient for small distances)
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const CLUSTER_RADIUS_M = 30;

function buildClusters(entries: (ClusterEntry & { lat: number; lng: number; accuracy_m: number | null })[]): Cluster[] {
  const clusters: Cluster[] = [];
  for (const e of entries) {
    const target = clusters.find(
      (c) => distanceMeters(c.lat, c.lng, e.lat, e.lng) <= CLUSTER_RADIUS_M
    );
    if (target) {
      // Recompute centroid as running average
      const n = target.entries.length;
      target.lat = (target.lat * n + e.lat) / (n + 1);
      target.lng = (target.lng * n + e.lng) / (n + 1);
      if (e.accuracy_m != null) {
        target.accuracy_m =
          target.accuracy_m == null ? e.accuracy_m : Math.max(target.accuracy_m, e.accuracy_m);
      }
      target.entries.push({ member: e.member, isCurrentUser: e.isCurrentUser, displayName: e.displayName });
    } else {
      clusters.push({
        lat: e.lat,
        lng: e.lng,
        accuracy_m: e.accuracy_m,
        entries: [{ member: e.member, isCurrentUser: e.isCurrentUser, displayName: e.displayName }],
      });
    }
  }
  return clusters;
}

export default function LocationMap({ members, selectedMember, currentUserId }: LocationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  const membersWithLocation = useMemo(
    () => members.filter((m) => m.last_location && m.sharing_state?.is_sharing),
    [members]
  );

  const clusters = useMemo(() => {
    const entries = membersWithLocation
      .filter((m) => {
        const loc = m.last_location;
        return loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng);
      })
      .map((member) => {
        const loc = member.last_location!;
        return {
          member,
          isCurrentUser: member.user_id === currentUserId,
          displayName: member.profile?.display_name || 'Потребител',
          lat: loc.lat,
          lng: loc.lng,
          accuracy_m: loc.accuracy_m ?? null,
        };
      });
    return buildClusters(entries);
  }, [membersWithLocation, currentUserId]);

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

    // Fix Leaflet rendering inside tabs / dynamic containers (white map issue)
    const invalidate = () => {
      try {
        map.invalidateSize();
      } catch {}
    };
    // First paint
    requestAnimationFrame(invalidate);
    // After layout settles
    const t1 = setTimeout(invalidate, 100);
    const t2 = setTimeout(invalidate, 400);

    // Observe container size changes (mobile tab switches, viewport resize)
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      ro = new ResizeObserver(() => invalidate());
      ro.observe(mapContainerRef.current);
    }
    window.addEventListener('resize', invalidate);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', invalidate);
      ro?.disconnect();
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

    clusters.forEach((cluster) => {
      const isSingle = cluster.entries.length === 1;
      const primary = cluster.entries[0];

      if (isSingle && cluster.accuracy_m && cluster.accuracy_m > 10) {
        L.circle([cluster.lat, cluster.lng], {
          radius: cluster.accuracy_m,
          color: primary.isCurrentUser ? '#2A9D8F' : '#219B9D',
          fillColor: primary.isCurrentUser ? '#2A9D8F' : '#219B9D',
          fillOpacity: 0.1,
          weight: 1,
        }).addTo(layerGroup);
      }

      const marker = L.marker([cluster.lat, cluster.lng], {
        icon: createClusterIcon(cluster.entries),
      }).addTo(layerGroup);

      const popupBody = cluster.entries
        .map((e) => {
          const loc = e.member.last_location!;
          const youSuffix = e.isCurrentUser ? ' (Вие)' : '';
          return `
            <div style="padding:6px 0;border-top:1px solid #f1f5f9;">
              <div style="font-weight:600;">${escapeHtml(e.displayName)}${youSuffix}</div>
              <div style="font-size:12px;color:#6b7280;line-height:1.5;">
                <div>Последно: ${escapeHtml(getTimeAgo(loc.recorded_at))}</div>
                ${loc.accuracy_m ? `<div>Точност: ±${Math.round(loc.accuracy_m)}м</div>` : ''}
              </div>
            </div>
          `;
        })
        .join('');

      const header = isSingle
        ? ''
        : `<div style="font-weight:600;margin-bottom:4px;">${cluster.entries.length} потребители тук</div>`;

      marker.bindPopup(`
        <div style="min-width:180px;padding:4px 2px;">
          ${header}
          ${popupBody}
        </div>
      `);

      if (selectedMember && cluster.entries.some((e) => e.member.id === selectedMember.id)) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters, selectedMember]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const isValid = (lat: unknown, lng: unknown): lat is number =>
      typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);

    if (selectedMember?.last_location && isValid(selectedMember.last_location.lat, selectedMember.last_location.lng)) {
      map.flyTo([selectedMember.last_location.lat, selectedMember.last_location.lng], 15, {
        duration: 1,
      });
      return;
    }

    const validMembers = membersWithLocation.filter(
      (m) => m.last_location && isValid(m.last_location.lat, m.last_location.lng)
    );

    if (validMembers.length > 0) {
      const bounds = L.latLngBounds(
        validMembers.map((m) => [m.last_location!.lat, m.last_location!.lng] as [number, number])
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
