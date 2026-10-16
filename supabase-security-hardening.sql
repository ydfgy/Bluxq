begin;

-- BluxTrade complete Supabase bootstrap: base schema, trading functions, and security hardening.
-- Run the entire file in the intended Supabase SQL Editor.
create extension if not exists pgcrypto;


-- ===== 0000_migration.sql =====
create type public.app_role as enum ('admin','user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  roblox_username text not null,
  roblox_user_id bigint unique,
  roblox_display_name text,
  avatar_url text,
  verified boolean not null default false,
  verify_phrase text not null,
  balance numeric(20,2) not null default 0 check (balance >= 0),
  created_at timestamptz not null default now()
);
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin'));

create table public.pool (
  id int primary key default 1 check (id = 1),
  total_assets numeric(30,8) not null default 0,
  total_shares numeric(30,12) not null default 0,
  total_reserved numeric(30,8) not null default 0,
  platform_revenue numeric(30,8) not null default 0,
  fees_to_stakers numeric(30,8) not null default 0
);
insert into public.pool (id) values (1);
grant select on public.pool to authenticated;
grant all on public.pool to service_role;
alter table public.pool enable row level security;
create policy "read pool" on public.pool for select to authenticated using (true);

create table public.stakes (
  user_id uuid primary key,
  shares numeric(30,12) not null default 0 check (shares >= 0),
  deposited numeric(20,2) not null default 0
);
grant select on public.stakes to authenticated;
grant all on public.stakes to service_role;
alter table public.stakes enable row level security;
create policy "own stake" on public.stakes for select to authenticated using (user_id = auth.uid());

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  symbol text not null,
  side text not null check (side in ('long','short')),
  margin numeric(20,2) not null,
  leverage int not null,
  borrowed numeric(20,2) not null,
  reserved numeric(20,2) not null,
  qty numeric(30,12) not null,
  entry_price numeric(30,10) not null,
  liq_price numeric(30,10) not null,
  status text not null default 'open' check (status in ('open','closed','liquidated')),
  exit_price numeric(30,10),
  pnl numeric(20,2),
  fee numeric(20,2),
  payout numeric(20,2),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);
create index on public.positions (user_id, status);
create index on public.positions (status);
grant select on public.positions to authenticated;
grant all on public.positions to service_role;
alter table public.positions enable row level security;
create policy "own positions" on public.positions for select to authenticated using (user_id = auth.uid());

create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount numeric(20,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
grant select on public.deposits to authenticated;
grant all on public.deposits to service_role;
alter table public.deposits enable row level security;
create policy "own deposits" on public.deposits for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount numeric(20,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','paid','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
grant select on public.withdrawals to authenticated;
grant all on public.withdrawals to service_role;
alter table public.withdrawals enable row level security;
create policy "own withdrawals" on public.withdrawals for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

-- new user -> profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  words text[] := array['apple','rocket','pizza','dragon','neon','tiger','robot','moon','comet','ninja','turbo','crystal','volcano','penguin','lightning','castle','galaxy','pineapple','thunder','wolf'];
  phrase text;
begin
  phrase := 'blux ' || words[1+floor(random()*20)::int] || ' ' || words[1+floor(random()*20)::int] || ' ' || words[1+floor(random()*20)::int] || ' ' || (100+floor(random()*900)::int)::text;
  insert into public.profiles (id, email, roblox_username, verify_phrase)
  values (new.id, new.email, coalesce(nullif(new.raw_user_meta_data->>'roblox_username',''),'unnamed'), phrase);
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ===== Money functions (service_role only) =====
create or replace function public.fn_open_position(_user uuid, _symbol text, _side text, _margin numeric, _lev int, _price numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare p public.profiles; pl public.pool; v_borrowed numeric; v_reserved numeric; v_qty numeric; v_liq numeric; v_id uuid;
begin
  if _side not in ('long','short') then raise exception 'Invalid side'; end if;
  if _lev < 1 or _lev > 50 then raise exception 'Leverage must be between 1x and 50x'; end if;
  if _margin < 10 then raise exception 'Minimum margin is B$10'; end if;
  if _price is null or _price <= 0 then raise exception 'Price unavailable'; end if;
  _margin := round(_margin, 2);
  select * into p from public.profiles where id = _user for update;
  if not p.verified then raise exception 'Verify your Roblox account first'; end if;
  if p.balance < _margin then raise exception 'Insufficient balance'; end if;
  select * into pl from public.pool where id = 1 for update;
  v_borrowed := _margin * (_lev - 1);
  v_reserved := _margin * 5; -- maximum profit reserved by the pool
  if v_borrowed + v_reserved > (pl.total_assets - pl.total_reserved) then
    raise exception 'Insufficient leverage pool liquidity (available: B$%)', round(pl.total_assets - pl.total_reserved, 2);
  end if;
  v_qty := (_margin * _lev) / _price;
  if _side = 'long' then v_liq := _price * (1 - 0.9 / _lev); else v_liq := _price * (1 + 0.9 / _lev); end if;
  update public.profiles set balance = balance - _margin where id = _user;
  update public.pool set total_reserved = total_reserved + v_borrowed + v_reserved where id = 1;
  insert into public.positions (user_id, symbol, side, margin, leverage, borrowed, reserved, qty, entry_price, liq_price)
  values (_user, _symbol, _side, _margin, _lev, v_borrowed, v_reserved, v_qty, _price, v_liq) returning id into v_id;
  return v_id;
end $$;

create or replace function public.fn_close_position(_user uuid, _id uuid, _price numeric, _force_liq boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pos public.positions; pl public.pool; v_pnl numeric; v_fee numeric := 0; v_payout numeric := 0; v_liq boolean; v_status text; v_stakers numeric; v_platform numeric;
begin
  select * into pos from public.positions where id = _id and status = 'open' for update;
  if not found then raise exception 'Position not found'; end if;
  if _user is not null and pos.user_id <> _user then raise exception 'Position not found'; end if;
  if _price is null or _price <= 0 then raise exception 'Price unavailable'; end if;
  v_liq := _force_liq or (pos.side = 'long' and _price <= pos.liq_price) or (pos.side = 'short' and _price >= pos.liq_price);
  select * into pl from public.pool where id = 1 for update;
  if v_liq then
    v_pnl := -pos.margin; v_payout := 0; v_status := 'liquidated';
    -- The full margin goes to the pool (stakers)
    update public.pool set total_assets = total_assets + pos.margin, total_reserved = total_reserved - pos.borrowed - pos.reserved where id = 1;
  else
    if pos.side = 'long' then v_pnl := pos.qty * (_price - pos.entry_price); else v_pnl := pos.qty * (pos.entry_price - _price); end if;
    v_pnl := greatest(least(v_pnl, pos.reserved), -pos.margin);
    v_pnl := trunc(v_pnl, 2);
    if v_pnl > 0 then v_fee := trunc(v_pnl * 0.10, 2); end if;
    v_payout := greatest(pos.margin + v_pnl - v_fee, 0);
    v_status := 'closed';
    if pl.total_shares > 0 then v_stakers := trunc(v_fee * 0.7, 2); else v_stakers := 0; end if;
    v_platform := v_fee - v_stakers;
    -- The pool is the counterparty: it pays profit up to the reserve or receives losses; it receives 70% of the fee
    update public.pool set total_assets = total_assets - v_pnl + v_stakers,
      total_reserved = total_reserved - pos.borrowed - pos.reserved,
      platform_revenue = platform_revenue + v_platform,
      fees_to_stakers = fees_to_stakers + v_stakers where id = 1;
    update public.profiles set balance = balance + v_payout where id = pos.user_id;
  end if;
  update public.positions set status = v_status, exit_price = _price, pnl = v_pnl, fee = v_fee, payout = v_payout, closed_at = now() where id = _id;
  return jsonb_build_object('status', v_status, 'pnl', v_pnl, 'fee', v_fee, 'payout', v_payout);
end $$;

create or replace function public.fn_stake(_user uuid, _amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare p public.profiles; pl public.pool; v_shares numeric;
begin
  _amount := round(_amount, 2);
  if _amount < 1 then raise exception 'Minimum amount is B$1'; end if;
  select * into p from public.profiles where id = _user for update;
  if not p.verified then raise exception 'Verify your Roblox account first'; end if;
  if p.balance < _amount then raise exception 'Insufficient balance'; end if;
  select * into pl from public.pool where id = 1 for update;
  if pl.total_shares = 0 or pl.total_assets <= 0 then v_shares := _amount; else v_shares := _amount * pl.total_shares / pl.total_assets; end if;
  update public.profiles set balance = balance - _amount where id = _user;
  update public.pool set total_assets = total_assets + _amount, total_shares = total_shares + v_shares where id = 1;
  insert into public.stakes (user_id, shares, deposited) values (_user, v_shares, _amount)
  on conflict (user_id) do update set shares = stakes.shares + v_shares, deposited = stakes.deposited + _amount;
end $$;

create or replace function public.fn_unstake(_user uuid, _amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare s public.stakes; pl public.pool; v_value numeric; v_shares numeric;
begin
  _amount := trunc(_amount, 2);
  if _amount <= 0 then raise exception 'Invalid amount'; end if;
  select * into pl from public.pool where id = 1 for update;
  select * into s from public.stakes where user_id = _user for update;
  if not found or s.shares <= 0 then raise exception 'You do not have a stake'; end if;
  v_value := trunc(s.shares * pl.total_assets / pl.total_shares, 2);
  if _amount > v_value then raise exception 'Your stake is limited to B$%', v_value; end if;
  if _amount > pl.total_assets - pl.total_reserved then raise exception 'Liquidity is reserved by open positions. Available now: B$%', trunc(pl.total_assets - pl.total_reserved, 2); end if;
  v_shares := least(s.shares, _amount * pl.total_shares / pl.total_assets);
  if _amount = v_value then v_shares := s.shares; end if;
  update public.stakes set shares = shares - v_shares, deposited = greatest(deposited - _amount, 0) where user_id = _user;
  update public.pool set total_assets = total_assets - _amount, total_shares = total_shares - v_shares where id = 1;
  update public.profiles set balance = balance + _amount where id = _user;
end $$;

create or replace function public.fn_request_withdraw(_user uuid, _amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  _amount := round(_amount, 2);
  if _amount < 10 then raise exception 'Minimum withdrawal is B$10'; end if;
  select * into p from public.profiles where id = _user for update;
  if not p.verified then raise exception 'Verify your Roblox account first'; end if;
  if p.balance < _amount then raise exception 'Insufficient balance'; end if;
  update public.profiles set balance = balance - _amount where id = _user;
  insert into public.withdrawals (user_id, amount) values (_user, _amount);
end $$;

create or replace function public.fn_review_deposit(_id uuid, _approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare d public.deposits;
begin
  select * into d from public.deposits where id = _id and status = 'pending' for update;
  if not found then raise exception 'Deposit not found'; end if;
  if _approve then
    update public.profiles set balance = balance + d.amount where id = d.user_id;
    update public.deposits set status = 'approved', reviewed_at = now() where id = _id;
  else
    update public.deposits set status = 'rejected', reviewed_at = now() where id = _id;
  end if;
end $$;

create or replace function public.fn_review_withdraw(_id uuid, _paid boolean)
returns void language plpgsql security definer set search_path = public as $$
declare w public.withdrawals;
begin
  select * into w from public.withdrawals where id = _id and status = 'pending' for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if _paid then
    update public.withdrawals set status = 'paid', reviewed_at = now() where id = _id;
  else
    update public.profiles set balance = balance + w.amount where id = w.user_id;
    update public.withdrawals set status = 'rejected', reviewed_at = now() where id = _id;
  end if;
end $$;

do $$ declare f text; begin
  foreach f in array array['fn_open_position(uuid,text,text,numeric,int,numeric)','fn_close_position(uuid,uuid,numeric,boolean)','fn_stake(uuid,numeric)','fn_unstake(uuid,numeric)','fn_request_withdraw(uuid,numeric)','fn_review_deposit(uuid,boolean)','fn_review_withdraw(uuid,boolean)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ===== 0001_pool_based_leverage.sql =====
-- Minimum leverage is 5x; the ceiling is calculated from the pool's available liquidity.
create or replace function public.fn_open_position(_user uuid, _symbol text, _side text, _margin numeric, _lev int, _price numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  pl public.pool;
  v_available numeric;
  v_max_lev int;
  v_borrowed numeric;
  v_reserved numeric;
  v_qty numeric;
  v_liq numeric;
  v_id uuid;
begin
  if _side not in ('long','short') then raise exception 'Invalid side'; end if;
  if _lev < 5 or _lev > 50 then raise exception 'Leverage must be between 5x and 50x'; end if;
  if _margin < 10 then raise exception 'Minimum margin is B$10'; end if;
  if _price is null or _price <= 0 then raise exception 'Price unavailable'; end if;

  _margin := round(_margin, 2);
  select * into p from public.profiles where id = _user for update;
  if not p.verified then raise exception 'Verify your Roblox account first'; end if;
  if p.balance < _margin then raise exception 'Insufficient balance'; end if;

  select * into pl from public.pool where id = 1 for update;
  v_available := greatest(pl.total_assets - pl.total_reserved, 0);
  -- Reserve: margin * (leverage - 1) debt plus margin * 5 maximum profit.
  v_max_lev := least(50, floor(v_available / _margin - 4)::int);
  if v_max_lev < 5 then
    raise exception 'Insufficient liquidity: this margin allows at most %x (available: B$%)', greatest(v_max_lev, 0), round(v_available, 2);
  end if;
  if _lev > v_max_lev then
    raise exception 'Maximum leverage for this margin: %x (available: B$%)', v_max_lev, round(v_available, 2);
  end if;

  v_borrowed := _margin * (_lev - 1);
  v_reserved := _margin * 5;
  v_qty := (_margin * _lev) / _price;
  if _side = 'long' then v_liq := _price * (1 - 0.9 / _lev); else v_liq := _price * (1 + 0.9 / _lev); end if;

  update public.profiles set balance = balance - _margin where id = _user;
  update public.pool set total_reserved = total_reserved + v_borrowed + v_reserved where id = 1;
  insert into public.positions (user_id, symbol, side, margin, leverage, borrowed, reserved, qty, entry_price, liq_price)
  values (_user, _symbol, _side, _margin, _lev, v_borrowed, v_reserved, v_qty, _price, v_liq) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.fn_open_position(uuid,text,text,numeric,int,numeric) from public, anon, authenticated;
grant execute on function public.fn_open_position(uuid,text,text,numeric,int,numeric) to service_role;


-- ===== 0002_allow_one_x_leverage.sql =====
-- Minimum leverage is 1x; the ceiling is calculated from the pool's available liquidity.
create or replace function public.fn_open_position(_user uuid, _symbol text, _side text, _margin numeric, _lev int, _price numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  pl public.pool;
  v_available numeric;
  v_max_lev int;
  v_borrowed numeric;
  v_reserved numeric;
  v_qty numeric;
  v_liq numeric;
  v_id uuid;
begin
  if _side not in ('long','short') then raise exception 'Invalid side'; end if;
  if _lev < 1 or _lev > 50 then raise exception 'Alavancagem deve estar entre 1x e 50x'; end if;
  if _margin < 10 then raise exception 'Minimum margin is B$10'; end if;
  if _price is null or _price <= 0 then raise exception 'Price unavailable'; end if;

  _margin := round(_margin, 2);
  select * into p from public.profiles where id = _user for update;
  if not p.verified then raise exception 'Verify your Roblox account first'; end if;
  if p.balance < _margin then raise exception 'Insufficient balance'; end if;

  select * into pl from public.pool where id = 1 for update;
  v_available := greatest(pl.total_assets - pl.total_reserved, 0);
  -- Reserve: margin * (leverage - 1) debt plus margin * 5 maximum profit.
  v_max_lev := least(50, floor(v_available / _margin - 4)::int);
  if v_max_lev < 1 then
    raise exception 'Insufficient liquidity: this margin allows at most %x (available: B$%)', greatest(v_max_lev, 0), round(v_available, 2);
  end if;
  if _lev > v_max_lev then
    raise exception 'Maximum leverage for this margin: %x (available: B$%)', v_max_lev, round(v_available, 2);
  end if;

  v_borrowed := _margin * (_lev - 1);
  v_reserved := _margin * 5;
  v_qty := (_margin * _lev) / _price;
  if _side = 'long' then v_liq := _price * (1 - 0.9 / _lev); else v_liq := _price * (1 + 0.9 / _lev); end if;

  update public.profiles set balance = balance - _margin where id = _user;
  update public.pool set total_reserved = total_reserved + v_borrowed + v_reserved where id = 1;
  insert into public.positions (user_id, symbol, side, margin, leverage, borrowed, reserved, qty, entry_price, liq_price)
  values (_user, _symbol, _side, _margin, _lev, v_borrowed, v_reserved, v_qty, _price, v_liq) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.fn_open_position(uuid,text,text,numeric,int,numeric) from public, anon, authenticated;
grant execute on function public.fn_open_position(uuid,text,text,numeric,int,numeric) to service_role;


-- ===== 0003_security_hardening.sql =====
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
    raise exception 'Invalid user';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bluxtrade-admin-bootstrap', 0));

  if exists (select 1 from public.user_roles where role = 'admin') then
    raise exception 'Administration has already been initialized';
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
    raise exception 'Invalid Roblox username';
  end if;

  for i in 1..4 loop
    phrase := phrase || ' ' || words[1 + (get_byte(extensions.gen_random_bytes(1), 0) % cardinality(words))];
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
    raise exception 'Invalid user';
  end if;
  _amount := round(_amount, 2);
  if _amount < 10 or _amount > 10000000 or _amount <> trunc(_amount, 0) then
    raise exception 'Invalid deposit amount';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bluxtrade-deposit:' || _user::text, 0));

  select verified into v_verified
  from public.profiles
  where id = _user
  for update;
  if not found then
    raise exception 'Profile not found';
  end if;
  if not v_verified then
    raise exception 'Verify your Roblox account first';
  end if;

  select count(*)::integer into v_pending
  from public.deposits
  where user_id = _user and status = 'pending';
  if v_pending >= 3 then
    raise exception 'You already have 3 deposits awaiting confirmation';
  end if;

  insert into public.deposits (user_id, amount)
  values (_user, _amount);
end;
$$;

revoke all on function public.fn_request_deposit(uuid, numeric) from public, anon, authenticated;
grant execute on function public.fn_request_deposit(uuid, numeric) to service_role;

commit;
