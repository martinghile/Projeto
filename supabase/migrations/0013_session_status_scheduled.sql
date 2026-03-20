do $$
begin
  alter type public.session_status add value if not exists 'scheduled';
exception
  when duplicate_object then null;
end $$;

alter table public.sessions
alter column status set default 'scheduled';

update public.sessions
set status = 'scheduled'
where status = 'confirmed'
  and coalesce(confirmation_status::text, 'pending') <> 'confirmed'
  and starts_at >= timezone('utc', now());
