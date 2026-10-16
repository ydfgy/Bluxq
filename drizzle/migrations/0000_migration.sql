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
  words text[] := array['banana','foguete','pizza','dragao','neon','tigre','robo','lua','cometa','ninja','turbo','cristal','vulcao','pinguim','raio','castelo','galaxia','abacaxi','trovao','lobo'];
  phrase text;
begin
  phrase := 'bluxx ' || words[1+floor(random()*20)::int] || ' ' || words[1+floor(random()*20)::int] || ' ' || words[1+floor(random()*20)::int] || ' ' || (100+floor(random()*900)::int)::text;
  insert into public.profiles (id, email, roblox_username, verify_phrase)
  values (new.id, new.email, coalesce(nullif(new.raw_user_meta_data->>'roblox_username',''),'sem-nome'), phrase);
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ===== Money functions (service_role only) =====
create or replace function public.fn_open_position(_user uuid, _symbol text, _side text, _margin numeric, _lev int, _price numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare p public.profiles; pl public.pool; v_borrowed numeric; v_reserved numeric; v_qty numeric; v_liq numeric; v_id uuid;
begin
  if _side not in ('long','short') then raise exception 'Lado inválido'; end if;
  if _lev < 1 or _lev > 50 then raise exception 'Alavancagem deve ser entre 1x e 50x'; end if;
  if _margin < 10 then raise exception 'Margem mínima é $BX10'; end if;
  if _price is null or _price <= 0 then raise exception 'Preço indisponível'; end if;
  _margin := round(_margin, 2);
  select * into p from public.profiles where id = _user for update;
  if not p.verified then raise exception 'Verifique sua conta Roblox primeiro'; end if;
  if p.balance < _margin then raise exception 'Saldo insuficiente'; end if;
  select * into pl from public.pool where id = 1 for update;
  v_borrowed := _margin * (_lev - 1);
  v_reserved := _margin * 5; -- lucro máximo garantido pela pool
  if v_borrowed + v_reserved > (pl.total_assets - pl.total_reserved) then
    raise exception 'Liquidez insuficiente na pool de alavancagem (disponível: $BX%)', round(pl.total_assets - pl.total_reserved, 2);
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
  if not found then raise exception 'Posição não encontrada'; end if;
  if _user is not null and pos.user_id <> _user then raise exception 'Posição não encontrada'; end if;
  if _price is null or _price <= 0 then raise exception 'Preço indisponível'; end if;
  v_liq := _force_liq or (pos.side = 'long' and _price <= pos.liq_price) or (pos.side = 'short' and _price >= pos.liq_price);
  select * into pl from public.pool where id = 1 for update;
  if v_liq then
    v_pnl := -pos.margin; v_payout := 0; v_status := 'liquidated';
    -- margem inteira vai para a pool (stakers)
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
    -- pool é contraparte: paga lucro (até a reserva) ou recebe prejuízo; recebe 70% da taxa
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
  if _amount < 1 then raise exception 'Valor mínimo $BX1'; end if;
  select * into p from public.profiles where id = _user for update;
  if not p.verified then raise exception 'Verifique sua conta Roblox primeiro'; end if;
  if p.balance < _amount then raise exception 'Saldo insuficiente'; end if;
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
  if _amount <= 0 then raise exception 'Valor inválido'; end if;
  select * into pl from public.pool where id = 1 for update;
  select * into s from public.stakes where user_id = _user for update;
  if not found or s.shares <= 0 then raise exception 'Você não tem stake'; end if;
  v_value := trunc(s.shares * pl.total_assets / pl.total_shares, 2);
  if _amount > v_value then raise exception 'Você só tem $BX% em stake', v_value; end if;
  if _amount > pl.total_assets - pl.total_reserved then raise exception 'Liquidez em uso por operações abertas. Disponível agora: $BX%', trunc(pl.total_assets - pl.total_reserved, 2); end if;
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
  if _amount < 10 then raise exception 'Saque mínimo $BX10'; end if;
  select * into p from public.profiles where id = _user for update;
  if not p.verified then raise exception 'Verifique sua conta Roblox primeiro'; end if;
  if p.balance < _amount then raise exception 'Saldo insuficiente'; end if;
  update public.profiles set balance = balance - _amount where id = _user;
  insert into public.withdrawals (user_id, amount) values (_user, _amount);
end $$;

create or replace function public.fn_review_deposit(_id uuid, _approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare d public.deposits;
begin
  select * into d from public.deposits where id = _id and status = 'pending' for update;
  if not found then raise exception 'Depósito não encontrado'; end if;
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
  if not found then raise exception 'Saque não encontrado'; end if;
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