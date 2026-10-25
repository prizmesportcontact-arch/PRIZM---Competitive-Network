-- 024 — Sauvegarde hebdomadaire : bucket privé « backups » + appel de la fonction « backup » chaque lundi.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 52428800, array['application/json'])
on conflict (id) do update set public = false;

create or replace function public.backup_run()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://cbbnrdfvaaikawszaysu.supabase.co/functions/v1/backup',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-dm-secret', (select value from public.app_secrets where name = 'dm')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
end $$;
revoke all on function public.backup_run() from public, anon, authenticated;

select cron.unschedule('weekly-backup') where exists (select 1 from cron.job where jobname = 'weekly-backup');
select cron.schedule('weekly-backup', '23 4 * * 1', 'select public.backup_run()');
