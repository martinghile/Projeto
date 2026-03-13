alter table public.patients
  add column if not exists cpf text,
  add column if not exists address text;

create unique index if not exists idx_patients_tenant_cpf_unique
  on public.patients (tenant_id, cpf)
  where cpf is not null;
