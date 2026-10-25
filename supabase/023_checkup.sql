-- Check-up du 25 octobre 2026. Déjà appliqué sur « PRZM CN - Website ».

-- 1. L'envoi des messages Discord ne se réveille que si au moins un message a été ajouté.
--    (Le déclencheur « par requête » partait aussi quand le rappel des scrims n'ajoutait rien :
--    la fonction discord-dm tournait toutes les 5 minutes pour rien.)
create or replace function public.notify_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from new_rows) then perform public.notify_dispatch(); end if;
  return null;
end $$;
drop trigger if exists notify_after_insert on public.notify_queue;
create trigger notify_after_insert after insert on public.notify_queue
  referencing new table as new_rows for each statement execute function public.notify_after_insert();

-- 2. Délai d'appel des fonctions porté à 15 s (un démarrage à froid dépassait parfois les 5 s par défaut)
create or replace function public.notify_dispatch()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://cbbnrdfvaaikawszaysu.supabase.co/functions/v1/discord-dm',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-dm-secret', (select value from public.app_secrets where name = 'dm')),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000);
end $$;

create or replace function public.map_rotation_check()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://cbbnrdfvaaikawszaysu.supabase.co/functions/v1/map-rotation',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-dm-secret', (select value from public.app_secrets where name = 'dm')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
end $$;
revoke all on function public.map_rotation_check() from public, anon, authenticated;

-- 3. Index sur les clés étrangères de la file des messages (conseil Supabase)
create index if not exists notify_queue_user_idx on public.notify_queue (user_id);
create index if not exists notify_queue_scrim_idx on public.notify_queue (scrim_id);

-- 4. Droits : personne ne peut vider une table entière (TRUNCATE passe outre la sécurité des lignes),
--    et la rotation des maps / les map pools ne s'écrivent que par les fonctions prévues.
revoke truncate on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate on tables from anon, authenticated;
revoke insert, update, delete on public.map_rotation, public.team_map_pools from anon, authenticated;

-- 5. Restes des tournois supprimés
drop function if exists public.admin_report_score(uuid, smallint, smallint);
