create or replace function public.delete_patient(target_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_tenant_id uuid;
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

  delete from public.patients
  where id = target_patient_id;
end;
$$;

grant execute on function public.delete_patient(uuid) to authenticated;
