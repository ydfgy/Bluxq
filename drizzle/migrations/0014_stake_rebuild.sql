-- Rebuild the market Stake module without changing Wallet, Trade or Auth data.
-- Existing pool balances and stakes are preserved; every new operation is auditable.

create table if not exists public.market_stake_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  symbol text not null references public.market_pools(symbol) on delete cascade,
  action text not null check (action in ('stake', 'unstake')),
  amount numeric(20,2) not null check (amount > 0),
  shares numeric(30,12) not null check (shares > 0),
  nav numeric(30,12) not null check (nav > 0),
  created_at timestamptz not null default now()
);

create index if not exists market_stake_events_user_idx
  on public.market_stake_events (user_id, created_at desc);
create index if not exists market_stake_events_pool_idx
  on public.market_stake_events (symbol, created_at desc);

grant select on public.market_stake_events to authenticated;
grant all on public.market_stake_events to service_role;
alter table public.market_stake_events enable row level security;
drop policy if exists "own market stake events" on public.market_stake_events;
create policy "own market stake events"
  on public.market_stake_events for select to authenticated
  using (user_id = auth.uid());

-- Replace only the Stake RPCs. The rest of the trading and wallet functions stay untouched.
drop function if exists public.fn_market_stake(uuid, text, numeric);
drop function if exists public.fn_market_unstake(uuid, text, numeric);

create function public.fn_market_stake(_user uuid, _symbol text, _amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
  pool public.market_pools;
  v_amount numeric;
  v_nav numeric;
  v_shares numeric;
begin
  if _user is null or _symbol is null or _amount is null or _amount = 'NaN'::numeric then
    raise exception 'Invalid Stake request';
  end if;

  v_amount := round(_amount, 2);
  if v_amount < 1 then raise exception 'Minimum amount is $BX1'; end if;

  select * into p from public.profiles where id = _user for update;
  if not found then raise exception 'Profile not found'; end if;
  if not p.verified then raise exception 'Verify your Roblox account first'; end if;
  if p.balance < v_amount then raise exception 'Insufficient balance. Add funds in Wallet first.'; end if;

  select * into pool from public.market_pools where symbol = _symbol for update;
  if not found then raise exception 'Pool not found for this market'; end if;

  v_nav := case
    when pool.total_shares > 0 and pool.total_assets > 0
      then pool.total_assets / pool.total_shares
    else 1
  end;
  v_shares := v_amount / v_nav;

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
  insert into public.market_stake_events (user_id, symbol, action, amount, shares, nav)
    values (_user, _symbol, 'stake', v_amount, v_shares, v_nav);
  perform public.fn_snapshot_market_pool(_symbol);

  return jsonb_build_object('symbol', _symbol, 'action', 'stake', 'amount', v_amount, 'shares', v_shares, 'nav', v_nav);
end;
$$;

grant execute on function public.fn_market_stake(uuid, text, numeric) to service_role;

create function public.fn_market_unstake(_user uuid, _symbol text, _amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.market_stakes;
  pool public.market_pools;
  v_amount numeric;
  v_value numeric;
  v_nav numeric;
  v_shares numeric;
begin
  if _user is null or _symbol is null or _amount is null or _amount = 'NaN'::numeric then
    raise exception 'Invalid Stake request';
  end if;

  v_amount := trunc(_amount, 2);
  if v_amount <= 0 then raise exception 'Invalid amount'; end if;

  select * into pool from public.market_pools where symbol = _symbol for update;
  if not found then raise exception 'Pool not found for this market'; end if;
  select * into s from public.market_stakes where user_id = _user and symbol = _symbol for update;
  if not found or s.shares <= 0 or pool.total_shares <= 0 then
    raise exception 'You do not have a stake in this pool';
  end if;

  v_nav := pool.total_assets / pool.total_shares;
  v_value := trunc(s.shares * v_nav, 2);
  if v_amount > v_value then raise exception 'Your stake is limited to $BX%', v_value; end if;
  if v_amount > greatest(pool.total_assets - pool.total_reserved, 0) then
    raise exception 'Liquidity is reserved by open positions. Available now: $BX%',
      trunc(greatest(pool.total_assets - pool.total_reserved, 0), 2);
  end if;

  v_shares := case when v_amount = v_value then s.shares else v_amount / v_nav end;
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
  insert into public.market_stake_events (user_id, symbol, action, amount, shares, nav)
    values (_user, _symbol, 'unstake', v_amount, v_shares, v_nav);
  perform public.fn_snapshot_market_pool(_symbol);

  return jsonb_build_object('symbol', _symbol, 'action', 'unstake', 'amount', v_amount, 'shares', v_shares, 'nav', v_nav);
end;
$$;

grant execute on function public.fn_market_unstake(uuid, text, numeric) to service_role;
