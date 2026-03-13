alter table public.patients
  add column if not exists address_zip_code text,
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_neighborhood text,
  add column if not exists address_city text,
  add column if not exists address_state text;

update public.patients
set cpf = nullif(regexp_replace(cpf, '\D', '', 'g'), '')
where cpf is not null;

update public.patients
set address_zip_code = nullif(regexp_replace(address_zip_code, '\D', '', 'g'), '')
where address_zip_code is not null;

update public.patients
set address_state = upper(address_state)
where address_state is not null;

alter table public.patients
  drop constraint if exists patients_cpf_format_check;

alter table public.patients
  add constraint patients_cpf_format_check
  check (cpf is null or cpf ~ '^\d{11}$');

alter table public.patients
  drop constraint if exists patients_address_zip_code_format_check;

alter table public.patients
  add constraint patients_address_zip_code_format_check
  check (address_zip_code is null or address_zip_code ~ '^\d{8}$');

alter table public.patients
  drop constraint if exists patients_address_state_format_check;

alter table public.patients
  add constraint patients_address_state_format_check
  check (address_state is null or address_state ~ '^[A-Z]{2}$');
