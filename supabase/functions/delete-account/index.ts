/**
 * delete-account edge function
 *
 * Изтрива акаунта на текущо логнатия потребител:
 *  1) Премахва всичките му данни от публичните таблици (location_points,
 *     push_tokens, sharing_state, circle_members, invites, messages,
 *     circles които притежава, profile).
 *  2) Изтрива самия auth.users запис чрез admin API.
 *
 * Изисква валиден JWT (потребителят трябва да е логнат); работи само върху
 * собствения акаунт — никой не може да изтрие чужд.
 */
// @ts-nocheck — Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claims.claims.sub as string;

    // Service-role client за пълно изтриване
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Изтриване на данните в правилен ред
    await admin.from('location_points').delete().eq('user_id', userId);
    await admin.from('push_tokens').delete().eq('user_id', userId);
    await admin.from('sharing_state').delete().eq('user_id', userId);
    await admin.from('messages').delete().or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);
    await admin.from('invites').delete().eq('created_by', userId);
    await admin.from('circle_members').delete().eq('user_id', userId);
    // Кръгове, които потребителят притежава → изтрива и зависими членове
    const { data: ownedCircles } = await admin.from('circles').select('id').eq('owner_id', userId);
    if (ownedCircles && ownedCircles.length > 0) {
      const ids = ownedCircles.map((c: { id: string }) => c.id);
      await admin.from('circle_members').delete().in('circle_id', ids);
      await admin.from('messages').delete().in('circle_id', ids);
      await admin.from('invites').delete().in('circle_id', ids);
      await admin.from('circles').delete().in('id', ids);
    }
    await admin.from('profiles').delete().eq('user_id', userId);

    // Накрая — auth user
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error('auth.admin.deleteUser failed:', delErr);
      return new Response(JSON.stringify({ error: 'failed to delete auth user', detail: delErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('delete-account error:', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
