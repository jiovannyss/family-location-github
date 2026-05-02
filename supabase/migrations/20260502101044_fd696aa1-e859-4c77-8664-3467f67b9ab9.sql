-- 1. Add device_id to sharing_state
ALTER TABLE public.sharing_state
  ADD COLUMN device_id TEXT NOT NULL DEFAULT 'legacy';

-- Drop old PK (user_id) and create new composite PK
ALTER TABLE public.sharing_state DROP CONSTRAINT IF EXISTS sharing_state_pkey;
ALTER TABLE public.sharing_state ADD PRIMARY KEY (user_id, device_id);

-- 2. Add device_id to location_points
ALTER TABLE public.location_points
  ADD COLUMN device_id TEXT NOT NULL DEFAULT 'legacy';

CREATE INDEX IF NOT EXISTS idx_location_points_user_device_recorded
  ON public.location_points (user_id, device_id, recorded_at DESC);

-- 3. Replace cleanup function to keep last 100 points per device
CREATE OR REPLACE FUNCTION public.cleanup_old_location_points()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    DELETE FROM public.location_points
    WHERE user_id = NEW.user_id
      AND device_id = NEW.device_id
      AND id NOT IN (
          SELECT id FROM public.location_points
          WHERE user_id = NEW.user_id
            AND device_id = NEW.device_id
          ORDER BY recorded_at DESC
          LIMIT 100
      );
    RETURN NEW;
END;
$function$;

-- Make sure trigger exists
DROP TRIGGER IF EXISTS cleanup_location_points_trigger ON public.location_points;
CREATE TRIGGER cleanup_location_points_trigger
  AFTER INSERT ON public.location_points
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_old_location_points();

-- 4. Trigger: when a device starts sharing, stop all other devices for that user
CREATE OR REPLACE FUNCTION public.deactivate_other_devices_on_share()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.is_sharing = true THEN
        UPDATE public.sharing_state
        SET is_sharing = false,
            updated_at = now()
        WHERE user_id = NEW.user_id
          AND device_id <> NEW.device_id
          AND is_sharing = true;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS deactivate_other_devices_trigger ON public.sharing_state;
CREATE TRIGGER deactivate_other_devices_trigger
  AFTER INSERT OR UPDATE OF is_sharing ON public.sharing_state
  FOR EACH ROW
  EXECUTE FUNCTION public.deactivate_other_devices_on_share();

-- 5. Update handle_new_user: insert sharing_state with 'legacy' device_id (will be replaced on first real device toggle)
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

    RETURN NEW;
END;
$function$;