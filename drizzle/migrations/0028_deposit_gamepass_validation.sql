begin;

create or replace function public.fn_request_deposit_v3(
  _user uuid, _amount numeric, _payment_method text, _game_pass_id bigint default null,
  _asset text default null, _network text default null, _transaction_hash text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_verified boolean;
  v_pending integer;
  v_pass public.roblox_game_passes;
begin
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
  values (_user, _amount, _payment_method, _game_pass_id, nullif(trim(_asset), ''), nullif(trim(_network), ''), nullif(trim(_transaction_hash), ''));
end;
$$;

revoke all on function public.fn_request_deposit_v3(uuid,numeric,text,bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.fn_request_deposit_v3(uuid,numeric,text,bigint,text,text,text) to service_role;

commit;
