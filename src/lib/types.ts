export interface Profile {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Circle {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface CircleMember {
  id: string;
  circle_id: string;
  user_id: string;
  role: string;
  status: 'invited' | 'accepted';
  joined_at: string | null;
  created_at: string;
  profile?: Profile;
  sharing_state?: SharingState;
  last_location?: LocationPoint;
}

export interface Invite {
  id: string;
  circle_id: string;
  code: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  circle?: Circle;
}

export interface SharingState {
  user_id: string;
  device_id: string;
  is_sharing: boolean;
  updated_at: string;
}

export interface LocationPoint {
  id: string;
  user_id: string;
  device_id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  battery_level: number | null;
  device_platform: string | null;
  recorded_at: string;
  created_at: string;
}

export interface MemberWithLocation extends CircleMember {
  profile: Profile;
  sharing_state: SharingState | null;
  last_location: LocationPoint | null;
}
