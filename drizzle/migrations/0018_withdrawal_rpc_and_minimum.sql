begin;

create or replace function public.fn_request_withdraw_v2(
  _user uuid,
  _amount numeric,
  _payout_method text,
  _asset text default null,
  _network text default null,
  _destination text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
begin
  if _payout_method not in ('roblox', 'crypto') then
    raise exception 'Método de saque inválido';
  end if;
  _amount := round(_amount, 2);
  if _amount < 60 then
    raise exception 'Saque mínimo $BX60';
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

  update public.profiles set balance = balance - _amount where id = _user;
  insert into public.withdrawals (user_id, amount, payout_method, asset, network, destination)
  values (
    _user,
    _amount,
    _payout_method,
    nullif(trim(_asset), ''),
    nullif(trim(_network), ''),
    nullif(trim(_destination), '')
  );
end;
$$;

revoke all on function public.fn_request_withdraw_v2(uuid, numeric, text, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_request_withdraw_v2(uuid, numeric, text, text, text, text) to service_role;

commit;
