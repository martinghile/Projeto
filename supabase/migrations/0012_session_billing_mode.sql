do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'session_billing_mode'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.session_billing_mode as enum ('per_session', 'monthly');
  end if;
end
$$;

alter table public.session_series
add column if not exists billing_mode public.session_billing_mode not null default 'per_session',
add column if not exists billing_amount numeric(10, 2);

update public.session_series
set billing_amount = session_price
where billing_amount is null;

alter table public.session_series
alter column billing_amount set not null;

alter table public.sessions
add column if not exists billing_mode public.session_billing_mode not null default 'per_session',
add column if not exists billing_amount numeric(10, 2);

update public.sessions
set billing_amount = session_price
where billing_amount is null;

alter table public.sessions
alter column billing_amount set not null;

alter table public.payments
add column if not exists billing_mode public.session_billing_mode not null default 'per_session',
add column if not exists billing_reference_month date,
add column if not exists series_id uuid references public.session_series (id) on delete set null;

create index if not exists idx_sessions_billing_mode on public.sessions (billing_mode, starts_at);
create index if not exists idx_session_series_billing_mode on public.session_series (billing_mode, starts_on);
create index if not exists idx_payments_billing_lookup
on public.payments (patient_id, series_id, billing_reference_month, billing_mode);
create unique index if not exists idx_payments_session_id_unique
on public.payments (session_id)
where session_id is not null;
