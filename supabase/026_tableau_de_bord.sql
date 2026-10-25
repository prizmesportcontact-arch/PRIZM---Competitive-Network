-- 026 — Vrai tableau de bord : préparation de chaque map (compo, strats, bilan)
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
                   'diff', l.rf - l.ra, 'points', l.points, 'reliability', l.reliability, 'mw', l.mw, 'ml', l.ml,
                   'pos', (select count(*) + 1 from lb l2 where l2.division = l.division and
                           (l2.points > l.points or (l2.points = l.points and l2.rf - l2.ra > l.rf - l.ra))),
                   'of', (select count(*) from lb l3 where l3.division = l.division))
                 from lb l, me where l.team_id = me.tid),
    'cb', json_build_object(
      'comps', (select coalesce(json_object_agg(status, n), '{}'::json) from
                 (select c.status, count(*)::int n from public.cb_compositions c, me where c.team_id = me.tid group by c.status) x),
      'maps', (select count(distinct c.map_uuid)::int from public.cb_compositions c, me where c.team_id = me.tid),
      'editor', (select public.my_cb_edit_team() is not null),
      'strats_total', (select count(*)::int from public.cb_strats x, me where x.team_id = me.tid),
      'strats', coalesce((select json_agg(y order by y.updated_at desc) from (
          select x.id, x.name, x.side, x.map_uuid, x.updated_at, jsonb_array_length(x.steps) as steps
          from public.cb_strats x, me where x.team_id = me.tid order by x.updated_at desc limit 5) y), '[]'::json)),
    'map_stats', public.team_map_stats((select tid from me)),
    -- Préparation par map : statut de la compo principale (sinon la plus avancée), nombre de compos et de strats
    'cb_maps', (select coalesce(json_object_agg(u.map_uuid, json_build_object(
          'status', (select c.status from public.cb_compositions c where c.team_id = me.tid and c.map_uuid = u.map_uuid
                     order by c.is_main desc, case c.status when 'validated' then 0 when 'testing' then 1 when 'needs_work' then 2 else 3 end limit 1),
          'comps', (select count(*)::int from public.cb_compositions c where c.team_id = me.tid and c.map_uuid = u.map_uuid),
          'strats', (select count(*)::int from public.cb_strats x where x.team_id = me.tid and x.map_uuid = u.map_uuid))), '{}'::json)
        from me, (select c.map_uuid from public.cb_compositions c, me where c.team_id = me.tid
                  union select x.map_uuid from public.cb_strats x, me where x.team_id = me.tid) u
        where u.map_uuid is not null),
    'lfg', exists (select 1 from public.lfg_posts l, me where l.team_id = me.tid)
  ) end
$$;
