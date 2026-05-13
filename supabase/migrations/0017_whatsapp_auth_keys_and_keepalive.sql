-- Table to store Baileys auth credentials per tenant (replaces filesystem LocalAuth)
create table if not exists public.whatsapp_auth_keys (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (tenant_id, key)
);

alter table public.whatsapp_auth_keys enable row level security;

-- Only the service role can access this table (no client access)
-- RLS with no policies = blocked for anon/authenticated, open for service_role

-- Enable pg_net and pg_cron extensions for keep-alive
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;
