-- Upgrade the ALREADY INSTALLED 001_store.sql schema. No rows are deleted.
begin;
alter table public.staff_profiles add column username text;
alter table public.staff_profiles add constraint staff_username_format
  check (username is null or username ~ '^[a-z][a-z0-9_-]{2,31}$');
create unique index staff_username_unique on public.staff_profiles (lower(username))
  where username is not null;

create function private.normalize_staff_username() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.username is not null then
    new.username := lower(trim(new.username));
    if not exists (select 1 from auth.users u where u.id = new.user_id
      and lower(u.email) = new.username || '@users.wj.invalid') then
      raise exception 'USERNAME_AUTH_MAPPING_MISMATCH';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.normalize_staff_username() from public,anon,authenticated;
create trigger normalize_staff_username before insert or update of username,user_id
  on public.staff_profiles for each row execute function private.normalize_staff_username();

-- Only the trusted Edge Function may call this function. It rechecks the live
-- Admin membership/session at provisioning time, after Auth has created the user.
create function public.provision_staff_username(
  p_actor_id uuid, p_actor_session uuid, p_user_id uuid,
  p_username text, p_display_name text, p_role text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.staff_profiles p join auth.users u on u.id=p.user_id
    join auth.sessions s on s.user_id=p.user_id
    where p.user_id=p_actor_id and p.role='admin' and p.active
      and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
      and s.id=p_actor_session
  ) then raise exception 'STAFF_ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_role is null or p_role not in ('admin','employee') then raise exception 'INVALID_ROLE'; end if;
  insert into public.staff_profiles(user_id,username,display_name,role,active)
    values(p_user_id,lower(trim(p_username)),trim(p_display_name),p_role,true);
end $$;
revoke all on function public.provision_staff_username(uuid,uuid,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.provision_staff_username(uuid,uuid,uuid,text,text,text) to service_role;
-- Trusted owner maintenance can link pre-existing accounts without changing roles.
grant select, update (username) on public.staff_profiles to service_role;
-- All existing table grants and RLS policies remain unchanged.
commit;
