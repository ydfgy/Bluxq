-- Alavancagem mínima de 1x e teto calculado pela liquidez livre da pool.
create or replace function public.fn_open_position(_user uuid, _symbol text, _side text, _margin numeric, _lev int, _price numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  pl public.pool;
  v_available numeric;
  v_max_lev int;
  v_borrowed numeric;
  v_reserved numeric;
  v_qty numeric;
  v_liq numeric;
  v_id uuid;
begin
  if _side not in ('long','short') then raise exception 'Lado inválido'; end if;
  if _lev < 1 or _lev > 50 then raise exception 'Alavancagem deve estar entre 1x e 50x'; end if;
  if _margin < 10 then raise exception 'Margem mínima é $BX10'; end if;
  if _price is null or _price <= 0 then raise exception 'Preço indisponível'; end if;

  _margin := round(_margin, 2);
  select * into p from public.profiles where id = _user for update;
  if not p.verified then raise exception 'Verifique sua conta Roblox primeiro'; end if;
  if p.balance < _margin then raise exception 'Saldo insuficiente'; end if;

  select * into pl from public.pool where id = 1 for update;
  v_available := greatest(pl.total_assets - pl.total_reserved, 0);
  -- Reserva: margem * (alavancagem - 1) de dívida + margem * 5 de lucro máximo.
  v_max_lev := least(50, floor(v_available / _margin - 4)::int);
  if v_max_lev < 1 then
    raise exception 'Liquidez insuficiente: esta margem permite no máximo %x (disponível: $BX%)', greatest(v_max_lev, 0), round(v_available, 2);
  end if;
  if _lev > v_max_lev then
    raise exception 'Alavancagem máxima para esta margem: %x (disponível: $BX%)', v_max_lev, round(v_available, 2);
  end if;

  v_borrowed := _margin * (_lev - 1);
  v_reserved := _margin * 5;
  v_qty := (_margin * _lev) / _price;
  if _side = 'long' then v_liq := _price * (1 - 0.9 / _lev); else v_liq := _price * (1 + 0.9 / _lev); end if;

  update public.profiles set balance = balance - _margin where id = _user;
  update public.pool set total_reserved = total_reserved + v_borrowed + v_reserved where id = 1;
  insert into public.positions (user_id, symbol, side, margin, leverage, borrowed, reserved, qty, entry_price, liq_price)
  values (_user, _symbol, _side, _margin, _lev, v_borrowed, v_reserved, v_qty, _price, v_liq) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.fn_open_position(uuid,text,text,numeric,int,numeric) from public, anon, authenticated;
grant execute on function public.fn_open_position(uuid,text,text,numeric,int,numeric) to service_role;
