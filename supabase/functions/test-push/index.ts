/**
 * test-push edge function — diagnostic
 *
 * Изпраща test push САМО към собствените push_tokens на caller-а.
 * Връща подробна диагностика: callerUserId, tokensFound, tokenRowsPreview,
 * skippedReason за всеки токен и FCM response/error.
 *
 * mode: 'notification' (visible) | 'location_refresh' (silent data-only)
 * Изисква JWT (verify_jwt = true).
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
  const json = await res.json();
  return { access_token: json.access_token as string | undefined, raw: json, status: res.status };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const reqId = crypto.randomUUID().slice(0, 8);
  const log = (m: string, e?: unknown) => console.log(`[test-push ${reqId}] ${m}`, e ?? '');
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!jwt) return json({ error: 'unauthorized', reason: 'missing bearer token' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u.user) return json({ error: 'invalid token', details: uErr?.message }, 401);
    const callerUserId = u.user.id;

    let body: { mode?: string } = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const mode = body.mode === 'location_refresh' ? 'location_refresh' : 'notification';
    log('caller', { callerUserId, mode });

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Lookup tokens — БЕЗ филтри по platform/device_id/active. Таблицата
    // public.push_tokens няма is_active/revoked/enabled — единственият критерий
    // е user_id == callerUserId.
    const { data: tokens, error: tErr } = await admin
      .from('push_tokens')
      .select('token, platform, device_id, updated_at')
      .eq('user_id', callerUserId);

    if (tErr) {
      log('token query error', tErr);
      return json({ error: 'token query failed', details: tErr.message, callerUserId }, 500);
    }

    const tokenRowsPreview = (tokens ?? []).map((t) => ({
      tokenLen: t.token?.length ?? 0,
      platform: t.platform,
      device_id: t.device_id,
      updated_at: t.updated_at,
    }));
    const tokensFound = tokens?.length ?? 0;
    log(`tokensFound=${tokensFound}`, tokenRowsPreview);

    const baseDiag = {
      callerUserId,
      mode,
      table: 'public.push_tokens',
      filter: 'user_id == callerUserId (no platform/device_id/active filter)',
      tokensFound,
      tokenRowsPreview,
    };

    if (tokensFound === 0) {
      return json({ ...baseDiag, sent: 0, total: 0, reason: 'no tokens for caller' });
    }

    const saJson = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
    if (!saJson) {
      return json({
        ...baseDiag,
        sent: 0,
        total: tokensFound,
        reason: 'FCM_SERVICE_ACCOUNT_JSON secret missing — добави Firebase service account JSON в backend secrets',
      });
    }

    let sa: { client_email: string; private_key: string; project_id: string };
    try {
      sa = JSON.parse(saJson);
    } catch (e) {
      return json({ ...baseDiag, sent: 0, total: tokensFound, reason: 'FCM_SERVICE_ACCOUNT_JSON invalid JSON', error: (e as Error).message });
    }

    const tok = await getAccessToken(sa);
    if (!tok.access_token) {
      log('access_token failed', tok.raw);
      return json({ ...baseDiag, sent: 0, total: tokensFound, reason: 'oauth token failed', oauthStatus: tok.status, oauthBody: tok.raw });
    }

    const projectId = sa.project_id;
    const now = Date.now();
    const results: Array<Record<string, unknown>> = [];
    let sent = 0;

    for (const t of tokens!) {
      const preview = { tokenLen: t.token?.length ?? 0, platform: t.platform, device_id: t.device_id };
      if (!t.token) {
        results.push({ ...preview, ok: false, skippedReason: 'empty token' });
        continue;
      }

      let message: Record<string, unknown>;
      if (mode === 'location_refresh') {
        message = {
          token: t.token,
          data: { type: 'location_refresh', requested_at: String(now), test: '1' },
          android: { priority: 'HIGH' },
          apns: { headers: { 'apns-push-type': 'background', 'apns-priority': '5' }, payload: { aps: { 'content-available': 1 } } },
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
          headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });
        const txt = await res.text();
        log(`FCM device=${t.device_id} status=${res.status} body=${txt.slice(0, 300)}`);
        if (res.ok) sent++;
        results.push({ ...preview, ok: res.ok, fcmStatus: res.status, fcmBody: txt.slice(0, 500), skippedReason: res.ok ? null : 'fcm error' });
      } catch (e) {
        log('fcm fetch failed', e);
        results.push({ ...preview, ok: false, skippedReason: 'fcm fetch threw', error: (e as Error).message });
      }
    }

    return json({ ...baseDiag, sent, total: tokensFound, results });
  } catch (e) {
    console.error(`[test-push ${reqId}] error`, e);
    return json({ error: (e as Error).message }, 500);
  }
});
