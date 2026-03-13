create or replace function public.get_public_anamnesis(target_share_token uuid)
returns table (
  patient_name text,
  status public.anamnesis_status,
  answers jsonb,
  share_expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    patients.full_name as patient_name,
    anamnesis.status,
    anamnesis.answers,
    anamnesis.share_expires_at
  from public.anamnesis
  join public.patients on patients.id = anamnesis.patient_id
  where anamnesis.share_token = target_share_token
    and (
      anamnesis.share_expires_at is null
      or anamnesis.share_expires_at > timezone('utc', now())
    )
  limit 1
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
