-- Messages privés Discord aux capitaines : scrim accepté, rappel 30 min avant, score à confirmer, absence déclarée.
-- Les évènements vont dans une file (notify_queue) ; la fonction discord-dm les envoie avec le bot du réseau.
-- Déjà appliqué sur « PRZM CN - Website ».

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Secret partagé entre la base et la fonction discord-dm (personne d'autre ne peut la déclencher)
create table if not exists public.app_secrets (name text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
insert into public.app_secrets (name, value) values ('dm', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (name) do nothing;

create table if not exists public.notify_queue (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  kind       text not null check (kind in ('accepted', 'reminder', 'confirm', 'no_show')),
  scrim_id   uuid references public.scrims on delete cascade,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  attempts   int not null default 0,
  error      text
);
create index if not exists notify_queue_pending_idx on public.notify_queue (created_at) where sent_at is null;
alter table public.notify_queue enable row level security;
revoke all on public.notify_queue from anon, authenticated;

alter table public.scrims add column if not exists reminder_sent_at timestamptz;

-- Réveille la fonction d'envoi (appel HTTP asynchrone, ne ralentit rien)
create or replace function public.notify_dispatch()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://cbbnrdfvaaikawszaysu.supabase.co/functions/v1/discord-dm',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-dm-secret', (select value from public.app_secrets where name = 'dm')),
    body := '{}'::jsonb);
end $$;

create or replace function public.notify_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin perform public.notify_dispatch(); return null; end $$;
drop trigger if exists notify_after_insert on public.notify_queue;
create trigger notify_after_insert after insert on public.notify_queue
  for each statement execute function public.notify_after_insert();

-- Capitaine d'une équipe
create or replace function public.captain_of(p_team uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select captain_id from public.teams where id = p_team
$$;

-- Évènements de scrim → messages
create or replace function public.scrim_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare other uuid;
begin
  if old.status = 'ouvert' and new.status = 'cale' then
    insert into public.notify_queue (user_id, kind, scrim_id)
    select public.captain_of(new.host_id), 'accepted', new.id where public.captain_of(new.host_id) is not null;
  elsif old.status = 'cale' and new.status = 'termine' and new.no_show is null and new.reported_by is not null then
    other := case when new.reported_by = new.host_id then new.guest_id else new.host_id end;
    insert into public.notify_queue (user_id, kind, scrim_id)
    select public.captain_of(other), 'confirm', new.id where public.captain_of(other) is not null;
  elsif new.no_show is not null and old.no_show is null then
    insert into public.notify_queue (user_id, kind, scrim_id)
    select public.captain_of(new.no_show), 'no_show', new.id where public.captain_of(new.no_show) is not null;
  end if;
  return null;
end $$;
drop trigger if exists scrim_notify on public.scrims;
create trigger scrim_notify after update on public.scrims
  for each row when (old.status is distinct from new.status or old.no_show is distinct from new.no_show)
  execute function public.scrim_notify();

-- Toutes les 5 minutes : rappels 30 min avant + nouvel essai pour ce qui n'est pas parti
create or replace function public.scrim_reminders()
returns void language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with due as (
    update public.scrims set reminder_sent_at = now()
    where status = 'cale' and reminder_sent_at is null
      and starts_at > now() and starts_at <= now() + interval '35 minutes'
    returning id, host_id, guest_id)
  insert into public.notify_queue (user_id, kind, scrim_id)
  select c, 'reminder', d.id from due d,
    lateral (values (public.captain_of(d.host_id)), (public.captain_of(d.guest_id))) v(c)
  where c is not null;

  select count(*) into n from public.notify_queue
  where sent_at is null and attempts between 1 and 2 and created_at > now() - interval '1 day';
  if n > 0 then perform public.notify_dispatch(); end if;
end $$;

revoke execute on function public.notify_dispatch(), public.notify_after_insert(), public.captain_of(uuid),
  public.scrim_notify(), public.scrim_reminders() from public, anon, authenticated;

select cron.schedule('scrim-reminders', '*/5 * * * *', $$select public.scrim_reminders();$$)
where not exists (select 1 from cron.job where jobname = 'scrim-reminders');
