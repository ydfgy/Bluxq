-- Privacy-conscious anti-abuse fingerprinting.
-- Only a browser-generated SHA-256 hash is stored; raw device signals never leave the browser.
create table if not exists public.account_fingerprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  fingerprint_hash text not null check (fingerprint_hash ~ '^[a-f0-9]{64}$'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count integer not null default 1 check (seen_count > 0),
  unique (user_id, fingerprint_hash)
);
create index if not exists account_fingerprints_hash_idx
  on public.account_fingerprints (fingerprint_hash);
grant all on public.account_fingerprints to service_role;
alter table public.account_fingerprints enable row level security;
drop policy if exists "own fingerprint records" on public.account_fingerprints;
create policy "own fingerprint records"
  on public.account_fingerprints for select to authenticated
  using (user_id = auth.uid());

create or replace function public.fn_register_fingerprint(_user uuid, _fingerprint_hash text)
returns table (duplicate_accounts integer, review_started boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  matches integer;
  started boolean := false;
begin
  if _fingerprint_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid fingerprint hash'; end if;
  insert into public.account_fingerprints (user_id, fingerprint_hash)
  values (_user, lower(_fingerprint_hash))
  on conflict (user_id, fingerprint_hash) do update set last_seen_at = now(), seen_count = account_fingerprints.seen_count + 1;

  select count(distinct user_id)::integer into matches
  from public.account_fingerprints
  where fingerprint_hash = lower(_fingerprint_hash);

  if matches > 1 then
    insert into public.security_controls (user_id, status, manual_reason, risk_score, updated_at)
    values (_user, 'review', 'mesmo fingerprint hash associado a outra conta', 70, now())
    on conflict (user_id) do update set
      status = case when security_controls.status = 'blocked' then 'blocked' else 'review' end,
      manual_reason = excluded.manual_reason,
      risk_score = greatest(security_controls.risk_score, excluded.risk_score),
      updated_at = now();
    started := true;
    insert into public.security_events (user_id, event_type, metadata)
    values (_user, 'duplicate_fingerprint_review', jsonb_build_object('matched_accounts', matches));
  end if;

  return query select matches, started;
end;
$$;

revoke all on function public.fn_register_fingerprint(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_register_fingerprint(uuid, text) to service_role;
