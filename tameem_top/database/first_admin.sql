-- Run ONLY in the trusted Supabase SQL Editor, after creating the matching
-- Auth user in the dashboard. No password belongs in this file or query.
-- Edit these two example values before running. This does NOT rerun 001.
do $$
declare
  chosen_username text := 'tamim';
  chosen_display_name text := 'تميم';
  account_id uuid;
begin
  chosen_username := lower(trim(chosen_username));
  if exists(select 1 from public.staff_profiles where role='admin' and active) then
    raise exception 'An active Admin already exists. Use that account; do not bootstrap again.';
  end if;
  select id into account_id from auth.users
    where lower(email)=chosen_username || '@users.wj.invalid' and deleted_at is null;
  if account_id is null then raise exception 'Create the matching Auth user first (see SETUP stage 2).'; end if;
  insert into public.staff_profiles(user_id,username,display_name,role,active)
    values(account_id,chosen_username,chosen_display_name,'admin',true)
    on conflict(user_id) do update set username=excluded.username,
      display_name=excluded.display_name,role='admin',active=true;
end $$;
