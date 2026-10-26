BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.admin_panel_credentials (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  password_hash text NOT NULL,
  pin_hash text NOT NULL,
  token_secret text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_panel_credentials ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.fn_verify_admin_credentials(_password text, _pin text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_panel_credentials
    WHERE id = true
      AND crypt(_password, password_hash) = password_hash
      AND crypt(_pin, pin_hash) = pin_hash
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_admin_panel_token_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT token_secret FROM public.admin_panel_credentials WHERE id = true;
$$;

REVOKE ALL ON TABLE public.admin_panel_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_verify_admin_credentials(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_admin_panel_token_secret() FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_panel_credentials TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_verify_admin_credentials(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_admin_panel_token_secret() TO service_role;

COMMIT;
