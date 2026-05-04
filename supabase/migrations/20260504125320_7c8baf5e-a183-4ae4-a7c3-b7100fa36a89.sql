-- Create user_settings table to store per-user preferences
CREATE TABLE public.user_settings (
  user_id UUID NOT NULL PRIMARY KEY,
  map_style TEXT NOT NULL DEFAULT 'voyager',
  language TEXT,
  theme TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
ON public.user_settings FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
ON public.user_settings FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
ON public.user_settings FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings"
ON public.user_settings FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER update_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create row on signup (extend existing handle_new_user)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.profiles (user_id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

    INSERT INTO public.sharing_state (user_id, device_id, is_sharing)
    VALUES (NEW.id, 'legacy', false);

    INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$function$;