alter table public.patients
  add column if not exists address_complement text;
