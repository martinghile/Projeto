create type public.session_confirmation_status as enum (
  'pending',
  'confirmed',
  'reschedule_requested',
  'cancel_requested'
);

create type public.whatsapp_connection_status as enum (
  'disconnected',
  'initializing',
  'qr_pending',
  'authenticated',
  'ready',
  'error'
);

create type public.whatsapp_message_direction as enum ('outbound', 'inbound');
create type public.whatsapp_message_kind as enum ('reminder_24h', 'reminder_2h', 'reply', 'system');

alter table public.sessions
add column if not exists confirmation_status public.session_confirmation_status not null default 'pending',
add column if not exists confirmed_at timestamptz,
add column if not exists whatsapp_reminder_24h_sent_at timestamptz,
add column if not exists whatsapp_reminder_2h_sent_at timestamptz,
add column if not exists whatsapp_response_text text,
add column if not exists whatsapp_response_received_at timestamptz;

create table if not exists public.whatsapp_connections (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  connected_phone text,
  display_name text,
  status public.whatsapp_connection_status not null default 'disconnected',
  last_error text,
  connected_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  patient_id uuid references public.patients (id) on delete set null,
  direction public.whatsapp_message_direction not null,
  kind public.whatsapp_message_kind not null,
  remote_jid text,
  message_body text not null,
  external_message_id text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_sessions_confirmation_status on public.sessions (confirmation_status, starts_at);
create index if not exists idx_whatsapp_connections_status on public.whatsapp_connections (status);
create index if not exists idx_whatsapp_messages_tenant_created_at on public.whatsapp_messages (tenant_id, created_at desc);
create index if not exists idx_whatsapp_messages_session_id on public.whatsapp_messages (session_id);

drop trigger if exists set_whatsapp_connections_updated_at on public.whatsapp_connections;
create trigger set_whatsapp_connections_updated_at
before update on public.whatsapp_connections
for each row execute procedure public.set_updated_at();

alter table public.whatsapp_connections enable row level security;
alter table public.whatsapp_messages enable row level security;

create policy "users can view whatsapp connections"
on public.whatsapp_connections
for select
using (public.is_tenant_member(tenant_id));

create policy "users can insert whatsapp connections"
on public.whatsapp_connections
for insert
with check (public.is_tenant_member(tenant_id));

create policy "users can update whatsapp connections"
on public.whatsapp_connections
for update
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

create policy "users can view whatsapp messages"
on public.whatsapp_messages
for select
using (public.is_tenant_member(tenant_id));

create policy "users can insert whatsapp messages"
on public.whatsapp_messages
for insert
with check (public.is_tenant_member(tenant_id));
