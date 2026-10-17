-- Security hardening: claim affiliate earnings atomically.
-- The previous implementation summed pending rows before marking them claimed,
-- allowing two concurrent requests to credit the same earnings twice.
create or replace function public.fn_claim_affiliate(_user uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric := 0;
  v_row record;
begin
  if _user is null then
    raise exception 'Invalid user';
  end if;

  -- UPDATE locks each pending row and RETURNING makes exactly one concurrent
  -- claimant receive the rows. A second claimant sees no pending rows.
  for v_row in
    update public.affiliate_earnings
    set claimed_at = now()
    where affiliate_id = _user and claimed_at is null
    returning amount
  loop
    v_amount := v_amount + v_row.amount;
  end loop;

  if v_amount <= 0 then
    raise exception 'No pending affiliate earnings';
  end if;

  update public.profiles
  set balance = balance + v_amount
  where id = _user;

  return v_amount;
end;
$$;

revoke all on function public.fn_claim_affiliate(uuid) from public, anon, authenticated;
grant execute on function public.fn_claim_affiliate(uuid) to service_role;
