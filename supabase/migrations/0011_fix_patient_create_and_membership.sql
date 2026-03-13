create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.users
  where id = auth.uid()
    and is_active = true
  limit 1
$$;

create or replace function public.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_tenant_id = public.current_tenant_id()
$$;

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
  limit 1
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
  limit 1
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

create or replace function public.create_patient(
  input_full_name text,
  input_phone text,
  input_email text,
  input_cpf text,
  input_address text,
  input_address_zip_code text,
  input_address_street text,
  input_address_number text,
  input_address_complement text,
  input_address_neighborhood text,
  input_address_city text,
  input_address_state text,
  input_birth_date date,
  input_notes text,
  input_session_price numeric
)
returns table (
  id uuid,
  full_name text,
  phone text,
  email text,
  cpf text,
  address text,
  address_zip_code text,
  address_street text,
  address_number text,
  address_complement text,
  address_neighborhood text,
  address_city text,
  address_state text,
  birth_date date,
  notes text,
  session_price numeric,
  is_active boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.users%rowtype;
  created_patient public.patients%rowtype;
begin
  select *
  into current_profile
  from public.users
  where id = auth.uid()
    and is_active = true;

  if current_profile.id is null then
    raise exception 'Usuario autenticado nao possui perfil em public.users.';
  end if;

  insert into public.patients (
    tenant_id,
    psychologist_id,
    full_name,
    phone,
    email,
    cpf,
    address,
    address_zip_code,
    address_street,
    address_number,
    address_complement,
    address_neighborhood,
    address_city,
    address_state,
    birth_date,
    notes,
    session_price,
    is_active
  )
  values (
    current_profile.tenant_id,
    current_profile.id,
    input_full_name,
    nullif(input_phone, ''),
    nullif(input_email, ''),
    nullif(input_cpf, ''),
    nullif(input_address, ''),
    nullif(input_address_zip_code, ''),
    nullif(input_address_street, ''),
    nullif(input_address_number, ''),
    nullif(input_address_complement, ''),
    nullif(input_address_neighborhood, ''),
    nullif(input_address_city, ''),
    nullif(input_address_state, ''),
    input_birth_date,
    nullif(input_notes, ''),
    input_session_price,
    true
  )
  returning *
  into created_patient;

  return query
  select
    created_patient.id,
    created_patient.full_name,
    created_patient.phone,
    created_patient.email,
    created_patient.cpf,
    created_patient.address,
    created_patient.address_zip_code,
    created_patient.address_street,
    created_patient.address_number,
    created_patient.address_complement,
    created_patient.address_neighborhood,
    created_patient.address_city,
    created_patient.address_state,
    created_patient.birth_date,
    created_patient.notes,
    created_patient.session_price,
    created_patient.is_active;
end;
$$;

grant execute on function public.get_current_membership() to authenticated;
grant execute on function public.get_current_app_settings() to authenticated;
grant execute on function public.update_current_app_settings(text, text, text, text) to authenticated;
grant execute on function public.create_patient(text, text, text, text, text, text, text, text, text, text, text, text, date, text, numeric) to authenticated;

notify pgrst, 'reload schema';
