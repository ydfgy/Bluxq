begin;

-- Creator API keys are opaque Roblox secrets. The previous 500-character
-- guard rejected valid keys pasted from Roblox, even though the column is
-- already text and the server validates the key with Roblox before saving it.
create or replace function public.fn_save_roblox_creator_api_key(_user uuid, _key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if char_length(trim(coalesce(_key, ''))) < 20
     or char_length(trim(coalesce(_key, ''))) > 4096 then
    raise exception 'API key inválida';
  end if;

  -- The caller supplies the authenticated user id from the server middleware;
  -- never accept an account id from the browser payload.
  update public.profiles
  set roblox_creator_api_key = trim(_key)
  where id = _user;
  if not found then raise exception 'Perfil não encontrado'; end if;
end;
$$;

revoke all on function public.fn_save_roblox_creator_api_key(uuid,text) from public, anon, authenticated;
grant execute on function public.fn_save_roblox_creator_api_key(uuid,text) to service_role;

commit;
