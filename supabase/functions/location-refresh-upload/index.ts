/**
 * location-refresh-upload
 *
 * Dedicated upload endpoint for the background `location_refresh` push handler
 * on Android (locked screen) where `supabase.auth.getSession()` may hang and
 * the JS Supabase client cannot reliably authenticate.
 *
 * Auth model: NO user JWT required (verify_jwt=false). Instead we validate
 * that the (user_id, device_id) pair has a registered push_tokens row — this
 * proves the device was previously authenticated and registered as that user.
 * Insert is performed with service role (bypasses RLS).
 */
// @ts-nocheck — Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const reqId = crypto.randomUUID().slice(0, 8);
  const log = (msg: string, extra?: unknown) =>
    console.log(`[loc-upload ${reqId}] ${msg}`, extra ?? '');

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return new Response(JSON.stringify({ error: 'invalid json' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = typeof body.userId === 'string' ? body.userId : '';
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
    const lat = body.latitude;
    const lng = body.longitude;
    const accuracy = body.accuracy;
    const timestamp = typeof body.timestamp === 'string' ? body.timestamp : '';
    const source = typeof body.source === 'string' ? body.source : 'push_location_refresh';
    const devicePlatform = typeof body.devicePlatform === 'string' ? body.devicePlatform : null;

    if (!userId || !deviceId || !isFiniteNum(lat) || !isFiniteNum(lng) || !timestamp) {
      log('bad payload', { userId: !!userId, deviceId: !!deviceId, lat, lng, hasTs: !!timestamp });
      return new Response(JSON.stringify({ error: 'missing/invalid fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // UUID-ish check on userId
    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
      return new Response(JSON.stringify({ error: 'bad userId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // sanity ranges
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return new Response(JSON.stringify({ error: 'bad coords' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey);

    // Authorization: require a matching push_tokens row for (user_id, device_id).
    const { data: tokRow, error: tokErr } = await admin
      .from('push_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq('device_id', deviceId)
      .limit(1)
      .maybeSingle();
    if (tokErr) {
      log('token lookup failed', tokErr);
      return new Response(JSON.stringify({ error: 'auth lookup failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!tokRow) {
      log('no registered push token for pair', { userId, deviceId });
      return new Response(JSON.stringify({ error: 'unauthorized device' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const row = {
      user_id: userId,
      device_id: deviceId,
      lat,
      lng,
      accuracy_m: isFiniteNum(accuracy) ? accuracy : null,
      recorded_at: timestamp,
      device_platform: devicePlatform,
    };

    const { error: insErr } = await admin.from('location_points').insert(row);
    if (insErr) {
      log('insert failed', insErr);
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log('inserted', { userId, deviceId, source });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(`[loc-upload ${reqId}] error`, e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
