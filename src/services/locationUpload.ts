import { CapacitorHttp } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { isNative } from './platform';

interface UploadLocationInput {
  accuracy: number | null;
  deviceId: string;
  devicePlatform: string;
  lat: number;
  lng: number;
  recordedAt: string;
  userId: string;
}

function buildRow(input: UploadLocationInput) {
  return {
    user_id: input.userId,
    device_id: input.deviceId,
    lat: input.lat,
    lng: input.lng,
    accuracy_m: input.accuracy,
    recorded_at: input.recordedAt,
    device_platform: input.devicePlatform,
  };
}

function getRestErrorMessage(status: number, data: unknown) {
  if (typeof data === 'string' && data.trim()) return `HTTP ${status}: ${data}`;
  if (data && typeof data === 'object') {
    const msg = 'message' in data ? String((data as { message?: unknown }).message ?? '') : '';
    const hint = 'hint' in data ? String((data as { hint?: unknown }).hint ?? '') : '';
    return `HTTP ${status}: ${[msg, hint].filter(Boolean).join(' — ') || 'Unknown error'}`;
  }
  return `HTTP ${status}: Unknown error`;
}

export async function uploadLocationPoint(input: UploadLocationInput) {
  const row = buildRow(input);

  if (!isNative()) {
    const { error } = await supabase.from('location_points').insert(row);
    if (error) throw error;
    return;
  }

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) {
    const { error } = await supabase.from('location_points').insert(row);
    if (error) throw error;
    return;
  }

  const response = await CapacitorHttp.post({
    url: `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/location_points`,
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    data: [row],
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(getRestErrorMessage(response.status, response.data));
  }
}