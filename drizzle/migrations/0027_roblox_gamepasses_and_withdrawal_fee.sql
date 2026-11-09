begin;

create table if not exists public.roblox_game_passes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  game_pass_id bigint not null unique check (game_pass_id > 0),
  robux_amount integer not null check (robux_amount > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.roblox_game_passes enable row level security;
revoke all on public.roblox_game_passes from anon, authenticated;
grant all on public.roblox_game_passes to service_role;

alter table public.deposits
  add column if not exists game_pass_id bigint;

alter table public.withdrawals
  add column if not exists roblox_fee numeric(20,2) not null default 0,
  add column if not exists net_amount numeric(20,2) not null default 0;

update public.withdrawals
set net_amount = amount
where net_amount = 0;

alter table public.withdrawals
  drop constraint if exists withdrawals_amount_check;
alter table public.withdrawals
  add constraint withdrawals_amount_check check (amount > 0 and roblox_fee >= 0 and net_amount >= 0);

create or replace function public.fn_request_withdraw_v2(
  _user uuid, _amount numeric, _payout_method text, _asset text default null,
  _network text default null, _destination text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_fee numeric(20,2) := 0;
  v_net numeric(20,2);
begin
  if _payout_method not in ('roblox', 'crypto') then
    raise exception 'Método de saque inválido';
  end if;
  _amount := round(_amount, 2);
  if _amount < 100 then
    raise exception 'O saque mínimo é 100';
  end if;
  if _payout_method = 'crypto' and (
    nullif(trim(coalesce(_asset, '')), '') is null
    or nullif(trim(coalesce(_network, '')), '') is null
    or nullif(trim(coalesce(_destination, '')), '') is null
  ) then
    raise exception 'Informe moeda, rede e endereço de destino';
  end if;
  select * into p from public.profiles where id = _user for update;
  if not found then raise exception 'Perfil não encontrado'; end if;
  if not p.verified then raise exception 'Verifique sua conta Roblox primeiro'; end if;
  if p.balance < _amount then raise exception 'Saldo insuficiente'; end if;
  if _payout_method = 'roblox' then
    v_fee := round(_amount * 0.30, 2);
  end if;
  v_net := greatest(_amount - v_fee, 0);
  update public.profiles set balance = balance - _amount where id = _user;
  insert into public.withdrawals (
    user_id, amount, payout_method, asset, network, destination, roblox_fee, net_amount
  ) values (
    _user, _amount, _payout_method, nullif(trim(_asset), ''),
    nullif(trim(_network), ''), nullif(trim(_destination), ''), v_fee, v_net
  );
end;
$$;

revoke all on function public.fn_request_withdraw_v2(uuid,numeric,text,text,text,text) from public, anon, authenticated;
grant execute on function public.fn_request_withdraw_v2(uuid,numeric,text,text,text,text) to service_role;

commit;
