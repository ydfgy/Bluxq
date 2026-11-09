begin;

alter table public.profiles
  add column if not exists roblox_creator_api_key text;

-- The secret is only usable by server-side service_role code.
revoke select (roblox_creator_api_key), update (roblox_creator_api_key)
  on public.profiles from anon, authenticated;

alter table public.deposits
  add column if not exists expires_at timestamptz;

update public.deposits
set expires_at = created_at + interval '30 minutes'
where expires_at is null;

alter table public.deposits
  alter column expires_at set default (now() + interval '30 minutes');
alter table public.deposits
  alter column expires_at set not null;

alter table public.deposits drop constraint if exists deposits_status_check;
alter table public.deposits add constraint deposits_status_check
  check (status in ('pending','approved','rejected','cancelled','expired'));
create index if not exists deposits_pending_expiry_idx
  on public.deposits (status, expires_at);

-- Ranking is recalculated from closed operations of the current UTC week.
drop function if exists public.fn_request_deposit_v3(uuid,numeric,text,bigint,text,text,text);

create or replace function public.fn_copy_leaderboard()
returns jsonb language plpgsql security definer set search_path = public as $$
declare cfg public.operation_settings;
begin
  select * into cfg from public.operation_settings where id = true;
  return (
    with opted as (
      select i.trader_id, i.public_id
      from public.copy_trader_opt_ins i
      join public.profiles p on p.id = i.trader_id
      where p.verified = true and i.is_active = true
        and (p.is_banned = false or p.banned_until <= now())
    ), closed as (
      select o.trader_id, o.public_id, pos.id, pos.symbol, pos.pnl, pos.closed_at
      from opted o join public.positions pos on pos.user_id = o.trader_id
      where pos.status in ('closed','liquidated') and pos.pnl is not null
        and pos.closed_at >= date_trunc('week', now())
    ), summary as (
      select trader_id, min(public_id::text)::uuid public_id, sum(pnl) total_pnl,
        count(*) trades, count(*) filter (where pnl > 0) wins
      from closed group by trader_id
      having count(*) >= cfg.ranking_min_trades and sum(pnl) >= cfg.ranking_min_pnl
    ), rows as (
      select s.*, round(s.total_pnl, 2) pnl,
        round(100.0 * s.wins / nullif(s.trades, 0), 1) win_rate,
        (select x.symbol from closed x where x.trader_id = s.trader_id
         group by x.symbol order by sum(x.pnl) desc, count(*) desc, x.symbol limit 1) best_symbol,
        (select coalesce(jsonb_agg(jsonb_build_object('symbol', z.symbol, 'pnl', round(z.pnl, 2), 'trades', z.trades) order by z.pnl desc), '[]'::jsonb)
         from (select x.symbol, sum(x.pnl) pnl, count(*) trades from closed x where x.trader_id = s.trader_id group by x.symbol) z) symbols,
        (select coalesce(jsonb_agg(jsonb_build_object('value', q.running_pnl) order by q.closed_at, q.id), '[]'::jsonb)
         from (select y.id, y.closed_at, y.running_pnl from (select x.id, x.closed_at,
           round(sum(x.pnl) over (order by x.closed_at, x.id rows unbounded preceding), 2) running_pnl
           from closed x where x.trader_id = s.trader_id) y order by y.closed_at desc, y.id desc limit 30) q) curve
      from summary s
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', public_id, 'displayName', 'Trader ' || upper(substr(md5(trader_id::text), 1, 6)),
      'pnl', pnl, 'trades', trades, 'winRate', win_rate, 'bestSymbol', best_symbol,
      'symbols', symbols, 'curve', curve) order by pnl desc, trades desc, trader_id), '[]'::jsonb)
    from (select * from rows order by pnl desc, trades desc, trader_id limit cfg.ranking_limit) ranked
  );
end;
$$;
revoke all on function public.fn_copy_leaderboard() from public, anon, authenticated;
grant execute on function public.fn_copy_leaderboard() to service_role;

create or replace function public.fn_request_deposit_v3(
  _user uuid, _amount numeric, _payment_method text, _game_pass_id bigint default null,
  _asset text default null, _network text default null, _transaction_hash text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_verified boolean;
  v_pending integer;
  v_pass public.roblox_game_passes;
  v_id uuid;
begin
  update public.deposits
  set status = 'expired', reviewed_at = now()
  where user_id = _user and status = 'pending' and expires_at <= now();

  if _payment_method not in ('roblox', 'crypto') then raise exception 'Método de depósito inválido'; end if;
  _amount := round(_amount, 2);
  if _amount < 10 or _amount > 10000000 or _amount <> trunc(_amount, 0) then raise exception 'Valor de depósito inválido'; end if;
  if _payment_method = 'roblox' then
    if _game_pass_id is null then raise exception 'Selecione um Game Pass'; end if;
    select * into v_pass from public.roblox_game_passes where game_pass_id = _game_pass_id and active for share;
    if not found then raise exception 'Game Pass indisponível'; end if;
    if v_pass.robux_amount <> _amount then raise exception 'O valor não corresponde ao Game Pass'; end if;
  elsif _game_pass_id is not null then
    raise exception 'Game Pass inválido para depósito cripto';
  elsif nullif(trim(coalesce(_asset, '')), '') is null
    or nullif(trim(coalesce(_network, '')), '') is null
    or nullif(trim(coalesce(_transaction_hash, '')), '') is null then
    raise exception 'Informe moeda, rede e hash da transação cripto';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('bluxtrade-deposit:' || _user::text, 0));
  select verified into v_verified from public.profiles where id = _user for update;
  if not found then raise exception 'Perfil não encontrado'; end if;
  if not v_verified then raise exception 'Verifique sua conta Roblox primeiro'; end if;
  select count(*)::integer into v_pending from public.deposits where user_id = _user and status = 'pending';
  if v_pending >= 3 then raise exception 'Você já tem 3 depósitos aguardando confirmação'; end if;
  insert into public.deposits (user_id, amount, payment_method, game_pass_id, asset, network, transaction_hash)
  values (_user, _amount, _payment_method, _game_pass_id, nullif(trim(_asset), ''), nullif(trim(_network), ''), nullif(trim(_transaction_hash), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.fn_cancel_deposit(_user uuid, _id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.deposits;
begin
  update public.deposits
  set status = 'expired', reviewed_at = now()
  where user_id = _user and status = 'pending' and expires_at <= now();
  select * into d from public.deposits where id = _id and user_id = _user and status = 'pending' for update;
  if not found then raise exception 'Depósito não encontrado ou já encerrado'; end if;
  if d.created_at + interval '60 seconds' > now() then
    raise exception 'Aguarde pelo menos 60 segundos para cancelar o depósito';
  end if;
  update public.deposits set status = 'cancelled', reviewed_at = now() where id = _id;
end;
$$;

create or replace function public.fn_save_roblox_creator_api_key(_user uuid, _key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if length(trim(coalesce(_key, ''))) < 20 or length(_key) > 500 then raise exception 'API key inválida'; end if;
  update public.profiles set roblox_creator_api_key = trim(_key) where id = _user;
  if not found then raise exception 'Perfil não encontrado'; end if;
end;
$$;

create or replace function public.fn_has_roblox_creator_api_key(_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(length(roblox_creator_api_key) > 0, false)
  from public.profiles where id = _user;
$$;

revoke all on function public.fn_request_deposit_v3(uuid,numeric,text,bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.fn_request_deposit_v3(uuid,numeric,text,bigint,text,text,text) to service_role;
revoke all on function public.fn_cancel_deposit(uuid,uuid) from public, anon, authenticated;
grant execute on function public.fn_cancel_deposit(uuid,uuid) to service_role;
revoke all on function public.fn_save_roblox_creator_api_key(uuid,text) from public, anon, authenticated;
grant execute on function public.fn_save_roblox_creator_api_key(uuid,text) to service_role;
revoke all on function public.fn_has_roblox_creator_api_key(uuid) from public, anon, authenticated;
grant execute on function public.fn_has_roblox_creator_api_key(uuid) to service_role;

commit;
