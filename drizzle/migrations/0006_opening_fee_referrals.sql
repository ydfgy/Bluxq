-- Opening fee and referral distribution
begin;

alter table public.positions
  add column if not exists opening_fee numeric(20,2) not null default 0;

alter table public.profiles
  add column if not exists referral_code text;

alter table public.profiles
  add column if not exists referred_by uuid references public.profiles(id);

update public.profiles
set referral_code = upper(substr(md5(id::text), 1, 10))
where referral_code is null;

create unique index if not exists profiles_referral_code_key
  on public.profiles (referral_code)
  where referral_code is not null;

create table if not exists public.affiliate_earnings (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.profiles(id) on delete cascade,
  referred_user_id uuid not null references public.profiles(id) on delete cascade,
  position_id uuid not null references public.positions(id) on delete cascade,
  amount numeric(20,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (position_id)
);

grant select on public.affiliate_earnings to authenticated;
grant all on public.affiliate_earnings to service_role;
alter table public.affiliate_earnings enable row level security;
drop policy if exists "own affiliate earnings" on public.affiliate_earnings;
create policy "own affiliate earnings" on public.affiliate_earnings
  for select to authenticated using (affiliate_id = auth.uid());

-- The referral is accepted only at account creation and becomes permanent.
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
  phrase text := '';
  i integer;
  referrer uuid;
begin
  username := trim(coalesce(new.raw_user_meta_data->>'roblox_username', ''));
  if username !~ '^[A-Za-z0-9_]{3,20}$' then raise exception 'Invalid Roblox username'; end if;
  for i in 1..4 loop
    phrase := concat_ws(' ', nullif(phrase, ''), words[1 + (get_byte(extensions.gen_random_bytes(1), 0) % cardinality(words))]);
  end loop;
  select id into referrer
  from public.profiles
  where referral_code = upper(trim(coalesce(new.raw_user_meta_data->>'referral_code', '')))
    and id <> new.id;
  insert into public.profiles (id, email, roblox_username, verify_phrase, referred_by)
  values (new.id, new.email, username, phrase, referrer);
  insert into public.profile_challenges (user_id, verify_phrase) values (new.id, phrase);
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end;
$$;

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
  if _margin < 10 then raise exception 'Minimum margin is B$10'; end if;
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
  if v_borrowed + v_reserved > (pl.total_assets - pl.total_reserved) then
    raise exception 'Insufficient pool liquidity';
  end if;
  v_qty := (_margin * _lev) / _price;
  if _side = 'long' then v_liq := _price * (1 - 0.9 / _lev); else v_liq := _price * (1 + 0.9 / _lev); end if;
  v_staker_fee := round(v_opening_fee * 0.04, 2);
  v_affiliate_fee := round(v_opening_fee * 0.01, 2);
  v_platform_fee := v_opening_fee - v_staker_fee - v_affiliate_fee;
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
    update public.profiles set balance = balance + v_affiliate_fee where id = v_affiliate;
    insert into public.affiliate_earnings (affiliate_id, referred_user_id, position_id, amount)
    values (v_affiliate, _user, v_id, v_affiliate_fee);
  end if;
  return v_id;
end $$;

grant execute on function public.fn_open_position(uuid,text,text,numeric,int,numeric) to service_role;
commit;
