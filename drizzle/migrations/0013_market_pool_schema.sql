-- Create the per-market pool schema before the trading functions migration.
-- This migration is intentionally ordered before 0013_market_pool_trading_and_insights.sql.
create table if not exists public.market_pools (
  symbol text primary key,
  total_assets numeric(30,8) not null default 0 check (total_assets >= 0),
  total_shares numeric(30,12) not null default 0 check (total_shares >= 0),
  total_reserved numeric(30,8) not null default 0 check (total_reserved >= 0),
  platform_revenue numeric(30,8) not null default 0 check (platform_revenue >= 0),
  fees_to_stakers numeric(30,8) not null default 0 check (fees_to_stakers >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_stakes (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null references public.market_pools(symbol) on delete cascade,
  shares numeric(30,12) not null default 0 check (shares >= 0),
  deposited numeric(20,2) not null default 0 check (deposited >= 0),
  started_at timestamptz not null default now(),
  last_reward_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

create table if not exists public.market_pool_daily (
  symbol text not null references public.market_pools(symbol) on delete cascade,
  day date not null,
  total_assets numeric(30,8) not null check (total_assets >= 0),
  total_reserved numeric(30,8) not null check (total_reserved >= 0),
  total_shares numeric(30,12) not null check (total_shares >= 0),
  fees_to_stakers numeric(30,8) not null check (fees_to_stakers >= 0),
  platform_revenue numeric(30,8) not null check (platform_revenue >= 0),
  nav numeric(30,12) not null check (nav >= 0),
  created_at timestamptz not null default now(),
  primary key (symbol, day)
);

insert into public.market_pools (symbol)
values
  ('BTCUSDT'), ('ETHUSDT'), ('SOLUSDT'), ('BNBUSDT'), ('XRPUSDT'),
  ('DOGEUSDT'), ('ADAUSDT'), ('AVAXUSDT'), ('LINKUSDT'), ('TONUSDT')
on conflict (symbol) do nothing;

create index if not exists market_stakes_user_idx on public.market_stakes (user_id);
create index if not exists market_pool_daily_day_idx on public.market_pool_daily (day desc);

grant select on public.market_pools to authenticated;
grant select on public.market_stakes to authenticated;
grant select on public.market_pool_daily to service_role;
grant all on public.market_pools, public.market_stakes, public.market_pool_daily to service_role;

alter table public.market_pools enable row level security;
alter table public.market_stakes enable row level security;
alter table public.market_pool_daily enable row level security;

drop policy if exists "authenticated read market pools" on public.market_pools;
create policy "authenticated read market pools"
  on public.market_pools for select to authenticated using (true);

drop policy if exists "own market stake" on public.market_stakes;
create policy "own market stake"
  on public.market_stakes for select to authenticated using (user_id = auth.uid());

create or replace function public.fn_snapshot_market_pool(_symbol text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.market_pools;
  v_nav numeric;
begin
  select * into p from public.market_pools where symbol = _symbol;
  if not found then raise exception 'Pool not found for this market'; end if;
  v_nav := case when p.total_shares > 0 then p.total_assets / p.total_shares else 1 end;
  insert into public.market_pool_daily (
    symbol, day, total_assets, total_reserved, total_shares,
    fees_to_stakers, platform_revenue, nav
  ) values (
    p.symbol, current_date, p.total_assets, p.total_reserved, p.total_shares,
    p.fees_to_stakers, p.platform_revenue, v_nav
  ) on conflict (symbol, day) do update set
    total_assets = excluded.total_assets,
    total_reserved = excluded.total_reserved,
    total_shares = excluded.total_shares,
    fees_to_stakers = excluded.fees_to_stakers,
    platform_revenue = excluded.platform_revenue,
    nav = excluded.nav;
end;
$$;

create or replace function public.fn_market_stake(_user uuid, _symbol text, _amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
  pool public.market_pools;
  v_amount numeric;
  v_shares numeric;
begin
  if _symbol is null or _symbol not in (
    'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
    'DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','TONUSDT'
  ) then raise exception 'Invalid market'; end if;
  v_amount := round(_amount, 2);
  if v_amount < 1 then raise exception 'Minimum amount is $BX1'; end if;
  select * into p from public.profiles where id = _user for update;
  if not found then raise exception 'Profile not found'; end if;
  if not p.verified then raise exception 'Verify your Roblox account first'; end if;
  if p.balance < v_amount then raise exception 'Insufficient balance'; end if;
  select * into pool from public.market_pools where symbol = _symbol for update;
  if not found then raise exception 'Pool not found for this market'; end if;
  if pool.total_shares = 0 or pool.total_assets <= 0 then
    v_shares := v_amount;
  else
    v_shares := v_amount * pool.total_shares / pool.total_assets;
  end if;
  update public.profiles set balance = balance - v_amount where id = _user;
  update public.market_pools
    set total_assets = total_assets + v_amount,
        total_shares = total_shares + v_shares,
        updated_at = now()
    where symbol = _symbol;
  insert into public.market_stakes (user_id, symbol, shares, deposited)
  values (_user, _symbol, v_shares, v_amount)
  on conflict (user_id, symbol) do update set
    shares = market_stakes.shares + excluded.shares,
    deposited = market_stakes.deposited + excluded.deposited,
    last_reward_at = now();
  perform public.fn_snapshot_market_pool(_symbol);
end;
$$;

create or replace function public.fn_market_unstake(_user uuid, _symbol text, _amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.market_stakes;
  pool public.market_pools;
  v_amount numeric;
  v_value numeric;
  v_shares numeric;
begin
  v_amount := trunc(_amount, 2);
  if v_amount <= 0 then raise exception 'Invalid amount'; end if;
  select * into pool from public.market_pools where symbol = _symbol for update;
  if not found then raise exception 'Pool not found for this market'; end if;
  select * into s from public.market_stakes where user_id = _user and symbol = _symbol for update;
  if not found or s.shares <= 0 or pool.total_shares <= 0 then
    raise exception 'You do not have a stake in this pool';
  end if;
  v_value := trunc(s.shares * pool.total_assets / pool.total_shares, 2);
  if v_amount > v_value then raise exception 'Your stake is limited to $BX%', v_value; end if;
  if v_amount > pool.total_assets - pool.total_reserved then
    raise exception 'Liquidity is reserved by open positions. Available now: $BX%',
      trunc(pool.total_assets - pool.total_reserved, 2);
  end if;
  v_shares := case when v_amount = v_value then s.shares
    else v_amount * pool.total_shares / pool.total_assets end;
  update public.market_stakes
    set shares = greatest(shares - v_shares, 0),
        deposited = greatest(deposited - v_amount, 0),
        last_reward_at = now()
    where user_id = _user and symbol = _symbol;
  update public.market_pools
    set total_assets = total_assets - v_amount,
        total_shares = greatest(total_shares - v_shares, 0),
        updated_at = now()
    where symbol = _symbol;
  update public.profiles set balance = balance + v_amount where id = _user;
  perform public.fn_snapshot_market_pool(_symbol);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'fn_snapshot_market_pool(text)',
    'fn_market_stake(uuid,text,numeric)',
    'fn_market_unstake(uuid,text,numeric)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
