/**
 * test-push edge function
 *
 * Diagnostic only: позволява на залогнат потребител да изпрати test push
 * САМО до собствените си устройства (own push_tokens). Поддържа два режима:
 *   - mode: 'notification'     → user-visible notification (title/body)
 *   - mode: 'location_refresh' → silent data-only push (type=location_refresh)
 *
 * Изисква валидна user JWT (Authorization Bearer). Конфигуриран с verify_jwt=true.
 */
// @ts-nocheck — Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getAccessToken(sa: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  };
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const pem = sa.private_key.replace(/\\n/g, '\n');
  const pkBody = pem.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '');
  const binary = Uint8Array.from(atob(pkBody), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', binary, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${unsigned}.${sig}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  return (await res.json()).access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const reqId = crypto.randomUUID().slice(0, 8);
  const log = (m: string, e?: unknown) => console.log(`[test-push ${reqId}] ${m}`, e ?? '');

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u.user) {
      return new Response(JSON.stringify({ error: 'invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = u.user.id;

    let body: { mode?: string } = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const mode = body.mode === 'location_refresh' ? 'location_refresh' : 'notification';
    log('caller', { userId, mode });

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: tokens, error: tErr } = await admin
      .from('push_tokens')
      .select('token, platform, device_id')
      .eq('user_id', userId);
    if (tErr) throw tErr;
    log(`tokens: ${tokens?.length ?? 0}`);
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no tokens' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const saJson = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
    if (!saJson) {
      return new Response(JSON.stringify({ sent: 0, reason: 'fcm not configured' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const sa = JSON.parse(saJson);
    const accessToken = await getAccessToken(sa);
    const projectId = sa.project_id;
    const now = Date.now();

    const results: Array<Record<string, unknown>> = [];
    let sent = 0;

    for (const t of tokens) {
      let message: Record<string, unknown>;
      if (mode === 'location_refresh') {
        message = {
          token: t.token,
          data: { type: 'location_refresh', requested_at: String(now), test: '1' },
          android: { priority: 'HIGH' },
          apns: {
            headers: { 'apns-push-type': 'background', 'apns-priority': '5' },
            payload: { aps: { 'content-available': 1 } },
          },
        };
      } else {
        message = {
          token: t.token,
          notification: { title: 'Test push', body: `Diagnostic test @ ${new Date().toLocaleTimeString('bg-BG')}` },
          data: { type: 'test', sent_at: String(now) },
          android: { priority: 'HIGH' },
        };
      }

      try {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });
        const txt = await res.text();
        log(`FCM device=${t.device_id} status=${res.status} body=${txt.slice(0, 200)}`);
        if (res.ok) sent++;
        results.push({ device_id: t.device_id, status: res.status, ok: res.ok, body: txt.slice(0, 200) });
      } catch (e) {
        log('fcm fetch failed', e);
        results.push({ device_id: t.device_id, error: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ sent, total: tokens.length, mode, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(`[test-push ${reqId}] error`, e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
