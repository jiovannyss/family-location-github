-- 1. Trigger за push известия при нови съобщения
DROP TRIGGER IF EXISTS trg_notify_new_message ON public.messages;
CREATE TRIGGER trg_notify_new_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_message();

-- 2. Trigger за автоматично изчистване на стара локационна история
DROP TRIGGER IF EXISTS trg_cleanup_old_location_points ON public.location_points;
CREATE TRIGGER trg_cleanup_old_location_points
AFTER INSERT ON public.location_points
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_old_location_points();

-- 3. Trigger за деактивиране на споделяне на други устройства
DROP TRIGGER IF EXISTS trg_deactivate_other_devices_on_share ON public.sharing_state;
CREATE TRIGGER trg_deactivate_other_devices_on_share
AFTER INSERT OR UPDATE ON public.sharing_state
FOR EACH ROW
EXECUTE FUNCTION public.deactivate_other_devices_on_share();

-- 4. Trigger за създаване на профил при нов потребител
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();