/**
 * request-location-refresh
 *
 * Извиква се от клиента когато потребителят отвори приложението.
 * Изпраща SILENT push (без notification UI) до всички устройства на
 * всички приети членове на всички кръгове, в които е извикалият потребител.
 *
 * Клиентите получават data-only message с `type: location_refresh` и
 * взимат свежа локация в background, която качват в location_points.
 *
 * Защита: изисква валидна user JWT (Authorization Bearer). Дроселира
 * заявките на ниво потребител (max 1 на 60 секунди).
 */
// @ts-nocheck — Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getAccessToken(serviceAccount: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const pem = serviceAccount.private_key.replace(/\\n/g, '\n');
  const pkBody = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binary = Uint8Array.from(atob(pkBody), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8', binary,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${unsigned}.${sig}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const json = await res.json();
  return json.access_token as string;
}

// In-memory throttle: user_id → last invoke timestamp.
// Edge function-ите имат споделен state в рамките на инстанция; това е
// "best-effort" дросел, не строг лимит.
const lastInvokeByUser = new Map<string, number>();
const THROTTLE_MS = 60_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const reqId = crypto.randomUUID().slice(0, 8);
  const log = (msg: string, extra?: unknown) =>
    console.log(`[refresh ${reqId}] ${msg}`, extra ?? '');

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Валидираме JWT и взимаме user-а (с anon client + jwt → auth.getUser)
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const callerId = userData.user.id;
    log('caller', callerId);

    // Throttle
    const now = Date.now();
    const last = lastInvokeByUser.get(callerId) ?? 0;
    if (now - last < THROTTLE_MS) {
      log('throttled');
      return new Response(JSON.stringify({ sent: 0, throttled: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    lastInvokeByUser.set(callerId, now);

    // Service role клиент за заобикаляне на RLS — взимаме всички приети
    // съ-членове на caller-а във всички кръгове.
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: myCircles, error: cErr } = await admin
      .from('circle_members')
      .select('circle_id')
      .eq('user_id', callerId)
      .eq('status', 'accepted');
    if (cErr) throw cErr;
    const circleIds = (myCircles ?? []).map((r: any) => r.circle_id);
    if (circleIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no circles' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: peers, error: pErr } = await admin
      .from('circle_members')
      .select('user_id')
      .in('circle_id', circleIds)
      .eq('status', 'accepted');
    if (pErr) throw pErr;
    const peerIds = Array.from(new Set((peers ?? []).map((r: any) => r.user_id)))
      .filter((id) => id !== callerId);
    log(`peer users: ${peerIds.length}`);
    if (peerIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no peers' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: tokens, error: tErr } = await admin
      .from('push_tokens')
      .select('token, platform, user_id')
      .in('user_id', peerIds);
    if (tErr) throw tErr;
    log(`tokens: ${tokens?.length ?? 0}`);
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no tokens' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const saJson = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
    if (!saJson) {
      return new Response(JSON.stringify({ sent: 0, reason: 'fcm not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const sa = JSON.parse(saJson);
    const accessToken = await getAccessToken(sa);
    const projectId = sa.project_id;

    let sent = 0;
    const failedTokens: string[] = [];

    // Праща ги паралелно за минимална латентност
    await Promise.all(tokens.map(async (t: any) => {
      // SILENT (data-only) push:
      //  - Android: само `data` payload → доставя се на FirebaseMessagingService.
      //    `priority: HIGH` за да събуди приложението.
      //  - iOS: `content-available: 1` + apns-push-type=background +
      //    apns-priority=5 (background priority — задължително за silent).
      const message: Record<string, unknown> = {
        token: t.token,
        data: { type: 'location_refresh', requested_at: String(now) },
        android: {
          priority: 'HIGH',
        },
        apns: {
          headers: {
            'apns-push-type': 'background',
            'apns-priority': '5',
            'apns-topic': sa.client_email?.includes('iam.gserviceaccount.com')
              ? undefined as any
              : undefined,
          },
          payload: {
            aps: {
              'content-available': 1,
            },
          },
        },
      };

      try {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message }),
          }
        );
        const txt = await res.text();
        if (res.ok) {
          sent++;
        } else {
          log(`FCM error status=${res.status} body=${txt.slice(0, 200)}`);
          if (res.status === 404 || txt.includes('UNREGISTERED') || txt.includes('NOT_FOUND')) {
            failedTokens.push(t.token);
          }
        }
      } catch (e) {
        log('fetch fcm failed', e);
      }
    }));

    if (failedTokens.length > 0) {
      await admin.from('push_tokens').delete().in('token', failedTokens);
    }

    return new Response(
      JSON.stringify({ sent, total: tokens.length, removed: failedTokens.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error(`[refresh ${reqId}] error`, e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
