-- Run once in the Supabase SQL Editor as the project owner.
-- No default prices, accounts, passwords, or public signup privileges are seeded.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  role text not null check (role in ('admin','employee')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.staff_profiles enable row level security;

-- Do not derive roles from editable user_metadata. Check the live membership,
-- Auth ban/deletion status and session row on every protected request.
create function private.staff_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role from public.staff_profiles p
  join auth.users u on u.id = p.user_id
  where p.user_id = (select auth.uid()) and p.active
    and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
    and exists (select 1 from auth.sessions s where s.user_id = p.user_id
      and s.id::text = (select auth.jwt()->>'session_id'))
$$;
revoke all on function private.staff_role() from public, anon;
grant execute on function private.staff_role() to authenticated;
create policy staff_read_self on public.staff_profiles for select to authenticated
  using (user_id = (select auth.uid()) and (select private.staff_role()) is not null);
-- Membership/roles can only be provisioned in trusted Supabase administration.
revoke all on public.staff_profiles from anon, authenticated;
grant select on public.staff_profiles to authenticated;

create table public.store_settings (
  id integer primary key default 1 check (id = 1),
  sell_min numeric not null,
  sell_max numeric not null,
  buy_price numeric not null,
  sell_usd numeric not null,
  sell_ils numeric not null,
  buy_usd numeric not null,
  buy_ils numeric not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint settings_values_valid check (
    sell_min > 0 and sell_max >= sell_min and sell_max < 1000000000 and
    buy_price > 0 and buy_price < 1000000000 and
    sell_usd > 0 and sell_usd < 1000000000 and sell_ils > 0 and sell_ils < 1000000000 and
    buy_usd > 0 and buy_usd < 1000000000 and buy_ils > 0 and buy_ils < 1000000000 and
    scale(sell_min) <= 6 and scale(sell_max) <= 6 and scale(buy_price) <= 6 and
    scale(sell_usd) <= 6 and scale(sell_ils) <= 6 and scale(buy_usd) <= 6 and scale(buy_ils) <= 6
  )
);
alter table public.store_settings enable row level security;
create policy settings_staff_read on public.store_settings for select to authenticated
  using ((select private.staff_role()) is not null);
create policy settings_admin_insert on public.store_settings for insert to authenticated
  with check ((select private.staff_role()) = 'admin');
create policy settings_admin_update on public.store_settings for update to authenticated
  using ((select private.staff_role()) = 'admin')
  with check ((select private.staff_role()) = 'admin');
revoke all on public.store_settings from anon, authenticated;
grant select on public.store_settings to authenticated;
grant insert (sell_min,sell_max,buy_price,sell_usd,sell_ils,buy_usd,buy_ils),
  update (sell_min,sell_max,buy_price,sell_usd,sell_ils,buy_usd,buy_ils)
  on public.store_settings to authenticated;

create function private.stamp_settings() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := case when tg_op = 'INSERT' then 1 else old.version + 1 end;
  new.updated_at := now(); new.updated_by := auth.uid(); return new;
end $$;
revoke all on function private.stamp_settings() from public, anon, authenticated;
create trigger stamp_settings before insert or update on public.store_settings
  for each row execute function private.stamp_settings();

-- Returns decimal strings, avoiding JS precision loss for settings and totals.
create function public.get_store_settings() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('version',s.version,'updated_at',s.updated_at,
    'sell_min',s.sell_min::text,'sell_max',s.sell_max::text,'buy_price',s.buy_price::text,
    'sell_usd',s.sell_usd::text,'sell_ils',s.sell_ils::text,
    'buy_usd',s.buy_usd::text,'buy_ils',s.buy_ils::text)
  from public.store_settings s where s.id = 1
$$;

create function public.update_store_settings(
  p_expected_version integer, p_sell_min numeric, p_sell_max numeric,
  p_buy_price numeric, p_sell_usd numeric, p_sell_ils numeric, p_buy_usd numeric, p_buy_ils numeric
) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if private.staff_role() is distinct from 'admin' then
    raise exception 'STAFF_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_expected_version = 0 then
    insert into public.store_settings (sell_min,sell_max,buy_price,sell_usd,sell_ils,buy_usd,buy_ils)
      values (p_sell_min,p_sell_max,p_buy_price,p_sell_usd,p_sell_ils,p_buy_usd,p_buy_ils)
      on conflict (id) do nothing;
  else
    update public.store_settings set sell_min=p_sell_min,sell_max=p_sell_max,buy_price=p_buy_price,
      sell_usd=p_sell_usd,sell_ils=p_sell_ils,buy_usd=p_buy_usd,buy_ils=p_buy_ils
      where id=1 and version=p_expected_version;
  end if;
  if not found then raise exception 'SETTINGS_CHANGED' using errcode = 'P0001'; end if;
  return public.get_store_settings();
end $$;

create table public.calculation_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  user_name text not null,
  mode text not null check (mode in ('sell','buy')),
  weight numeric not null check (weight > 0 and weight < 1000000000 and scale(weight)<=6),
  price numeric not null,
  usd_rate numeric not null,
  ils_rate numeric not null,
  total_jod numeric not null,
  total_usd numeric not null,
  total_ils numeric not null,
  settings_version integer not null,
  created_at timestamptz not null default now(),
  unique(user_id,request_id)
);
create index history_latest on public.calculation_history (created_at desc,id desc);
alter table public.calculation_history enable row level security;
create policy history_staff_read on public.calculation_history for select to authenticated
  using ((select private.staff_role()) is not null);
revoke all on public.calculation_history from anon, authenticated;
grant select on public.calculation_history to authenticated;
-- No client INSERT, UPDATE or DELETE grants/policies. Only the validated RPC writes.

create function private.history_json(h public.calculation_history) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id',h.id,'request_id',h.request_id,'user_id',h.user_id,
    'user_name',h.user_name,'mode',h.mode,'weight',h.weight::text,'price',h.price::text,
    'usd_rate',h.usd_rate::text,'ils_rate',h.ils_rate::text,'total_jod',h.total_jod::text,
    'total_usd',h.total_usd::text,'total_ils',h.total_ils::text,
    'settings_version',h.settings_version,'created_at',h.created_at)
$$;
revoke all on function private.history_json(public.calculation_history) from public, anon;
grant execute on function private.history_json(public.calculation_history) to authenticated;

create function public.latest_calculations() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(private.history_json(h) order by h.created_at desc,h.id desc),'[]'::jsonb)
  from (select * from public.calculation_history order by created_at desc,id desc limit 10) h
$$;

create function public.save_calculation(
  p_mode text, p_weight numeric, p_price numeric, p_settings_version integer, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.store_settings; h public.calculation_history; v_name text;
  v_price numeric; v_usd numeric; v_ils numeric; v_jod numeric;
begin
  if private.staff_role() is null then raise exception 'STAFF_ACCESS_DENIED' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  -- Retry-safe: a lost response or double tap cannot create duplicate history.
  select * into h from public.calculation_history where user_id=auth.uid() and request_id=p_request_id;
  if found then
    if h.mode is distinct from p_mode or h.weight is distinct from p_weight or h.price is distinct from p_price then
      raise exception 'REQUEST_CONFLICT';
    end if;
    return private.history_json(h);
  end if;
  if p_mode is null or p_mode not in ('sell','buy') or p_weight is null or
     not (p_weight > 0 and p_weight < 1000000000) or scale(p_weight)>6 or
     p_price is null or not (p_price > 0 and p_price < 1000000000) or scale(p_price)>6 then
    raise exception 'INVALID_CALCULATION' using errcode='22023';
  end if;
  select * into s from public.store_settings where id=1 for share;
  if not found then raise exception 'SETTINGS_NOT_READY'; end if;
  if s.version is distinct from p_settings_version then raise exception 'SETTINGS_CHANGED'; end if;
  if p_mode='sell' then
    if p_price<s.sell_min or p_price>s.sell_max then raise exception 'SELL_PRICE_OUT_OF_RANGE'; end if;
    v_price:=p_price; v_usd:=s.sell_usd; v_ils:=s.sell_ils;
  else
    if p_price<>s.buy_price then raise exception 'BUY_PRICE_FIXED'; end if;
    v_price:=s.buy_price; v_usd:=s.buy_usd; v_ils:=s.buy_ils;
  end if;
  select display_name into v_name from public.staff_profiles where user_id=auth.uid();
  v_jod:=p_weight*v_price;
  insert into public.calculation_history (request_id,user_id,user_name,mode,weight,price,usd_rate,ils_rate,
    total_jod,total_usd,total_ils,settings_version)
    values(p_request_id,auth.uid(),v_name,p_mode,p_weight,v_price,v_usd,v_ils,
      round(v_jod,3),round(v_jod*v_usd,2),round(v_jod*v_ils,2),s.version)
    on conflict(user_id,request_id) do nothing returning * into h;
  if not found then
    select * into h from public.calculation_history where user_id=auth.uid() and request_id=p_request_id;
    if h.mode is distinct from p_mode or h.weight is distinct from p_weight or h.price is distinct from p_price then
      raise exception 'REQUEST_CONFLICT';
    end if;
  end if;
  return private.history_json(h);
end $$;

revoke all on function public.get_store_settings() from public,anon;
revoke all on function public.latest_calculations() from public,anon;
revoke all on function public.update_store_settings(integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric) from public,anon;
revoke all on function public.save_calculation(text,numeric,numeric,integer,uuid) from public,anon;
grant execute on function public.get_store_settings(),public.latest_calculations(),
  public.update_store_settings(integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric),
  public.save_calculation(text,numeric,numeric,integer,uuid) to authenticated;
commit;
