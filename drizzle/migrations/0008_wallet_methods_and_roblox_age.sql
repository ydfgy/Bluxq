begin;

alter table public.profiles
  add column if not exists roblox_created_at timestamptz;

alter table public.deposits
  add column if not exists payment_method text not null default 'roblox',
  add column if not exists asset text,
  add column if not exists network text,
  add column if not exists transaction_hash text;

alter table public.withdrawals
  add column if not exists payout_method text not null default 'roblox',
  add column if not exists asset text,
  add column if not exists network text,
  add column if not exists destination text;

alter table public.deposits drop constraint if exists deposits_payment_method_check;
alter table public.deposits add constraint deposits_payment_method_check
  check (payment_method in ('roblox', 'crypto'));
alter table public.withdrawals drop constraint if exists withdrawals_payout_method_check;
alter table public.withdrawals add constraint withdrawals_payout_method_check
  check (payout_method in ('roblox', 'crypto'));

create or replace function public.fn_request_deposit_v2(
  _user uuid, _amount numeric, _payment_method text, _asset text default null,
  _network text default null, _transaction_hash text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_verified boolean; v_pending integer;
begin
  if _payment_method not in ('roblox', 'crypto') then raise exception 'Método de depósito inválido'; end if;
  _amount := round(_amount, 2);
  if _amount < 10 or _amount > 10000000 or _amount <> trunc(_amount, 0) then raise exception 'Valor de depósito inválido'; end if;
  if _payment_method = 'crypto' and (nullif(trim(coalesce(_asset, '')), '') is null or nullif(trim(coalesce(_network, '')), '') is null or nullif(trim(coalesce(_transaction_hash, '')), '') is null) then
    raise exception 'Informe moeda, rede e hash da transação cripto';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('bluxtrade-deposit:' || _user::text, 0));
  select verified into v_verified from public.profiles where id = _user for update;
  if not found then raise exception 'Perfil não encontrado'; end if;
  if not v_verified then raise exception 'Verifique sua conta Roblox primeiro'; end if;
  select count(*)::integer into v_pending from public.deposits where user_id = _user and status = 'pending';
  if v_pending >= 3 then raise exception 'Você já tem 3 depósitos aguardando confirmação'; end if;
  insert into public.deposits (user_id, amount, payment_method, asset, network, transaction_hash)
  values (_user, _amount, _payment_method, nullif(trim(_asset), ''), nullif(trim(_network), ''), nullif(trim(_transaction_hash), ''));
end;
$$;

create or replace function public.fn_request_withdraw_v2(
  _user uuid, _amount numeric, _payout_method text, _asset text default null,
  _network text default null, _destination text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if _payout_method not in ('roblox', 'crypto') then raise exception 'Método de saque inválido'; end if;
  _amount := round(_amount, 2);
  if _amount < 10 then raise exception 'Saque mínimo $BX10'; end if;
  if _payout_method = 'crypto' and (nullif(trim(coalesce(_asset, '')), '') is null or nullif(trim(coalesce(_network, '')), '') is null or nullif(trim(coalesce(_destination, '')), '') is null) then
    raise exception 'Informe moeda, rede e endereço de destino';
  end if;
  select * into p from public.profiles where id = _user for update;
  if not found then raise exception 'Perfil não encontrado'; end if;
  if not p.verified then raise exception 'Verifique sua conta Roblox primeiro'; end if;
  if p.balance < _amount then raise exception 'Saldo insuficiente'; end if;
  update public.profiles set balance = balance - _amount where id = _user;
  insert into public.withdrawals (user_id, amount, payout_method, asset, network, destination)
  values (_user, _amount, _payout_method, nullif(trim(_asset), ''), nullif(trim(_network), ''), nullif(trim(_destination), ''));
end;
$$;

revoke all on function public.fn_request_deposit_v2(uuid,numeric,text,text,text,text) from public, anon, authenticated;
grant execute on function public.fn_request_deposit_v2(uuid,numeric,text,text,text,text) to service_role;
revoke all on function public.fn_request_withdraw_v2(uuid,numeric,text,text,text,text) from public, anon, authenticated;
grant execute on function public.fn_request_withdraw_v2(uuid,numeric,text,text,text,text) to service_role;

commit;
