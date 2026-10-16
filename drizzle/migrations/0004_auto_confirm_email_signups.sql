-- Auto-confirm email signups because this application does not use email verification.
create or replace function public.auto_confirm_user_email()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now())
  where id = new.id;
  return new;
end;
$$;

revoke all on function public.auto_confirm_user_email() from public, anon, authenticated;

drop trigger if exists auto_confirm_user_email on auth.users;
create trigger auto_confirm_user_email
after insert on auth.users
for each row execute function public.auto_confirm_user_email();

update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email_confirmed_at is null and email is not null;
