/**
 * send-push edge function
 *
 * Извиква се автоматично от DB trigger при INSERT в `messages`.
 * Защитена е с X-Internal-Secret header — извиквания без правилен secret
 * получават 401, за да не може външен потребител да spam-ва push notifications.
 *
 * Изисква secrets:
 *   - INTERNAL_PUSH_SECRET — същият, който DB trigger подава (записан в private.app_secrets)
 *   - FCM_SERVICE_ACCOUNT_JSON — целият JSON на Firebase service account-а
 *
 * Без FCM_SERVICE_ACCOUNT_JSON функцията връща 200 без действие (за dev).
 */
// @ts-nocheck — Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

interface Payload {
  recipient_id: string;
  title: string;
  body: string;
}

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
    'pkcs8',
    binary,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned)
  );
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

// Constant-time string comparison за да няма timing attacks при secret check
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const reqId = crypto.randomUUID().slice(0, 8);
  const log = (msg: string, extra?: unknown) =>
    console.log(`[send-push ${reqId}] ${msg}`, extra ?? '');

  try {
    log('invoked');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const provided = req.headers.get('x-internal-secret') ?? '';
    log('internal-secret header present:', !!provided);
    if (!provided) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: ok, error: secretErr } = await supabase.rpc('verify_internal_push_secret', { _secret: provided });
    if (secretErr) {
      log('verify_internal_push_secret RPC error', secretErr);
      return new Response(JSON.stringify({ error: 'server error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    log('internal-secret valid:', ok);
    if (!ok) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload: Payload = await req.json();
    log('payload', { recipient_id: payload.recipient_id, title: payload.title });
    if (!payload.recipient_id || typeof payload.recipient_id !== 'string') {
      return new Response(JSON.stringify({ error: 'recipient_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: tokens, error } = await supabase
      .from('push_tokens')
      .select('token, platform')
      .eq('user_id', payload.recipient_id);
    if (error) throw error;
    log(`tokens found: ${tokens?.length ?? 0}`);
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no tokens' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const saJson = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
    if (!saJson) {
      log('FCM_SERVICE_ACCOUNT_JSON MISSING — push not configured');
      return new Response(JSON.stringify({ sent: 0, reason: 'fcm not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const sa = JSON.parse(saJson);
    const accessToken = await getAccessToken(sa);
    const projectId = sa.project_id;
    log('fcm project', projectId);

    let sent = 0;
    const failedTokens: string[] = [];
    for (const t of tokens) {
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: t.token,
              notification: { title: payload.title, body: payload.body },
            },
          }),
        }
      );
      const txt = await res.text();
      log(`FCM response status=${res.status} body=${txt.slice(0, 300)}`);
      if (res.ok) {
        sent++;
      } else {
        if (res.status === 404 || txt.includes('UNREGISTERED') || txt.includes('NOT_FOUND') || txt.includes('INVALID_ARGUMENT')) {
          failedTokens.push(t.token);
        }
      }
    }

    if (failedTokens.length > 0) {
      log(`removing ${failedTokens.length} stale tokens`);
      await supabase.from('push_tokens').delete().in('token', failedTokens);
    }

    return new Response(JSON.stringify({ sent, removed: failedTokens.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(`[send-push ${reqId}] error:`, e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
