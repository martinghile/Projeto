alter table public.anamnesis
  add column if not exists last_public_opened_at timestamptz,
  add column if not exists public_open_count integer not null default 0;

create or replace function public.get_public_anamnesis(target_share_token uuid)
returns table (
  patient_name text,
  status public.anamnesis_status,
  answers jsonb,
  share_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_row public.anamnesis%rowtype;
begin
  select *
    into target_row
  from public.anamnesis
  where share_token = target_share_token
    and (
      share_expires_at is null
      or share_expires_at > timezone('utc', now())
    )
  limit 1;

  if not found then
    return;
  end if;

  update public.anamnesis
     set last_public_opened_at = timezone('utc', now()),
         public_open_count = coalesce(public_open_count, 0) + 1,
         updated_at = timezone('utc', now())
   where id = target_row.id;

  return query
  select
    'Paciente convidado(a)'::text as patient_name,
    target_row.status,
    coalesce(target_row.answers, '{}'::jsonb) as answers,
    target_row.share_expires_at;
end;
$$;

create or replace function public.submit_public_anamnesis(target_share_token uuid, payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.anamnesis
  set
    answers = coalesce(payload, '{}'::jsonb),
    status = 'completed',
    submitted_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where share_token = target_share_token
    and (
      share_expires_at is null
      or share_expires_at > timezone('utc', now())
    );

  if not found then
    raise exception 'Anamnese link invalido ou expirado.';
  end if;
end;
$$;

grant execute on function public.get_public_anamnesis(uuid) to anon, authenticated;
grant execute on function public.submit_public_anamnesis(uuid, jsonb) to anon, authenticated;
