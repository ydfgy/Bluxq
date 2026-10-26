-- Copy trading v1: opt-in ranking, pseudonymous IDs, bounded allocations and event history.
-- The project's scripts/migrate.mjs runner applies this file after migrations 0000-0018.
create table if not exists public.copy_trader_opt_ins (
  trader_id uuid primary key references auth.users(id) on delete cascade,
  public_id uuid not null default gen_random_uuid() unique,
  opted_in_at timestamptz not null default now(),
  show_public_name boolean not null default false,
  is_active boolean not null default true
);

create table if not exists public.copy_allocations (
  id uuid primary key default gen_random_uuid(),
  copier_id uuid not null references auth.users(id) on delete cascade,
  trader_id uuid not null references public.copy_trader_opt_ins(trader_id) on delete cascade,
  budget numeric(20,2) not null check (budget >= 10),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint copy_allocations_no_self_copy check (copier_id <> trader_id),
  constraint copy_allocations_one_per_pair unique (copier_id, trader_id)
);

create table if not exists public.copy_position_links (
  leader_position_id uuid not null references public.positions(id) on delete cascade,
  allocation_id uuid not null references public.copy_allocations(id) on delete cascade,
  copied_position_id uuid not null unique references public.positions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (leader_position_id, allocation_id)
);

create table if not exists public.copy_trade_events (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.copy_allocations(id) on delete cascade,
  leader_position_id uuid not null references public.positions(id) on delete cascade,
  copied_position_id uuid references public.positions(id) on delete set null,
  status text not null check (status in ('copied','skipped','closed')),
  reason text,
  created_at timestamptz not null default now(),
  unique (allocation_id, leader_position_id)
);

create index if not exists copy_allocations_trader_active_idx
  on public.copy_allocations (trader_id, is_active);
create index if not exists copy_position_links_allocation_idx
  on public.copy_position_links (allocation_id);

alter table public.copy_trader_opt_ins enable row level security;
alter table public.copy_allocations enable row level security;
alter table public.copy_position_links enable row level security;
alter table public.copy_trade_events enable row level security;

-- Clients may inspect only their own allocations; all writes go through authenticated server functions.
grant select on public.copy_allocations to authenticated;
grant all on public.copy_trader_opt_ins, public.copy_allocations, public.copy_position_links to service_role;
grant select on public.copy_trade_events to authenticated;
grant all on public.copy_trade_events to service_role;
create policy "own copy allocations" on public.copy_allocations
  for select to authenticated using (copier_id = auth.uid());
create policy "own copy trade events" on public.copy_trade_events
  for select to authenticated using (exists (
    select 1 from public.copy_allocations a where a.id=allocation_id and a.copier_id=auth.uid()
  ));

create or replace function public.fn_copy_leaderboard()
returns jsonb language sql stable security definer set search_path = public as $$
  with opted as (
    select i.trader_id, i.public_id, i.show_public_name, p.roblox_display_name, p.roblox_username
    from public.copy_trader_opt_ins i
    join public.profiles p on p.id = i.trader_id
    where p.verified = true and i.is_active = true
  ), closed as (
    select o.trader_id, p.id, p.symbol, p.pnl, p.closed_at
    from opted o
    join public.positions p on p.user_id = o.trader_id
    where p.status in ('closed','liquidated') and p.pnl is not null and p.closed_at is not null
  ), summary as (
    select trader_id, sum(pnl) as total_pnl, count(*) as trades,
           count(*) filter (where pnl > 0) as wins
    from closed group by trader_id having count(*) > 0
  ), rows as (
    select s.trader_id, o.public_id,
      case when o.show_public_name then coalesce(nullif(o.roblox_display_name,''), nullif(o.roblox_username,''), 'Trader')
           else 'Trader ' || upper(substr(md5(s.trader_id::text),1,6)) end as display_name,
      round(s.total_pnl,2) as pnl, s.trades,
      round(100.0 * s.wins / nullif(s.trades,0),1) as win_rate,
      (select x.symbol from closed x where x.trader_id=s.trader_id group by x.symbol order by sum(x.pnl) desc, count(*) desc, x.symbol limit 1) as best_symbol,
      (select coalesce(jsonb_agg(jsonb_build_object('symbol', z.symbol, 'pnl', round(z.pnl,2), 'trades',z.trades) order by z.pnl desc), '[]'::jsonb)
       from (select x.symbol, sum(x.pnl) pnl, count(*) trades from closed x where x.trader_id=s.trader_id group by x.symbol) z) as symbols,
      (select coalesce(jsonb_agg(jsonb_build_object('value', q.running_pnl) order by q.closed_at,q.id), '[]'::jsonb)
       from (select y.id,y.closed_at,y.running_pnl from
             (select x.id,x.closed_at,round(sum(x.pnl) over(order by x.closed_at,x.id rows unbounded preceding),2) running_pnl
              from closed x where x.trader_id=s.trader_id) y
             order by y.closed_at desc,y.id desc limit 30) q) as curve
    from summary s join opted o on o.trader_id=s.trader_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', public_id, 'displayName', display_name, 'pnl', pnl, 'trades', trades,
    'winRate', win_rate, 'bestSymbol', best_symbol, 'symbols', symbols, 'curve', curve
  ) order by pnl desc, trades desc), '[]'::jsonb) from (select * from rows order by pnl desc, trades desc limit 5) top_rows;
$$;
revoke all on function public.fn_copy_leaderboard() from public, anon, authenticated;
grant execute on function public.fn_copy_leaderboard() to service_role;

create or replace function public.fn_set_copy_trader_opt_in(_user uuid, _enabled boolean, _show_name boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _enabled then
    if not exists(select 1 from public.profiles where id=_user and verified=true) then
      raise exception 'Verifique sua conta antes de participar do ranking';
    end if;
    insert into public.copy_trader_opt_ins(trader_id,show_public_name)
      values(_user,_show_name)
      on conflict(trader_id) do update set show_public_name=excluded.show_public_name,is_active=true,opted_in_at=now();
  else
    update public.copy_trader_opt_ins set is_active=false,show_public_name=false where trader_id=_user;
    update public.copy_allocations set is_active=false,updated_at=now() where trader_id=_user;
  end if;
end $$;
revoke all on function public.fn_set_copy_trader_opt_in(uuid,boolean,boolean) from public, anon, authenticated;
grant execute on function public.fn_set_copy_trader_opt_in(uuid,boolean,boolean) to service_role;

create or replace function public.fn_save_copy_allocation(_user uuid, _trader_key uuid, _budget numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_balance numeric; v_other_budget numeric; v_trader uuid;
begin
  if _budget is null or _budget < 10 or _budget > 10000000 then raise exception 'A alocação deve ser entre $BX 10 e $BX 10.000.000'; end if;
  select trader_id into v_trader from public.copy_trader_opt_ins where public_id=_trader_key and is_active=true;
  if not found or not exists(select 1 from public.profiles where id=v_trader and verified=true) then
    raise exception 'Este trader não está mais disponível para cópia';
  end if;
  if _user = v_trader then raise exception 'Não é possível copiar a própria conta'; end if;
  select balance into v_balance from public.profiles where id=_user and verified=true for update;
  if not found then raise exception 'Verifique sua conta antes de usar o copy trading'; end if;
  select coalesce(sum(budget),0) into v_other_budget from public.copy_allocations
    where copier_id=_user and is_active=true and trader_id<>v_trader;
  if v_balance < _budget + v_other_budget then raise exception 'O total das alocações ativas excede seu saldo disponível'; end if;
  insert into public.copy_allocations(copier_id,trader_id,budget,is_active)
    values(_user,v_trader,round(_budget,2),true)
    on conflict(copier_id,trader_id) do update set budget=excluded.budget,is_active=true,updated_at=now()
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.fn_save_copy_allocation(uuid,uuid,numeric) from public, anon, authenticated;
grant execute on function public.fn_save_copy_allocation(uuid,uuid,numeric) to service_role;

create or replace function public.fn_toggle_copy_allocation(_user uuid, _allocation uuid, _active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_trader uuid; v_budget numeric; v_balance numeric; v_other_budget numeric;
begin
  if _active then
    select balance into v_balance from public.profiles where id=_user and verified=true for update;
    if not found then raise exception 'Verifique sua conta antes de usar o copy trading'; end if;
  end if;
  select trader_id,budget into v_trader,v_budget from public.copy_allocations
    where id=_allocation and copier_id=_user for update;
  if not found then raise exception 'Alocação de copy trading não encontrada'; end if;
  if _active then
    if not exists(select 1 from public.copy_trader_opt_ins oi join public.profiles p on p.id=oi.trader_id
                  where oi.trader_id=v_trader and oi.is_active=true and p.verified=true) then
      raise exception 'Este trader não está mais disponível para cópia';
    end if;
    select coalesce(sum(budget),0) into v_other_budget from public.copy_allocations
      where copier_id=_user and is_active=true and id<>_allocation;
    if v_balance < v_budget+v_other_budget then raise exception 'O total das alocações ativas excede seu saldo disponível'; end if;
  end if;
  update public.copy_allocations set is_active=_active,updated_at=now()
    where id=_allocation and copier_id=_user;
end $$;
revoke all on function public.fn_toggle_copy_allocation(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.fn_toggle_copy_allocation(uuid,uuid,boolean) to service_role;

-- Mirror only direct leader positions. Replicas do not recursively fan out.
create or replace function public.fn_copy_mirror_open_position()
returns trigger language plpgsql security definer set search_path = public as $$
declare a record; v_equity numeric; v_used numeric; v_margin numeric; v_copy_id uuid;
begin
  if current_setting('app.copy_mirroring',true) = 'on' then return new; end if;
  if new.status <> 'open' then return new; end if;
  for a in select ca.id,ca.copier_id,ca.budget from public.copy_allocations ca
           join public.copy_trader_opt_ins oi on oi.trader_id=ca.trader_id
           join public.profiles lp on lp.id=ca.trader_id and lp.verified=true
           where ca.trader_id=new.user_id and ca.is_active=true and oi.is_active=true
           order by ca.created_at,ca.id for update of ca
  loop
    begin
      select coalesce(p.balance,0) + coalesce((select sum(pos.margin) from public.positions pos where pos.user_id=new.user_id and pos.status='open'),0)
        into v_equity from public.profiles p where p.id=new.user_id;
      if coalesce(v_equity,0)<=0 then
        insert into public.copy_trade_events(allocation_id,leader_position_id,status,reason)
          values(a.id,new.id,'skipped','Patrimônio do trader indisponível') on conflict do nothing;
        continue;
      end if;
      select coalesce(sum(pos.margin),0) into v_used
        from public.copy_position_links l join public.positions pos on pos.id=l.copied_position_id
        where l.allocation_id=a.id and pos.status='open';
      v_margin := round(new.margin * (a.budget / v_equity),2);
      if v_margin < 10 then
        insert into public.copy_trade_events(allocation_id,leader_position_id,status,reason)
          values(a.id,new.id,'skipped','A margem proporcional ficou abaixo do mínimo de $BX 10') on conflict do nothing;
        continue;
      end if;
      if v_margin + v_used > a.budget then
        insert into public.copy_trade_events(allocation_id,leader_position_id,status,reason)
          values(a.id,new.id,'skipped','Limite de alocação já atingido') on conflict do nothing;
        continue;
      end if;
      if not exists(select 1 from public.profiles where id=a.copier_id and verified=true and balance>=v_margin+round(v_margin*0.10,2)) then
        insert into public.copy_trade_events(allocation_id,leader_position_id,status,reason)
          values(a.id,new.id,'skipped','Saldo insuficiente para margem e taxa de abertura') on conflict do nothing;
        continue;
      end if;
      perform set_config('app.copy_mirroring','on',true);
      v_copy_id := public.fn_open_position(a.copier_id,new.symbol,new.side,v_margin,new.leverage,new.entry_price);
      perform set_config('app.copy_mirroring','off',true);
      insert into public.copy_position_links(leader_position_id,allocation_id,copied_position_id)
        values(new.id,a.id,v_copy_id) on conflict do nothing;
      insert into public.copy_trade_events(allocation_id,leader_position_id,copied_position_id,status)
        values(a.id,new.id,v_copy_id,'copied') on conflict(allocation_id,leader_position_id)
        do update set copied_position_id=excluded.copied_position_id,status='copied',reason=null;
    exception when others then
      perform set_config('app.copy_mirroring','off',true);
      insert into public.copy_trade_events(allocation_id,leader_position_id,status,reason)
        values(a.id,new.id,'skipped',left(sqlerrm,300)) on conflict(allocation_id,leader_position_id)
        do update set copied_position_id=null,status='skipped',reason=excluded.reason;
      raise warning 'Copy position skipped for allocation %: %', a.id, sqlerrm;
    end;
  end loop;
  return new;
end $$;

create or replace function public.fn_copy_mirror_close_position()
returns trigger language plpgsql security definer set search_path = public as $$
declare l record;
begin
  if old.status='open' and new.status<>'open' and new.exit_price is not null
     and coalesce(current_setting('app.copy_mirroring',true),'off') <> 'on' then
    for l in select p.id from public.copy_position_links c join public.positions p on p.id=c.copied_position_id
             where c.leader_position_id=new.id and p.status='open'
    loop
      begin
        perform set_config('app.copy_mirroring','on',true);
        perform public.fn_close_position(null,l.id,new.exit_price,new.status='liquidated');
        perform set_config('app.copy_mirroring','off',true);
        update public.copy_trade_events set status='closed'
          where copied_position_id=l.id and status='copied';
      exception when others then
        perform set_config('app.copy_mirroring','off',true);
        raise warning 'Copy close skipped for position %: %', l.id, sqlerrm;
      end;
    end loop;
  end if;
  return new;
end $$;

revoke all on function public.fn_copy_mirror_open_position() from public, anon, authenticated;
revoke all on function public.fn_copy_mirror_close_position() from public, anon, authenticated;
create trigger copy_mirror_open_position after insert on public.positions
  for each row execute function public.fn_copy_mirror_open_position();
create trigger copy_mirror_close_position after update of status on public.positions
  for each row execute function public.fn_copy_mirror_close_position();
