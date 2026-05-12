-- 1. Harden public anamnesis: block re-submission and block reading completed anamnesis
create or replace function public.get_public_anamnesis(target_share_token uuid)
returns table (
  patient_name text,
  status public.anamnesis_status,
  answers jsonb,
  share_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_row public.anamnesis%rowtype;
begin
  select *
    into target_row
  from public.anamnesis
  where share_token = target_share_token
    and status <> 'completed'
    and (
      share_expires_at is null
      or share_expires_at > timezone('utc', now())
    )
  limit 1;

  if not found then
    return;
  end if;

  update public.anamnesis
     set last_public_opened_at = timezone('utc', now()),
         public_open_count = coalesce(public_open_count, 0) + 1,
         updated_at = timezone('utc', now())
   where id = target_row.id;

  return query
  select
    'Paciente convidado(a)'::text as patient_name,
    target_row.status,
    coalesce(target_row.answers, '{}'::jsonb) as answers,
    target_row.share_expires_at;
end;
$$;

create or replace function public.submit_public_anamnesis(target_share_token uuid, payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.anamnesis
  set
    answers = coalesce(payload, '{}'::jsonb),
    status = 'completed',
    submitted_at = timezone('utc', now()),
    updated_at = timezone('utc', now()),
    share_token = null
  where share_token = target_share_token
    and status <> 'completed'
    and (
      share_expires_at is null
      or share_expires_at > timezone('utc', now())
    );

  if not found then
    raise exception 'Anamnese ja foi preenchida, link invalido ou expirado.';
  end if;
end;
$$;

-- 2. Add role check to update_current_app_settings (only owner can change plan/clinic)
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

  if current_profile.role <> 'owner' then
    raise exception 'Apenas o proprietario pode alterar configuracoes da clinica.';
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

-- 3. Add role check to delete_patient (only owner/admin)
create or replace function public.delete_patient(target_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_tenant_id uuid;
  caller_role public.user_role;
begin
  select tenant_id
    into target_tenant_id
  from public.patients
  where id = target_patient_id;

  if target_tenant_id is null then
    raise exception 'Paciente nao encontrado.';
  end if;

  if not public.is_tenant_member(target_tenant_id) then
    raise exception 'Sem permissao para excluir este paciente.';
  end if;

  select role
    into caller_role
  from public.users
  where id = auth.uid()
    and is_active = true;

  if caller_role not in ('owner', 'admin') then
    raise exception 'Apenas proprietarios e administradores podem excluir pacientes.';
  end if;

  delete from public.patients
  where id = target_patient_id;
end;
$$;

notify pgrst, 'reload schema';
