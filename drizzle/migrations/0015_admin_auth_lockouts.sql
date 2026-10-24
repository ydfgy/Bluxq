BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_auth_lockouts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  first_failed_at timestamptz,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_auth_lockouts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.fn_admin_auth_state(_user uuid)
RETURNS TABLE (failed_attempts integer, locked_until timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT failed_attempts, locked_until
  FROM public.admin_auth_lockouts
  WHERE user_id = _user;
$$;

CREATE OR REPLACE FUNCTION public.fn_record_admin_auth_failure(_user uuid)
RETURNS TABLE (failed_attempts integer, locked_until timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_row public.admin_auth_lockouts;
  next_attempts integer;
  next_locked_until timestamptz;
BEGIN
  SELECT * INTO current_row
  FROM public.admin_auth_lockouts
  WHERE user_id = _user
  FOR UPDATE;

  IF current_row.user_id IS NULL OR current_row.locked_until IS NULL OR current_row.locked_until <= now() THEN
    next_attempts := CASE
      WHEN current_row.user_id IS NULL OR current_row.first_failed_at IS NULL OR current_row.first_failed_at <= now() - interval '10 minutes' THEN 1
      ELSE current_row.failed_attempts + 1
    END;
    next_locked_until := CASE WHEN next_attempts >= 3 THEN now() + interval '7 days' ELSE NULL END;

    INSERT INTO public.admin_auth_lockouts (user_id, failed_attempts, first_failed_at, locked_until, updated_at)
    VALUES (_user, next_attempts, now(), next_locked_until, now())
    ON CONFLICT (user_id) DO UPDATE SET
      failed_attempts = EXCLUDED.failed_attempts,
      first_failed_at = EXCLUDED.first_failed_at,
      locked_until = EXCLUDED.locked_until,
      updated_at = now();
  END IF;

  RETURN QUERY SELECT a.failed_attempts, a.locked_until
  FROM public.admin_auth_lockouts a
  WHERE a.user_id = _user;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_reset_admin_auth_failures(_user uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.admin_auth_lockouts WHERE user_id = _user;
$$;

CREATE OR REPLACE FUNCTION public.fn_is_user_locked(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_auth_lockouts
    WHERE user_id = _user AND locked_until IS NOT NULL AND locked_until > now()
  );
$$;

REVOKE ALL ON FUNCTION public.fn_admin_auth_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_record_admin_auth_failure(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_reset_admin_auth_failures(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_is_user_locked(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_admin_auth_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_record_admin_auth_failure(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_reset_admin_auth_failures(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_is_user_locked(uuid) TO authenticated, service_role;

COMMIT;
