-- 028 — Panneau admin : vue d'ensemble, tous les joueurs (avec Discord), toutes les équipes, tous les scrims
create or replace function public.admin_overview()
returns json language sql stable security definer set search_path = '' as $$
  select case when not public.is_admin() then null else json_build_object(
    'players', (select count(*)::int from public.profiles),
    'players_week', (select count(*)::int from public.profiles where created_at > now() - interval '7 days'),
    'players_free', (select count(*)::int from public.profiles p where not exists (select 1 from public.team_members m where m.user_id = p.id)),
    'teams', (select coalesce(json_object_agg(status, n), '{}'::json) from (select status, count(*)::int n from public.teams where not is_test group by status) x),
    'scrims_week', (select count(*)::int from public.scrims where status in ('cale', 'termine') and starts_at between now() - interval '7 days' and now() + interval '7 days'),
    'scrims_open', (select count(*)::int from public.scrims where status = 'ouvert' and starts_at > now()),
    'lfg', (select count(*)::int from public.lfg_posts where created_at > now() - interval '30 days'),
    'pending_teams', coalesce((select json_agg(x order by x.created_at) from (
        select t.id, t.name, t.tag, t.logo_url, t.created_at, public.suggested_division(t.id) as suggested,
               (select count(*)::int from public.team_members m where m.team_id = t.id and m.role = 'titulaire') as titulaires,
               (select p.username from public.profiles p where p.id = t.captain_id) as captain
        from public.teams t where t.status = 'en_attente' and not t.is_test) x), '[]'::json),
    'stuck_scrims', coalesce((select json_agg(x order by x.starts_at) from (
        select s.id, s.starts_at, s.status, s.confirmed, h.name as host, g.name as guest
        from public.scrims s join public.teams h on h.id = s.host_id left join public.teams g on g.id = s.guest_id
        where (s.status = 'cale' and s.starts_at < now() - interval '1 day')
           or (s.status = 'termine' and not s.confirmed and s.no_show is null and s.reported_at < now() - interval '36 hours' and s.reported_at > now() - interval '48 hours')
        limit 20) x), '[]'::json),
    'recent_players', coalesce((select json_agg(x order by x.created_at desc) from (
        select p.id, p.username, p.avatar_url, p.created_at,
               (select t.tag from public.team_members m join public.teams t on t.id = m.team_id where m.user_id = p.id) as team_tag
        from public.profiles p order by p.created_at desc limit 8) x), '[]'::json)
  ) end
$$;

create or replace function public.admin_players()
returns table(id uuid, username text, avatar_url text, discord_id text, riot_id text, rank smallint, rank_source text, staff_role text,
              team_id uuid, team_name text, team_tag text, team_role text, is_captain boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.avatar_url, p.discord_id, p.riot_id, p.rank, p.rank_source,
         case when p.is_admin then 'admin' else p.staff_role end,
         t.id, t.name, t.tag, m.role, t.captain_id = p.id, p.created_at
  from public.profiles p
  left join public.team_members m on m.user_id = p.id
  left join public.teams t on t.id = m.team_id
  where public.is_admin()
  order by p.created_at desc
  limit 2000
$$;

create or replace function public.admin_teams()
returns table(id uuid, name text, tag text, status text, division smallint, suggested smallint, members int, titulaires int,
              captain_id uuid, captain text, captain_discord text, logo_url text, is_test boolean, created_at timestamptz,
              scrims int, last_scrim timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, t.tag, t.status, t.division, public.suggested_division(t.id),
         (select count(*)::int from public.team_members m where m.team_id = t.id),
         (select count(*)::int from public.team_members m where m.team_id = t.id and m.role = 'titulaire'),
         t.captain_id, c.username, c.discord_id, t.logo_url, t.is_test, t.created_at,
         (select count(*)::int from public.scrims s where t.id in (s.host_id, s.guest_id) and s.status = 'termine'),
         (select max(s.starts_at) from public.scrims s where t.id in (s.host_id, s.guest_id) and s.status in ('cale', 'termine'))
  from public.teams t left join public.profiles c on c.id = t.captain_id
  where public.is_admin()
  order by case t.status when 'en_attente' then 0 when 'validee' then 1 else 2 end, t.created_at
$$;

create or replace function public.admin_scrims()
returns table(id uuid, starts_at timestamptz, format text, maps text, status text, division smallint, host_id uuid, host text, host_tag text,
              guest_id uuid, guest text, guest_tag text, host_score smallint, guest_score smallint, map_scores jsonb, confirmed boolean,
              no_show uuid, cancel_late boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.starts_at, s.format, s.maps, s.status, s.division, s.host_id, h.name, h.tag, s.guest_id, g.name, g.tag,
         s.host_score, s.guest_score, s.map_scores, s.confirmed, s.no_show, s.cancel_late, s.created_at
  from public.scrims s join public.teams h on h.id = s.host_id left join public.teams g on g.id = s.guest_id
  where public.is_staff()
  order by s.starts_at desc
  limit 500
$$;

-- Supprimer une équipe (ses scrims proposés, compos et strats partent avec elle)
create or replace function public.admin_delete_team(p_team uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux admins.'; end if;
  delete from public.teams where id = p_team;
  if not found then raise exception 'Équipe introuvable.'; end if;
  perform public.pulse('teams'); perform public.pulse('scrims'); perform public.pulse('team:' || p_team::text);
end $$;

revoke all on function public.admin_overview(), public.admin_players(), public.admin_teams(), public.admin_scrims(), public.admin_delete_team(uuid) from public, anon;
grant execute on function public.admin_overview(), public.admin_players(), public.admin_teams(), public.admin_scrims(), public.admin_delete_team(uuid) to authenticated;
