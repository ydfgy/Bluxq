-- Settle an isolated liquidation at the actual exit price. The 90% threshold
-- is a trigger/buffer, not an extra 10% liquidation penalty: any unspent margin
-- is returned to the user. A price gap can still consume the full margin.
begin;

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
  select * into pos
  from public.positions
  where id = _id and status = 'open'
  for update;
  if not found then raise exception 'Position not found'; end if;
  if _user is not null and pos.user_id <> _user then raise exception 'Position not found'; end if;
  if _price is null or _price <= 0 then raise exception 'Price unavailable'; end if;

  v_liq := _force_liq
    or (pos.side = 'long' and _price <= pos.liq_price)
    or (pos.side = 'short' and _price >= pos.liq_price);

  select * into mp from public.market_pools where symbol = pos.symbol for update;
  if not found then raise exception 'Pool not found for this market'; end if;

  if v_liq then
    if pos.side = 'long' then
      v_pnl := pos.qty * (_price - pos.entry_price);
    else
      v_pnl := pos.qty * (pos.entry_price - _price);
    end if;
    -- A liquidation cannot realize a profit. Clamp losses to isolated margin.
    v_pnl := trunc(greatest(least(v_pnl, 0), -pos.margin), 2);
    v_payout := greatest(pos.margin + v_pnl, 0);
    v_status := 'liquidated';

    update public.market_pools
    set total_assets = total_assets - v_pnl,
        total_reserved = greatest(total_reserved - pos.borrowed - pos.reserved, 0),
        updated_at = now()
    where symbol = pos.symbol;

    update public.profiles
    set balance = balance + v_payout
    where id = pos.user_id;
  else
    if pos.side = 'long' then
      v_pnl := pos.qty * (_price - pos.entry_price);
    else
      v_pnl := pos.qty * (pos.entry_price - _price);
    end if;
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

    update public.profiles
    set balance = balance + v_payout
    where id = pos.user_id;
  end if;

  update public.positions
  set status = v_status,
      exit_price = _price,
      pnl = v_pnl,
      fee = v_fee,
      payout = v_payout,
      closed_at = now()
  where id = _id;

  perform public.fn_snapshot_market_pool(pos.symbol);
  return jsonb_build_object('status', v_status, 'pnl', v_pnl, 'fee', v_fee, 'payout', v_payout);
end;
$$;

revoke all on function public.fn_close_position(uuid,uuid,numeric,boolean) from public, anon, authenticated;
grant execute on function public.fn_close_position(uuid,uuid,numeric,boolean) to service_role;

commit;
