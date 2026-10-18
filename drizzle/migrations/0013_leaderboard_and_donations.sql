-- Transparent leaderboard and BX donations.
-- Ranking uses realized PnL divided by total margin on closed/liquidated positions.
create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(20,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  check (donor_id <> recipient_id)
);

create index if not exists donations_recipient_created_idx
  on public.donations (recipient_id, created_at desc);
create index if not exists donations_donor_created_idx
  on public.donations (donor_id, created_at desc);

grant select on public.donations to authenticated;
grant all on public.donations to service_role;
alter table public.donations enable row level security;
drop policy if exists "own donation history" on public.donations;
create policy "own donation history"
  on public.donations for select to authenticated
  using (donor_id = auth.uid() or recipient_id = auth.uid());

create or replace function public.fn_get_leaderboard()
returns table (
  rank bigint,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_anonymous boolean,
  profit numeric,
  margin numeric,
  profit_percentage numeric,
  trades bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with performance as (
    select
      p.user_id,
      sum(coalesce(p.pnl, 0))::numeric as profit,
      sum(p.margin)::numeric as margin,
      count(*)::bigint as trades
    from public.positions p
    where p.status in ('closed', 'liquidated')
    group by p.user_id
    having sum(p.margin) > 0
  ), ranked as (
    select
      row_number() over (order by performance.profit / nullif(performance.margin, 0) desc, performance.profit desc, performance.user_id) as rank,
      performance.*
    from performance
  )
  select
    ranked.rank,
    ranked.user_id,
    case when coalesce(pr.is_anonymous, false) then 'Trader anônimo' else pr.roblox_username end,
    case when coalesce(pr.is_anonymous, false) then null else pr.roblox_display_name end,
    case when coalesce(pr.is_anonymous, false) then null else pr.avatar_url end,
    coalesce(pr.is_anonymous, false),
    round(ranked.profit, 2),
    round(ranked.margin, 2),
    round((ranked.profit / nullif(ranked.margin, 0)) * 100, 2),
    ranked.trades
  from ranked
  join public.profiles pr on pr.id = ranked.user_id
  order by ranked.rank
  limit 10;
$$;

create or replace function public.fn_get_public_profile(_user uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_anonymous boolean,
  profit numeric,
  margin numeric,
  profit_percentage numeric,
  trades bigint,
  received_donations numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with performance as (
    select
      coalesce(sum(p.pnl), 0)::numeric as profit,
      coalesce(sum(p.margin), 0)::numeric as margin,
      count(*) filter (where p.status in ('closed', 'liquidated'))::bigint as trades
    from public.positions p
    where p.user_id = _user and p.status in ('closed', 'liquidated')
  )
  select
    pr.id,
    case when coalesce(pr.is_anonymous, false) then 'Trader anônimo' else pr.roblox_username end,
    case when coalesce(pr.is_anonymous, false) then null else pr.roblox_display_name end,
    case when coalesce(pr.is_anonymous, false) then null else pr.avatar_url end,
    coalesce(pr.is_anonymous, false),
    round(performance.profit, 2),
    round(performance.margin, 2),
    case when performance.margin > 0 then round((performance.profit / performance.margin) * 100, 2) else 0 end,
    performance.trades,
    round(coalesce((select sum(d.amount) from public.donations d where d.recipient_id = pr.id), 0), 2)
  from public.profiles pr
  cross join performance
  where pr.id = _user;
$$;

create or replace function public.fn_donate(_sender uuid, _recipient uuid, _amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sender uuid := _sender;
  sender_balance numeric;
  recipient_exists boolean;
begin
  if sender is null then raise exception 'Você precisa entrar para doar'; end if;
  if _recipient is null or _recipient = sender then raise exception 'Escolha outro usuário'; end if;
  _amount := round(_amount, 2);
  if _amount < 1 or _amount > 1000000 then raise exception 'A doação deve estar entre 1 e 1.000.000 BX'; end if;

  perform pg_advisory_xact_lock(hashtextextended('donation:' || least(sender::text, _recipient::text) || ':' || greatest(sender::text, _recipient::text), 0));
  select balance into sender_balance from public.profiles where id = sender for update;
  select exists(select 1 from public.profiles where id = _recipient) into recipient_exists;
  if not recipient_exists then raise exception 'Usuário não encontrado'; end if;
  if sender_balance < _amount then raise exception 'Saldo BX insuficiente'; end if;

  update public.profiles set balance = balance - _amount where id = sender;
  update public.profiles set balance = balance + _amount where id = _recipient;
  insert into public.donations (donor_id, recipient_id, amount) values (sender, _recipient, _amount);
end;
$$;

revoke all on function public.fn_get_leaderboard() from public, anon, authenticated;
revoke all on function public.fn_get_public_profile(uuid) from public, anon, authenticated;
revoke all on function public.fn_donate(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.fn_get_leaderboard() to service_role;
grant execute on function public.fn_get_public_profile(uuid) to service_role;
grant execute on function public.fn_donate(uuid, uuid, numeric) to service_role;
