
-- Private schema for internal secrets (not exposed via PostgREST)
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.app_secrets (
  name  text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS on (defence in depth) — no policies = no access
ALTER TABLE private.app_secrets ENABLE ROW LEVEL SECURITY;

-- Generate one-off internal push secret if not present
INSERT INTO private.app_secrets (name, value)
VALUES ('internal_push_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

-- SECURITY DEFINER accessor for the trigger
CREATE OR REPLACE FUNCTION private.get_secret(_name text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = private
AS $$
  SELECT value FROM private.app_secrets WHERE name = _name;
$$;

-- Update notify_new_message to add X-Internal-Secret header
CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url TEXT;
  anon_key TEXT;
  internal_secret TEXT;
  sender_name TEXT;
  notif_title TEXT;
BEGIN
  fn_url := 'https://mrcetakiztvbdwaduvco.supabase.co/functions/v1/send-push';
  anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yY2V0YWtpenR2YmR3YWR1dmNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTk1MTIsImV4cCI6MjA4NTA5NTUxMn0.Rnis_fmAb1GW8SFrH-OR6STn0VtQDoM1HIt_3l0poXs';
  internal_secret := private.get_secret('internal_push_secret');

  SELECT display_name INTO sender_name FROM public.profiles WHERE user_id = NEW.sender_id;
  notif_title := COALESCE(sender_name, 'Семейна Локация');

  PERFORM net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'X-Internal-Secret', COALESCE(internal_secret, '')
    ),
    body := jsonb_build_object(
      'recipient_id', NEW.recipient_id,
      'title', notif_title,
      'body', NEW.body
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_new_message failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Tighten invites SELECT policy: only creators can browse their invites.
-- Joining by code goes through a SECURITY DEFINER lookup function (existing flow).
DROP POLICY IF EXISTS "Anyone authenticated can view valid invites by code" ON public.invites;

CREATE POLICY "Creators can view their own invites"
ON public.invites
FOR SELECT
TO authenticated
USING (created_by = auth.uid());

-- Lookup-by-code function for the join flow (returns circle_id only, not the row)
CREATE OR REPLACE FUNCTION public.find_invite_by_code(_code text)
RETURNS TABLE(circle_id uuid, expires_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT circle_id, expires_at
  FROM public.invites
  WHERE code = _code AND expires_at > now()
  LIMIT 1;
$$;
