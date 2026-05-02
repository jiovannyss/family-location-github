
CREATE OR REPLACE FUNCTION public.verify_internal_push_secret(_secret text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  expected text;
BEGIN
  SELECT value INTO expected FROM private.app_secrets WHERE name = 'internal_push_secret';
  IF expected IS NULL OR _secret IS NULL THEN
    RETURN false;
  END IF;
  -- constant-time compare
  RETURN expected = _secret AND length(expected) = length(_secret);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_internal_push_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_internal_push_secret(text) TO service_role;
