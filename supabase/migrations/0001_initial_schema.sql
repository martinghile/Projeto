create extension if not exists pgcrypto;

create type public.user_role as enum ('owner', 'therapist', 'assistant');
create type public.session_status as enum ('scheduled', 'confirmed', 'cancelled', 'missed', 'completed');
create type public.payment_status as enum ('pending', 'paid', 'overdue', 'cancelled');
create type public.anamnesis_status as enum ('draft', 'sent', 'completed');
create type public.reminder_status as enum ('pending', 'sent', 'failed');

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan text not null default 'starter',
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role public.user_role not null default 'owner',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  psychologist_id uuid not null references public.users (id),
  full_name text not null,
  phone text,
  email text,
  birth_date date,
  notes text,
  session_price numeric(10, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.anamnesis (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  patient_id uuid not null unique references public.patients (id) on delete cascade,
  created_by uuid not null references public.users (id),
  status public.anamnesis_status not null default 'draft',
  answers jsonb not null default '{}'::jsonb,
  share_token uuid unique default gen_random_uuid(),
  share_expires_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  psychologist_id uuid not null references public.users (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  session_price numeric(10, 2) not null,
  status public.session_status not null default 'scheduled',
  location text,
  notes text,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint session_time_valid check (ends_at > starts_at)
);

create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null unique references public.sessions (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  psychologist_id uuid not null references public.users (id),
  clinical_summary text,
  private_notes text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  created_by uuid not null references public.users (id),
  amount numeric(10, 2) not null,
  status public.payment_status not null default 'pending',
  due_date date,
  paid_at timestamptz,
  payment_method text,
  receipt_path text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.session_reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null unique references public.sessions (id) on delete cascade,
  scheduled_for timestamptz not null,
  status public.reminder_status not null default 'pending',
  delivered_at timestamptz,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_users_tenant_id on public.users (tenant_id);
create index if not exists idx_patients_tenant_id on public.patients (tenant_id);
create index if not exists idx_patients_psychologist_id on public.patients (psychologist_id);
create index if not exists idx_sessions_tenant_starts_at on public.sessions (tenant_id, starts_at);
create index if not exists idx_sessions_patient_id on public.sessions (patient_id);
create index if not exists idx_medical_records_patient_id on public.medical_records (patient_id);
create index if not exists idx_payments_tenant_status on public.payments (tenant_id, status);
create index if not exists idx_reminders_scheduled_for on public.session_reminders (scheduled_for, status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

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
$$;

create or replace function public.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and tenant_id = target_tenant_id
      and is_active = true
  )
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tenant_name text;
  normalized_slug text;
  new_tenant_id uuid;
begin
  tenant_name := coalesce(new.raw_user_meta_data ->> 'clinic_name', split_part(new.email, '@', 1));
  normalized_slug := regexp_replace(lower(tenant_name), '[^a-z0-9]+', '-', 'g');

  insert into public.tenants (name, slug)
  values (
    tenant_name,
    normalized_slug || '-' || left(replace(new.id::text, '-', ''), 8)
  )
  returning id into new_tenant_id;

  insert into public.users (id, tenant_id, full_name, email, role)
  values (
    new.id,
    new_tenant_id,
    coalesce(new.raw_user_meta_data ->> 'full_name', tenant_name),
    new.email,
    'owner'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

drop trigger if exists set_tenants_updated_at on public.tenants;
create trigger set_tenants_updated_at
before update on public.tenants
for each row execute procedure public.set_updated_at();

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row execute procedure public.set_updated_at();

drop trigger if exists set_patients_updated_at on public.patients;
create trigger set_patients_updated_at
before update on public.patients
for each row execute procedure public.set_updated_at();

drop trigger if exists set_anamnesis_updated_at on public.anamnesis;
create trigger set_anamnesis_updated_at
before update on public.anamnesis
for each row execute procedure public.set_updated_at();

drop trigger if exists set_sessions_updated_at on public.sessions;
create trigger set_sessions_updated_at
before update on public.sessions
for each row execute procedure public.set_updated_at();

drop trigger if exists set_medical_records_updated_at on public.medical_records;
create trigger set_medical_records_updated_at
before update on public.medical_records
for each row execute procedure public.set_updated_at();

drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at
before update on public.payments
for each row execute procedure public.set_updated_at();

drop trigger if exists set_session_reminders_updated_at on public.session_reminders;
create trigger set_session_reminders_updated_at
before update on public.session_reminders
for each row execute procedure public.set_updated_at();

alter table public.tenants enable row level security;
alter table public.users enable row level security;
alter table public.patients enable row level security;
alter table public.anamnesis enable row level security;
alter table public.sessions enable row level security;
alter table public.medical_records enable row level security;
alter table public.payments enable row level security;
alter table public.session_reminders enable row level security;

create policy "users can view own tenant"
on public.tenants
for select
using (id = public.current_tenant_id());

create policy "users can update own tenant"
on public.tenants
for update
using (id = public.current_tenant_id())
with check (id = public.current_tenant_id());

create policy "users can view tenant users"
on public.users
for select
using (id = auth.uid());

create policy "users can insert own tenant users"
on public.users
for insert
with check (tenant_id = public.current_tenant_id());

create policy "users can update own tenant users"
on public.users
for update
using (id = auth.uid())
with check (id = auth.uid() and tenant_id = public.current_tenant_id());

create policy "users can view patients"
on public.patients
for select
using (public.is_tenant_member(tenant_id));

create policy "users can insert patients"
on public.patients
for insert
with check (public.is_tenant_member(tenant_id));

create policy "users can update patients"
on public.patients
for update
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

create policy "users can view anamnesis"
on public.anamnesis
for select
using (public.is_tenant_member(tenant_id));

create policy "users can insert anamnesis"
on public.anamnesis
for insert
with check (public.is_tenant_member(tenant_id));

create policy "users can update anamnesis"
on public.anamnesis
for update
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

create policy "users can view sessions"
on public.sessions
for select
using (public.is_tenant_member(tenant_id));

create policy "users can insert sessions"
on public.sessions
for insert
with check (public.is_tenant_member(tenant_id));

create policy "users can update sessions"
on public.sessions
for update
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

create policy "users can view medical records"
on public.medical_records
for select
using (public.is_tenant_member(tenant_id));

create policy "users can insert medical records"
on public.medical_records
for insert
with check (public.is_tenant_member(tenant_id));

create policy "users can update medical records"
on public.medical_records
for update
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

create policy "users can view payments"
on public.payments
for select
using (public.is_tenant_member(tenant_id));

create policy "users can insert payments"
on public.payments
for insert
with check (public.is_tenant_member(tenant_id));

create policy "users can update payments"
on public.payments
for update
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

create policy "users can view reminders"
on public.session_reminders
for select
using (public.is_tenant_member(tenant_id));

create policy "users can insert reminders"
on public.session_reminders
for insert
with check (public.is_tenant_member(tenant_id));

create policy "users can update reminders"
on public.session_reminders
for update
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', false)
on conflict (id) do nothing;

create policy "tenant members can read payment receipts"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[1] = public.current_tenant_id()::text
);

create policy "tenant members can upload payment receipts"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[1] = public.current_tenant_id()::text
);

create policy "tenant members can update payment receipts"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[1] = public.current_tenant_id()::text
)
with check (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[1] = public.current_tenant_id()::text
);
