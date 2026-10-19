-- Per-market liquidity accounting: each market has its own pool, reservations,
-- rewards and daily NAV snapshots. Legacy public.pool remains available for
-- backwards compatibility with old balances, but new positions use market_pools.
begin;

create or replace function public.fn_open_position(
  _user uuid, _symbol text, _side text, _margin numeric, _lev int, _price numeric
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  mp public.market_pools;
  v_borrowed numeric;
  v_reserved numeric;
  v_qty numeric;
  v_liq numeric;
  v_id uuid;
  v_opening_fee numeric;
  v_staker_fee numeric;
  v_affiliate_fee numeric;
  v_platform_fee numeric;
  v_affiliate uuid;
begin
  if _side not in ('long','short') then raise exception 'Invalid side'; end if;
  if _lev < 1 or _lev > 50 then raise exception 'Leverage must be between 1x and 50x'; end if;
  if _margin < 10 then raise exception 'Minimum margin is $BX10'; end if;
  if _price is null or _price <= 0 then raise exception 'Price unavailable'; end if;
  _margin := round(_margin, 2);
  v_opening_fee := round(_margin * 0.10, 2);

  select * into p from public.profiles where id = _user for update;
  if not found then raise exception 'Profile not found'; end if;
  if not p.verified then raise exception 'Verify your Roblox account first'; end if;
  if p.balance < _margin + v_opening_fee then
    raise exception 'Insufficient balance for margin and opening fee';
  end if;
  select * into mp from public.market_pools where symbol = _symbol for update;
  if not found then raise exception 'Pool not found for this market'; end if;

  v_borrowed := _margin * (_lev - 1);
  v_reserved := _margin * 5;
  if v_borrowed + v_reserved > greatest(mp.total_assets - mp.total_reserved, 0) then
    raise exception 'Insufficient pool liquidity';
  end if;
  v_qty := (_margin * _lev) / _price;
  if _side = 'long' then v_liq := _price * (1 - 0.9 / _lev);
  else v_liq := _price * (1 + 0.9 / _lev); end if;

  v_staker_fee := round(v_opening_fee * 0.40, 2);
  v_affiliate_fee := round(v_opening_fee * 0.10, 2);
  v_platform_fee := round(v_opening_fee * 0.50, 2);
  select referred_by into v_affiliate from public.profiles where id = _user;
  if v_affiliate is null then
    v_platform_fee := v_platform_fee + v_affiliate_fee;
    v_affiliate_fee := 0;
  end if;

  update public.profiles set balance = balance - _margin - v_opening_fee where id = _user;
  update public.market_pools
    set total_assets = total_assets + case when total_shares > 0 then v_staker_fee else 0 end,
        fees_to_stakers = fees_to_stakers + case when total_shares > 0 then v_staker_fee else 0 end,
        total_reserved = total_reserved + v_borrowed + v_reserved,
        platform_revenue = platform_revenue + v_platform_fee,
        updated_at = now()
    where symbol = _symbol;
  insert into public.positions (
    user_id, symbol, side, margin, leverage, borrowed, reserved,
    qty, entry_price, liq_price, opening_fee
  ) values (
    _user, _symbol, _side, _margin, _lev, v_borrowed, v_reserved,
    v_qty, _price, v_liq, v_opening_fee
  ) returning id into v_id;

  if v_affiliate is not null and v_affiliate_fee > 0 then
    insert into public.affiliate_earnings (affiliate_id, referred_user_id, position_id, amount)
    values (v_affiliate, _user, v_id, v_affiliate_fee);
  end if;
  perform public.fn_snapshot_market_pool(_symbol);
  return v_id;
end;
$$;

create or replace function public.fn_close_position(
  _user uuid, _id uuid, _price numeric, _force_liq boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pos public.positions;
  mp public.market_pools;
  v_pnl numeric;
  v_fee numeric := 0;
  v_payout numeric := 0;
  v_liq boolean;
  v_status text;
  v_stakers numeric;
  v_platform numeric;
begin
  select * into pos from public.positions where id = _id and status = 'open' for update;
  if not found then raise exception 'Position not found'; end if;
  if _user is not null and pos.user_id <> _user then raise exception 'Position not found'; end if;
  if _price is null or _price <= 0 then raise exception 'Price unavailable'; end if;
  v_liq := _force_liq or (pos.side = 'long' and _price <= pos.liq_price)
    or (pos.side = 'short' and _price >= pos.liq_price);
  select * into mp from public.market_pools where symbol = pos.symbol for update;
  if not found then raise exception 'Pool not found for this market'; end if;

  if v_liq then
    v_pnl := -pos.margin; v_payout := 0; v_status := 'liquidated';
    update public.market_pools
      set total_assets = total_assets + pos.margin,
          total_reserved = greatest(total_reserved - pos.borrowed - pos.reserved, 0),
          updated_at = now()
      where symbol = pos.symbol;
  else
    if pos.side = 'long' then v_pnl := pos.qty * (_price - pos.entry_price);
    else v_pnl := pos.qty * (pos.entry_price - _price); end if;
    v_pnl := greatest(least(v_pnl, pos.reserved), -pos.margin);
    v_pnl := trunc(v_pnl, 2);
    if v_pnl > 0 then v_fee := trunc(v_pnl * 0.10, 2); end if;
    v_payout := greatest(pos.margin + v_pnl - v_fee, 0);
    v_status := 'closed';
    if mp.total_shares > 0 then v_stakers := trunc(v_fee * 0.7, 2); else v_stakers := 0; end if;
    v_platform := v_fee - v_stakers;
    update public.market_pools
      set total_assets = total_assets - v_pnl + v_stakers,
          total_reserved = greatest(total_reserved - pos.borrowed - pos.reserved, 0),
          platform_revenue = platform_revenue + v_platform,
          fees_to_stakers = fees_to_stakers + v_stakers,
          updated_at = now()
      where symbol = pos.symbol;
    update public.profiles set balance = balance + v_payout where id = pos.user_id;
  end if;

  update public.positions set status = v_status, exit_price = _price, pnl = v_pnl,
    fee = v_fee, payout = v_payout, closed_at = now() where id = _id;
  perform public.fn_snapshot_market_pool(pos.symbol);
  return jsonb_build_object('status', v_status, 'pnl', v_pnl, 'fee', v_fee, 'payout', v_payout);
end;
$$;

-- Make snapshots available to a scheduled job or an admin refresh without
-- changing user balances.
create or replace function public.fn_snapshot_all_market_pools()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select symbol from public.market_pools order by symbol loop
    perform public.fn_snapshot_market_pool(r.symbol);
  end loop;
end;
$$;

revoke all on function public.fn_open_position(uuid,text,text,numeric,int,numeric) from public, anon, authenticated;
grant execute on function public.fn_open_position(uuid,text,text,numeric,int,numeric) to service_role;
revoke all on function public.fn_close_position(uuid,uuid,numeric,boolean) from public, anon, authenticated;
grant execute on function public.fn_close_position(uuid,uuid,numeric,boolean) to service_role;
revoke all on function public.fn_snapshot_all_market_pools() from public, anon, authenticated;
grant execute on function public.fn_snapshot_all_market_pools() to service_role;
commit;
