-- Comp Builder recentré sur les compos : plus de matchs, de dispos, de webhook ni de bot Discord
-- (scrims, classement et stats vivent sur le site). Déjà appliqué sur « PRZM CN - Website ».

select cron.unschedule('cb-match-reminders') where exists (select 1 from cron.job where jobname = 'cb-match-reminders');

drop function if exists public.cb_send_reminders();
drop table if exists public.cb_discord_messages;
drop table if exists public.cb_availability;
drop table if exists public.cb_match_maps;
drop table if exists public.cb_matches;
drop table if exists public.cb_settings;
drop function if exists public.cb_reset_reminder();

alter table public.cb_compositions
  drop column if exists vote_status,
  drop column if exists vote_message_id,
  drop column if exists vote_channel_id;

drop extension if exists pg_cron;
drop extension if exists pg_net;

-- Tableau de bord : partie Comp Builder réduite aux compos
create or replace function public.team_dashboard()
returns json language sql stable security definer set search_path = '' as $$
  with me as (select public.my_team_id() as tid),
  lb as (select * from public.scrim_leaderboard())
  select case when (select tid from me) is null then null else json_build_object(
    'scrims', public.team_recent_scrims((select tid from me)),
    'todo', (select count(*)::int from public.scrims s, me where me.tid in (s.host_id, s.guest_id)
              and ((s.status = 'cale' and s.starts_at <= now())
                or (s.status = 'termine' and s.no_show is null and not s.confirmed and s.reported_by is distinct from me.tid))),
    'open_posts', (select count(*)::int from public.scrims s, me where s.host_id = me.tid and s.status = 'ouvert' and s.starts_at > now()),
    'standing', (select json_build_object('played', l.played, 'wins', l.wins, 'draws', l.draws, 'losses', l.losses,
                   'diff', l.rf - l.ra, 'points', l.points, 'reliability', l.reliability,
                   'pos', (select count(*) + 1 from lb l2 where l2.division = l.division and
                           (l2.points > l.points or (l2.points = l.points and l2.rf - l2.ra > l.rf - l.ra))),
                   'of', (select count(*) from lb l3 where l3.division = l.division))
                 from lb l, me where l.team_id = me.tid),
    'cb', json_build_object(
      'comps', (select coalesce(json_object_agg(status, n), '{}'::json) from
                 (select c.status, count(*)::int n from public.cb_compositions c, me where c.team_id = me.tid group by c.status) x),
      'maps', (select count(distinct c.map_uuid)::int from public.cb_compositions c, me where c.team_id = me.tid),
      'editor', (select public.my_cb_edit_team() is not null)),
    'lfg', exists (select 1 from public.lfg_posts l, me where l.team_id = me.tid)
  ) end
$$;
revoke execute on function public.team_dashboard() from public, anon;
grant execute on function public.team_dashboard() to authenticated;
