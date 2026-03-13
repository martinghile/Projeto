create table if not exists public.session_series (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  psychologist_id uuid not null references public.users (id),
  starts_on date not null,
  start_time time not null,
  end_time time not null,
  session_price numeric(10, 2) not null,
  location text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint session_series_time_valid check (end_time > start_time)
);

alter table public.sessions
add column if not exists series_id uuid references public.session_series (id) on delete set null;

create index if not exists idx_session_series_tenant_id on public.session_series (tenant_id);
create index if not exists idx_session_series_patient_id on public.session_series (patient_id);
create index if not exists idx_session_series_psychologist_id on public.session_series (psychologist_id);
create unique index if not exists idx_sessions_series_starts_at_unique
on public.sessions (series_id, starts_at)
where series_id is not null;

drop trigger if exists set_session_series_updated_at on public.session_series;
create trigger set_session_series_updated_at
before update on public.session_series
for each row execute procedure public.set_updated_at();

alter table public.session_series enable row level security;

create policy "users can view session series"
on public.session_series
for select
using (public.is_tenant_member(tenant_id));

create policy "users can insert session series"
on public.session_series
for insert
with check (public.is_tenant_member(tenant_id));

create policy "users can update session series"
on public.session_series
for update
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));
