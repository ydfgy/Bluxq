-- Transparent abuse-prevention controls.
-- This migration does not collect browser fingerprints or hide account state.
create table if not exists public.security_controls (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'clear' check (status in ('clear', 'review', 'blocked')),
  manual_reason text,
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

grant all on public.security_controls to service_role;
alter table public.security_controls enable row level security;
drop policy if exists "own security status" on public.security_controls;
create policy "own security status"
  on public.security_controls for select to authenticated
  using (user_id = auth.uid());

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (length(event_type) between 2 and 80),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists security_events_user_created_idx
  on public.security_events (user_id, created_at desc);
grant all on public.security_events to service_role;
alter table public.security_events enable row level security;
drop policy if exists "own security events" on public.security_events;
create policy "own security events"
  on public.security_events for select to authenticated
  using (user_id = auth.uid());

create or replace function public.fn_security_status(_user uuid)
returns table (
  status text,
  risk_score integer,
  reasons text[],
  transactions_allowed boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with control as (
    select sc.status, sc.manual_reason, sc.risk_score, sc.blocked_until
    from public.security_controls sc
    where sc.user_id = _user
  ), signals as (
    select
      (select count(*) from public.positions p where p.user_id = _user and p.opened_at > now() - interval '15 minutes' and p.leverage >= 50 and p.margin <= 10)::integer as rapid_high_leverage,
      (select count(*) from public.positions p where p.user_id = _user and p.opened_at > now() - interval '15 minutes')::integer as recent_positions,
      (select count(*) from public.withdrawals w where w.user_id = _user and w.status = 'pending' and w.created_at > now() - interval '10 minutes')::integer as recent_withdrawals
  ), computed as (
    select
      least(100, (case when signals.rapid_high_leverage >= 3 then 30 else 0 end) +
        (case when signals.recent_positions >= 10 then 30 else 0 end) +
        (case when signals.recent_withdrawals >= 3 then 20 else 0 end))::integer as score,
      array_remove(array[
        case when signals.rapid_high_leverage >= 3 then 'múltiplas operações de alta alavancagem em curto período' end,
        case when signals.recent_positions >= 10 then 'volume incomum de novas operações em curto período' end,
        case when signals.recent_withdrawals >= 3 then 'múltiplos saques pendentes em curto período' end
      ], null)::text[] as reasons
    from signals
  )
  select
    case
      when control.status = 'blocked' then 'blocked'
      when control.status = 'review' then 'review'
      when coalesce(computed.score, 0) >= 41 then 'review'
      else 'clear'
    end,
    greatest(coalesce(control.risk_score, 0), coalesce(computed.score, 0)),
    array_cat(coalesce(computed.reasons, '{}'::text[]), case when control.manual_reason is null then '{}'::text[] else array[control.manual_reason] end),
    case
      when control.status in ('review', 'blocked') then false
      when control.blocked_until is not null and control.blocked_until > now() then false
      when coalesce(computed.score, 0) >= 41 then false
      else true
    end
  from computed
  left join control on true;
$$;

create or replace function public.fn_set_security_control(
  _user uuid,
  _status text,
  _reason text default null,
  _risk_score integer default 0,
  _blocked_until timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _status not in ('clear', 'review', 'blocked') then raise exception 'Invalid security status'; end if;
  if _risk_score < 0 or _risk_score > 100 then raise exception 'Invalid risk score'; end if;
  insert into public.security_controls (user_id, status, manual_reason, risk_score, blocked_until, updated_at)
  values (_user, _status, nullif(trim(_reason), ''), _risk_score, _blocked_until, now())
  on conflict (user_id) do update set status = excluded.status, manual_reason = excluded.manual_reason,
    risk_score = excluded.risk_score, blocked_until = excluded.blocked_until, updated_at = now();
end;
$$;

create or replace function public.fn_record_security_event(_user uuid, _event_type text, _metadata jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.security_events (user_id, event_type, metadata)
  values (_user, left(_event_type, 80), coalesce(_metadata, '{}'::jsonb));
$$;

revoke all on function public.fn_security_status(uuid) from public, anon, authenticated;
revoke all on function public.fn_set_security_control(uuid, text, text, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.fn_record_security_event(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.fn_security_status(uuid) to service_role;
grant execute on function public.fn_set_security_control(uuid, text, text, integer, timestamptz) to service_role;
grant execute on function public.fn_record_security_event(uuid, text, jsonb) to service_role;
