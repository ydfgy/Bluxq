-- Store the normalized fingerprint evidence for later comparison and manual analysis.
-- Access is restricted to service_role; regular users can only be placed in review.
alter table public.account_fingerprints
  add column if not exists signal_version text not null default 'v1',
  add column if not exists signal_data jsonb not null default '{}'::jsonb;

-- Do not expose raw fingerprint evidence through the browser-facing RLS policy.
drop policy if exists "own fingerprint records" on public.account_fingerprints;
revoke all on public.account_fingerprints from authenticated, anon;
grant all on public.account_fingerprints to service_role;

create or replace function public.fn_register_fingerprint(
  _user uuid,
  _fingerprint_hash text,
  _signal_data jsonb default '{}'::jsonb
)
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
  if pg_column_size(coalesce(_signal_data, '{}'::jsonb)) > 32768 then raise exception 'Fingerprint evidence too large'; end if;

  insert into public.account_fingerprints (user_id, fingerprint_hash, signal_version, signal_data)
  values (_user, lower(_fingerprint_hash), 'v1', coalesce(_signal_data, '{}'::jsonb))
  on conflict (user_id, fingerprint_hash) do update set
    last_seen_at = now(),
    seen_count = account_fingerprints.seen_count + 1,
    signal_data = excluded.signal_data;

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
    values (_user, 'duplicate_fingerprint_review', jsonb_build_object('matched_accounts', matches, 'signal_version', 'v1'));
  end if;

  return query select matches, started;
end;
$$;

revoke all on function public.fn_register_fingerprint(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.fn_register_fingerprint(uuid, text, jsonb) to service_role;
