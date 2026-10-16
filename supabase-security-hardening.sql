begin;

-- Security hardening: isolate verification challenges, restrict profile columns,
-- validate usernames server-side, and remove public admin bootstrap.
create extension if not exists pgcrypto;

create table if not exists public.profile_challenges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  verify_phrase text not null,
  created_at timestamptz not null default now()
);

grant select on public.profile_challenges to authenticated;
grant all on public.profile_challenges to service_role;
alter table public.profile_challenges enable row level security;

drop policy if exists "own verification challenge" on public.profile_challenges;
create policy "own verification challenge"
  on public.profile_challenges
  for select
  to authenticated
  using (user_id = auth.uid());

-- Preserve existing challenges while moving the browser-facing read path away
-- from profiles.verify_phrase. New users are populated by the trigger below.
insert into public.profile_challenges (user_id, verify_phrase)
select id, verify_phrase
from public.profiles
where verify_phrase is not null
on conflict (user_id) do nothing;

-- Authenticated clients may read only the profile fields required by the UI.
-- email and verify_phrase remain server/service-role-only.
revoke select on public.profiles from authenticated;
grant select (
  id,
  roblox_username,
  roblox_user_id,
  roblox_display_name,
  avatar_url,
  verified,
  balance,
  created_at
) on public.profiles to authenticated;

-- Enforce the username contract in the database as well as in the server
-- function. NOT VALID preserves any legacy rows while enforcing new writes.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_roblox_username_format'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_roblox_username_format
      check (roblox_username ~ '^[A-Za-z0-9_]{3,20}$') not valid;
  end if;
end $$;

-- Prevent callers from probing whether arbitrary users have a role.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or _user_id is null or _user_id <> auth.uid() then
    return false;
  end if;

  return exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = _role
  );
end;
$$;

revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

-- The server checks ADMIN_BOOTSTRAP_SECRET before calling this function. The
-- advisory lock makes the one-time initialization race-safe.
create or replace function public.fn_claim_admin(_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _user is null then
    raise exception 'Usuário inválido';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bluxtrade-admin-bootstrap', 0));

  if exists (select 1 from public.user_roles where role = 'admin') then
    raise exception 'A administração já foi inicializada';
  end if;

  insert into public.user_roles (user_id, role)
  values (_user, 'admin')
  on conflict (user_id, role) do nothing;
end;
$$;

revoke all on function public.fn_claim_admin(uuid) from public, anon, authenticated;
grant execute on function public.fn_claim_admin(uuid) to service_role;

-- New account creation is validated by the trigger, not by browser checks.
-- Four words from a 64-word English vocabulary provide 16,777,216 possible
-- word combinations before considering account timing and the branded prefix.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  words text[] := array[
    'amber','anchor','apex','apple','arrow','atlas','aurora','badge',
    'beacon','blue','brave','bridge','canyon','cinder','cobalt','comet',
    'coral','cosmic','crystal','daring','delta','ember','falcon','feather',
    'flare','forest','galaxy','golden','harbor','honest','jade','jupiter',
    'lunar','maple','marble','meadow','meteor','midnight','mint','nebula',
    'ocean','orbit','pearl','phoenix','pilot','planet','raven','rocket',
    'sapphire','shadow','silver','solar','spark','summit','thunder','tiger',
    'velvet','vertex','violet','wave','whisper','willow','winter','zenith'
  ];
  username text;
  phrase text := 'invest with bluxtrade';
  i integer;
begin
  username := trim(coalesce(new.raw_user_meta_data->>'roblox_username', ''));
  if username !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'Nome de usuário Roblox inválido';
  end if;

  for i in 1..4 loop
    phrase := phrase || ' ' || words[1 + (get_byte(gen_random_bytes(1), 0) % cardinality(words))];
  end loop;

  insert into public.profiles (id, email, roblox_username, verify_phrase)
  values (new.id, new.email, username, phrase);

  insert into public.profile_challenges (user_id, verify_phrase)
  values (new.id, phrase);

  insert into public.user_roles (user_id, role)
  values (new.id, 'user');

  return new;
end;
$$;

comment on column public.profiles.verify_phrase is
  'Legacy server-only copy. Browser reads use public.profile_challenges with owner-only RLS.';

-- Admins do not need direct PostgREST access to every user's profile. The
-- server-side adminOverview uses service_role and returns only operational data.
drop policy if exists "own profile" on public.profiles;
create policy "own profile"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

-- Keep the pending-deposit limit atomic under concurrent requests.
create or replace function public.fn_request_deposit(_user uuid, _amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verified boolean;
  v_pending integer;
begin
  if _user is null then
    raise exception 'Usuário inválido';
  end if;
  _amount := round(_amount, 2);
  if _amount < 10 or _amount > 10000000 or _amount <> trunc(_amount, 0) then
    raise exception 'Valor de depósito inválido';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bluxtrade-deposit:' || _user::text, 0));

  select verified into v_verified
  from public.profiles
  where id = _user
  for update;
  if not found then
    raise exception 'Perfil não encontrado';
  end if;
  if not v_verified then
    raise exception 'Verifique sua conta Roblox primeiro';
  end if;

  select count(*)::integer into v_pending
  from public.deposits
  where user_id = _user and status = 'pending';
  if v_pending >= 3 then
    raise exception 'Você já tem 3 depósitos aguardando confirmação';
  end if;

  insert into public.deposits (user_id, amount)
  values (_user, _amount);
end;
$$;

revoke all on function public.fn_request_deposit(uuid, numeric) from public, anon, authenticated;
grant execute on function public.fn_request_deposit(uuid, numeric) to service_role;

commit;
