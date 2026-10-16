-- Affiliate commissions are accrued as pending earnings and claimed exactly once.
begin;

alter table public.affiliate_earnings
  add column if not exists claimed_at timestamptz;

create index if not exists affiliate_earnings_pending_idx
  on public.affiliate_earnings (affiliate_id, claimed_at)
  where claimed_at is null;

create or replace function public.fn_claim_affiliate(_user uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric;
begin
  select coalesce(sum(amount), 0) into v_amount
  from public.affiliate_earnings
  where affiliate_id = _user and claimed_at is null;

  if v_amount <= 0 then
    raise exception 'No pending affiliate earnings';
  end if;

  update public.affiliate_earnings
  set claimed_at = now()
  where affiliate_id = _user and claimed_at is null;

  update public.profiles
  set balance = balance + v_amount
  where id = _user;

  return v_amount;
end;
$$;

revoke all on function public.fn_claim_affiliate(uuid) from public, anon, authenticated;
grant execute on function public.fn_claim_affiliate(uuid) to service_role;

-- Keep the 1% commission pending until the affiliate explicitly claims it.
create or replace function public.fn_open_position(
  _user uuid, _symbol text, _side text, _margin numeric, _lev int, _price numeric
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  pl public.pool;
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
  if p.balance < _margin + v_opening_fee then raise exception 'Insufficient balance for margin and opening fee'; end if;
  select * into pl from public.pool where id = 1 for update;
  v_borrowed := _margin * (_lev - 1);
  v_reserved := _margin * 5;
  if v_borrowed + v_reserved > (pl.total_assets - pl.total_reserved) then raise exception 'Insufficient pool liquidity'; end if;
  v_qty := (_margin * _lev) / _price;
  if _side = 'long' then v_liq := _price * (1 - 0.9 / _lev); else v_liq := _price * (1 + 0.9 / _lev); end if;
  v_staker_fee := round(v_opening_fee * 0.40, 2);
  v_affiliate_fee := round(v_opening_fee * 0.10, 2);
  v_platform_fee := round(v_opening_fee * 0.50, 2);
  select referred_by into v_affiliate from public.profiles where id = _user;
  if v_affiliate is null then v_platform_fee := v_platform_fee + v_affiliate_fee; v_affiliate_fee := 0; end if;
  update public.profiles set balance = balance - _margin - v_opening_fee where id = _user;
  if pl.total_shares > 0 and v_staker_fee > 0 then
    update public.pool set total_assets = total_assets + v_staker_fee, fees_to_stakers = fees_to_stakers + v_staker_fee where id = 1;
  end if;
  update public.pool set total_reserved = total_reserved + v_borrowed + v_reserved, platform_revenue = platform_revenue + v_platform_fee where id = 1;
  insert into public.positions (user_id, symbol, side, margin, leverage, borrowed, reserved, qty, entry_price, liq_price, opening_fee)
  values (_user, _symbol, _side, _margin, _lev, v_borrowed, v_reserved, v_qty, _price, v_liq, v_opening_fee) returning id into v_id;
  if v_affiliate is not null and v_affiliate_fee > 0 then
    insert into public.affiliate_earnings (affiliate_id, referred_user_id, position_id, amount)
    values (v_affiliate, _user, v_id, v_affiliate_fee);
  end if;
  return v_id;
end $$;

revoke all on function public.fn_open_position(uuid,text,text,numeric,int,numeric) from public, anon, authenticated;
grant execute on function public.fn_open_position(uuid,text,text,numeric,int,numeric) to service_role;
commit;
