-- 025 — Score de chaque map dans les scrims + strats dans « Mon espace »
-- map_scores : [{ "map": "Ascent", "h": 13, "g": 9 }, …] (h = équipe hôte, g = équipe invitée), 1 à 5 maps.
-- host_score / guest_score restent le total de rounds (différence de rounds du classement).
-- Quand le détail par map existe, le vainqueur est celui qui gagne le plus de maps.

alter table public.scrims add column if not exists map_scores jsonb;
alter table public.scrims drop constraint if exists scrims_map_scores_check;
alter table public.scrims add constraint scrims_map_scores_check
  check (map_scores is null or (jsonb_typeof(map_scores) = 'array' and jsonb_array_length(map_scores) between 1 and 5));

-- Maps gagnées par chaque camp (null sans détail par map)
create or replace function public.scrim_maps_won(s public.scrims, p_host boolean)
returns int language sql immutable set search_path = '' as $$
  select case when s.map_scores is null then null else
    (select count(*)::int from jsonb_array_elements(s.map_scores) e
     where case when p_host then (e->>'h')::int > (e->>'g')::int else (e->>'g')::int > (e->>'h')::int end) end
$$;

-- Détail par map vu par une équipe : [{ map, us, them }]
create or replace function public.scrim_maps_for(s public.scrims, p_team uuid)
returns jsonb language sql immutable set search_path = '' as $$
  select case when s.map_scores is null then null else
    (select jsonb_agg(jsonb_build_object('map', e->>'map',
        'us', case when s.host_id = p_team then (e->>'h')::int else (e->>'g')::int end,
        'them', case when s.host_id = p_team then (e->>'g')::int else (e->>'h')::int end) order by n)
     from jsonb_array_elements(s.map_scores) with ordinality x(e, n)) end
$$;

-- Envoi du résultat, map par map : p_maps = [{ "map": "Ascent", "for": 13, "against": 9 }, …]
create or replace function public.report_scrim_maps(p_id uuid, p_maps jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.teams; s public.scrims; e jsonb; arr jsonb := '[]'::jsonb; f int; a int; m text; th int := 0; tg int := 0;
begin
  t := public.my_captain_team();
  select * into s from public.scrims where id = p_id for update;
  if not found or t.id is null or t.id not in (s.host_id, coalesce(s.guest_id, s.host_id)) or s.guest_id is null then raise exception 'Réservé aux capitaines du scrim.'; end if;
  if s.status <> 'cale' then raise exception 'Le résultat a déjà été envoyé.'; end if;
  if now() < s.starts_at then raise exception 'Le scrim n''a pas encore commencé.'; end if;
  if jsonb_typeof(p_maps) <> 'array' or jsonb_array_length(p_maps) not between 1 and 5 then raise exception 'Entre le score de 1 à 5 maps.'; end if;
  for e in select * from jsonb_array_elements(p_maps) loop
    m := btrim(coalesce(e->>'map', ''));
    if m = '' or length(m) > 30 then raise exception 'Choisis la map de chaque ligne.'; end if;
    if arr @> jsonb_build_array(jsonb_build_object('map', m)) then raise exception 'La map % est en double.', m; end if;
    begin f := (e->>'for')::int; a := (e->>'against')::int;
    exception when others then raise exception 'Score invalide sur %.', m; end;
    if f is null or a is null or f < 0 or a < 0 or f > 99 or a > 99 or (f = 0 and a = 0) then raise exception 'Score invalide sur %.', m; end if;
    if t.id = s.host_id then arr := arr || jsonb_build_object('map', m, 'h', f, 'g', a); th := th + f; tg := tg + a;
    else arr := arr || jsonb_build_object('map', m, 'h', a, 'g', f); th := th + a; tg := tg + f; end if;
  end loop;
  update public.scrims set status = 'termine', reported_by = t.id, reported_at = now(), confirmed = false,
    host_score = th, guest_score = tg, map_scores = arr
  where id = s.id;
end $$;
revoke all on function public.report_scrim_maps(uuid, jsonb) from public, anon;
grant execute on function public.report_scrim_maps(uuid, jsonb) to authenticated;

-- L'ancien envoi (total seulement) efface un éventuel détail ; refus et remise à zéro aussi
create or replace function public.report_scrim(p_id uuid, p_for smallint, p_against smallint)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.teams; s public.scrims;
begin
  t := public.my_captain_team();
  select * into s from public.scrims where id = p_id for update;
  if not found or t.id is null or t.id not in (s.host_id, coalesce(s.guest_id, s.host_id)) or s.guest_id is null then raise exception 'Réservé aux capitaines du scrim.'; end if;
  if s.status <> 'cale' then raise exception 'Le résultat a déjà été envoyé.'; end if;
  if now() < s.starts_at then raise exception 'Le scrim n''a pas encore commencé.'; end if;
  if p_for is null or p_against is null or p_for < 0 or p_against < 0 or p_for > 99 or p_against > 99 then raise exception 'Score invalide.'; end if;
  update public.scrims set status = 'termine', reported_by = t.id, reported_at = now(), confirmed = false, map_scores = null,
    host_score = case when t.id = s.host_id then p_for else p_against end,
    guest_score = case when t.id = s.host_id then p_against else p_for end
  where id = s.id;
end $$;

create or replace function public.confirm_scrim(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.teams; s public.scrims;
begin
  t := public.my_captain_team();
  select * into s from public.scrims where id = p_id for update;
  if not found or t.id is null or t.id not in (s.host_id, coalesce(s.guest_id, s.host_id)) then raise exception 'Réservé aux capitaines du scrim.'; end if;
  if s.status <> 'termine' or s.confirmed or s.reported_by = t.id then raise exception 'Rien à confirmer.'; end if;
  if p_accept then update public.scrims set confirmed = true where id = s.id;
  else update public.scrims set status = 'cale', host_score = null, guest_score = null, map_scores = null, reported_by = null, reported_at = null where id = s.id;
  end if;
end $$;

create or replace function public.admin_reset_scrim(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff.'; end if;
  update public.scrims set status = case when guest_id is null then 'ouvert' else 'cale' end, host_score = null, guest_score = null, map_scores = null,
    reported_by = null, reported_at = null, confirmed = false, no_show = null, cancelled_by = null, cancel_late = false where id = p_id;
end $$;

-- Le détail par map est envoyé avec chaque scrim
create or replace function public.scrim_json(s public.scrims)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'division', s.division, 'starts_at', s.starts_at, 'format', s.format, 'maps', s.maps, 'note', s.note,
    'status', s.status, 'host_score', s.host_score, 'guest_score', s.guest_score, 'map_scores', s.map_scores,
    'reported_by', s.reported_by, 'confirmed', s.confirmed,
    'no_show', s.no_show, 'cancelled_by', s.cancelled_by, 'cancel_late', s.cancel_late,
    'host', (select jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'logo_url', t.logo_url, 'division', t.division,
               'captain', c.username, 'discord_id', c.discord_id) from public.teams t left join public.profiles c on c.id = t.captain_id where t.id = s.host_id),
    'guest', (select jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'logo_url', t.logo_url, 'division', t.division,
               'captain', c.username, 'discord_id', c.discord_id) from public.teams t left join public.profiles c on c.id = t.captain_id where t.id = s.guest_id))
$$;

-- Résultats récents : + détail par map et maps gagnées
create or replace function public.team_recent_scrims(p_team uuid)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'results', coalesce((select json_agg(x order by x.starts_at desc) from (
        select s.starts_at, s.format, s.no_show,
               case when s.host_id = p_team then s.host_score else s.guest_score end as us,
               case when s.host_id = p_team then s.guest_score else s.host_score end as them,
               public.scrim_maps_for(s, p_team) as maps,
               public.scrim_maps_won(s, s.host_id = p_team) as mw,
               public.scrim_maps_won(s, s.host_id <> p_team) as ml,
               o.name as opp, o.tag as opp_tag, o.logo_url as opp_logo
        from public.scrims s join public.teams o on o.id = case when s.host_id = p_team then s.guest_id else s.host_id end
        where p_team in (s.host_id, s.guest_id) and s.status = 'termine'
          and (s.confirmed or s.reported_at < now() - interval '48 hours')
        order by s.starts_at desc limit 8) x), '[]'::json),
    'next', coalesce((select json_agg(x order by x.starts_at) from (
        select s.starts_at, s.format, o.name as opp, o.tag as opp_tag, o.logo_url as opp_logo
        from public.scrims s join public.teams o on o.id = case when s.host_id = p_team then s.guest_id else s.host_id end
        where p_team in (s.host_id, s.guest_id) and s.status = 'cale' and s.starts_at > now()
        order by s.starts_at limit 3) x), '[]'::json))
$$;

-- Bilan par map d'une équipe (scrims comptés au classement)
create or replace function public.team_map_stats(p_team uuid)
returns json language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(x order by x.played desc, x.wins desc, x.map), '[]'::json) from (
    select e->>'map' as map, count(*)::int as played,
           count(*) filter (where us > them)::int as wins, count(*) filter (where us < them)::int as losses,
           sum(us - them)::int as diff
    from (select e, case when s.host_id = p_team then (e->>'h')::int else (e->>'g')::int end as us,
                    case when s.host_id = p_team then (e->>'g')::int else (e->>'h')::int end as them
          from public.scrims s, jsonb_array_elements(s.map_scores) e
          where p_team in (s.host_id, s.guest_id) and s.status = 'termine' and s.no_show is null and s.map_scores is not null
            and (s.confirmed or s.reported_at < now() - interval '48 hours')) y
    group by e->>'map') x
$$;

-- Classement : victoire = plus de maps gagnées quand le détail existe, sinon plus de rounds ; + maps gagnées / perdues
drop function if exists public.scrim_leaderboard();
create function public.scrim_leaderboard()
returns table(team_id uuid, name text, tag text, logo_url text, division smallint, played integer, wins integer, draws integer, losses integer,
              rf integer, ra integer, points integer, no_shows integer, late_cancels integer, reliability integer, mw integer, ml integer)
language sql stable security definer set search_path = '' as $$
  with ok as (
    select s.*, public.scrim_maps_won(s, true) as hw, public.scrim_maps_won(s, false) as gw from public.scrims s
    where s.status = 'termine' and s.no_show is null and s.host_score is not null
      and (s.confirmed or s.reported_at < now() - interval '48 hours')),
  sides as (
    select host_id as tid, host_score as f, guest_score as a, hw as wf, gw as wa from ok
    union all select guest_id, guest_score, host_score, gw, hw from ok),
  scored as (select tid, f, a, wf, wa, sign(coalesce(wf - wa, f - a)) as r from sides),
  agg as (
    select tid, count(*)::int as played, count(*) filter (where r > 0)::int as wins, count(*) filter (where r = 0)::int as draws,
           count(*) filter (where r < 0)::int as losses, sum(f)::int as rf, sum(a)::int as ra,
           coalesce(sum(wf), 0)::int as mw, coalesce(sum(wa), 0)::int as ml from scored group by tid),
  pen as (
    select t.id as tid,
      (select count(*)::int from public.scrims s where s.no_show = t.id) as ns,
      (select count(*)::int from public.scrims s where s.cancelled_by = t.id and s.cancel_late) as lc
    from public.teams t)
  select t.id, t.name, t.tag, t.logo_url, t.division, coalesce(a.played, 0), coalesce(a.wins, 0), coalesce(a.draws, 0), coalesce(a.losses, 0),
         coalesce(a.rf, 0), coalesce(a.ra, 0), coalesce(a.wins, 0) * 3 + coalesce(a.draws, 0), p.ns, p.lc,
         (100 * coalesce(a.played, 0) / greatest(coalesce(a.played, 0) + p.ns + p.lc, 1))::int,
         coalesce(a.mw, 0), coalesce(a.ml, 0)
  from public.teams t join pen p on p.tid = t.id left join agg a on a.tid = t.id
  where t.status = 'validee' and not t.is_test and (coalesce(a.played, 0) + p.ns + p.lc) > 0
  order by t.division, coalesce(a.wins, 0) * 3 + coalesce(a.draws, 0) desc, coalesce(a.rf, 0) - coalesce(a.ra, 0) desc, t.name
$$;
revoke all on function public.scrim_leaderboard() from public;
grant execute on function public.scrim_leaderboard() to anon, authenticated;

-- Fiche adversaire : + bilan par map de l'équipe et de la mienne, détail par map du face-à-face
create or replace function public.opponent_brief(p_team uuid)
returns json language sql stable security definer set search_path = '' as $$
  with t as (select * from public.teams where id = p_team and (not is_test or public.is_staff())),
  me as (select public.my_team_id() as id),
  lb as (select * from public.scrim_leaderboard())
  select json_build_object(
    'team', json_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'logo_url', t.logo_url,
                              'division', t.division, 'status', t.status, 'created_at', t.created_at),
    'roster', coalesce((select json_agg(r) from public.team_roster(t.id) r), '[]'::json),
    'standing', (select json_build_object('played', l.played, 'wins', l.wins, 'draws', l.draws, 'losses', l.losses,
                   'diff', l.rf - l.ra, 'points', l.points, 'reliability', l.reliability,
                   'no_shows', l.no_shows, 'late_cancels', l.late_cancels, 'mw', l.mw, 'ml', l.ml,
                   'pos', (select count(*) + 1 from lb l2 where l2.division = l.division and
                           (l2.points > l.points or (l2.points = l.points and l2.rf - l2.ra > l.rf - l.ra))),
                   'of', (select count(*) from lb l3 where l3.division = l.division))
                 from lb l where l.team_id = t.id),
    'recent', public.team_recent_scrims(t.id) -> 'results',
    'maps_played', coalesce((select json_agg(s.maps) from (
        select s.maps from public.scrims s
        where t.id in (s.host_id, s.guest_id) and s.status in ('cale', 'termine') and coalesce(s.maps, '') <> ''
        order by s.starts_at desc limit 20) s), '[]'::json),
    'map_stats', public.team_map_stats(t.id),
    'my_map_stats', (select public.team_map_stats(me.id) from me where me.id is not null and me.id <> t.id),
    'h2h', coalesce((select json_agg(x order by x.starts_at desc) from (
        select s.starts_at, s.format, s.no_show,
               case when s.host_id = me.id then s.host_score else s.guest_score end as us,
               case when s.host_id = me.id then s.guest_score else s.host_score end as them,
               public.scrim_maps_for(s, me.id) as maps,
               public.scrim_maps_won(s, s.host_id = me.id) as mw,
               public.scrim_maps_won(s, s.host_id <> me.id) as ml
        from public.scrims s, me
        where me.id is not null and me.id <> t.id and s.status = 'termine'
          and ((s.host_id = me.id and s.guest_id = t.id) or (s.host_id = t.id and s.guest_id = me.id))
        order by s.starts_at desc limit 10) x), '[]'::json),
    'pool', coalesce((select p.pool from public.team_map_pools p where p.team_id = t.id), '{}'::jsonb),
    'my_pool', coalesce((select p.pool from public.team_map_pools p, me where p.team_id = me.id), '{}'::jsonb),
    'contact', (select c.discord_id from public.profiles c where c.id = t.captain_id),
    'captain', (select c.username from public.profiles c where c.id = t.captain_id))
  from t
$$;

-- Page publique de l'équipe : + bilan par map
create or replace function public.team_public(p_tag text)
returns json language sql stable security definer set search_path = '' as $$
  with t as (
    select * from public.teams
    where upper(tag) = upper(trim(p_tag)) and (not is_test or public.is_staff())
  ), lb as (select * from public.scrim_leaderboard())
  select json_build_object(
    'team', json_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'logo_url', t.logo_url, 'status', t.status,
                              'division', t.division, 'created_at', t.created_at, 'suggested', public.suggested_division(t.id)),
    'roster', coalesce((select json_agg(r) from public.team_roster(t.id) r), '[]'::json),
    'standing', (select json_build_object('played', l.played, 'wins', l.wins, 'draws', l.draws, 'losses', l.losses,
                   'diff', l.rf - l.ra, 'points', l.points, 'reliability', l.reliability, 'no_shows', l.no_shows,
                   'mw', l.mw, 'ml', l.ml,
                   'pos', (select count(*) + 1 from lb l2 where l2.division = l.division and
                           (l2.points > l.points or (l2.points = l.points and l2.rf - l2.ra > l.rf - l.ra))),
                   'of', (select count(*) from lb l3 where l3.division = l.division))
                 from lb l where l.team_id = t.id),
    'scrims', public.team_recent_scrims(t.id),
    'map_stats', public.team_map_stats(t.id),
    'recruit', (select json_build_object('roles', p.roles, 'dispo', p.dispo, 'message', p.message)
                from public.lfg_posts p where p.team_id = t.id and p.kind = 'equipe' and p.created_at > now() - interval '30 days' limit 1),
    'contact', (select c.discord_id from public.profiles c where c.id = t.captain_id))
  from t
$$;

-- Mon espace : + dernières strats de l'équipe
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
    'lfg', exists (select 1 from public.lfg_posts l, me where l.team_id = me.tid)
  ) end
$$;

revoke all on function public.scrim_maps_won(public.scrims, boolean) from public, anon, authenticated;
revoke all on function public.scrim_maps_for(public.scrims, uuid) from public, anon, authenticated;
revoke all on function public.team_map_stats(uuid) from public, anon, authenticated;
