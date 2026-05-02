-- Автоматично извикване на send-push edge function при ново съобщение
CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url TEXT;
  anon_key TEXT;
  sender_name TEXT;
  notif_title TEXT;
BEGIN
  -- URL на edge функцията и anon key (използваме pg_net за async HTTP).
  fn_url := 'https://mrcetakiztvbdwaduvco.supabase.co/functions/v1/send-push';
  anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yY2V0YWtpenR2YmR3YWR1dmNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTk1MTIsImV4cCI6MjA4NTA5NTUxMn0.Rnis_fmAb1GW8SFrH-OR6STn0VtQDoM1HIt_3l0poXs';

  SELECT display_name INTO sender_name FROM public.profiles WHERE user_id = NEW.sender_id;
  notif_title := COALESCE(sender_name, 'Семейна Локация');

  PERFORM net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    ),
    body := jsonb_build_object(
      'recipient_id', NEW.recipient_id,
      'title', notif_title,
      'body', NEW.body
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Никога не блокирай INSERT-а заради push грешка
  RAISE WARNING 'notify_new_message failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Уверяваме се, че pg_net е достъпен
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DROP TRIGGER IF EXISTS trg_notify_new_message ON public.messages;
CREATE TRIGGER trg_notify_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_message();