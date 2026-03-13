create or replace function public.get_current_membership()
returns table (
  user_id uuid,
  tenant_id uuid,
  email text,
  full_name text,
  role public.user_role
)
language sql
stable
security definer
set search_path = public
as $$
  select
    users.id as user_id,
    users.tenant_id,
    users.email,
    users.full_name,
    users.role
  from public.users
  where users.id = auth.uid()
    and users.is_active = true
$$;

create or replace function public.get_current_app_settings()
returns table (
  clinic_name text,
  full_name text,
  email text,
  timezone text,
  plan text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tenants.name as clinic_name,
    users.full_name,
    users.email,
    tenants.timezone,
    tenants.plan
  from public.users
  join public.tenants on tenants.id = users.tenant_id
  where users.id = auth.uid()
    and users.is_active = true
$$;

create or replace function public.update_current_app_settings(
  input_clinic_name text,
  input_full_name text,
  input_timezone text,
  input_plan text
)
returns table (
  clinic_name text,
  full_name text,
  email text,
  timezone text,
  plan text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.users%rowtype;
begin
  select *
  into current_profile
  from public.users
  where id = auth.uid()
    and is_active = true;

  if current_profile.id is null then
    raise exception 'Usuario autenticado nao possui perfil em public.users.';
  end if;

  update public.users
  set full_name = input_full_name
  where id = current_profile.id;

  update public.tenants
  set
    name = input_clinic_name,
    timezone = input_timezone,
    plan = input_plan
  where id = current_profile.tenant_id;

  return query
  select
    tenants.name as clinic_name,
    users.full_name,
    users.email,
    tenants.timezone,
    tenants.plan
  from public.users
  join public.tenants on tenants.id = users.tenant_id
  where users.id = current_profile.id;
end;
$$;

grant execute on function public.get_current_membership() to authenticated;
grant execute on function public.get_current_app_settings() to authenticated;
grant execute on function public.update_current_app_settings(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
