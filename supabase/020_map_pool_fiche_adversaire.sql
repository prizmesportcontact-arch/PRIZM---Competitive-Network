-- Map pool de chaque équipe + fiche adversaire.
-- Déjà appliqué sur « PRZM CN - Website ».

-- Une ligne par équipe : { "Ascent": "forte", "Bind": "jouable", "Lotus": "ban", ... }
create table if not exists public.team_map_pools (
  team_id uuid primary key references public.teams(id) on delete cascade,
  pool jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint pool_is_object check (jsonb_typeof(pool) = 'object')
);
alter table public.team_map_pools enable row level security;

-- Lecture publique (affiché sur la page de l'équipe), écriture seulement par la fonction ci-dessous
drop policy if exists "map pool lisible" on public.team_map_pools;
create policy "map pool lisible" on public.team_map_pools for select to anon, authenticated using (true);
grant select on public.team_map_pools to anon, authenticated;

create or replace function public.set_map_pool(p_pool jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare t uuid; k text; v text;
begin
  select id into t from public.teams where captain_id = (select auth.uid());
  if t is null then raise exception 'Seul le capitaine peut modifier le map pool.'; end if;
  if jsonb_typeof(p_pool) <> 'object' then raise exception 'Map pool invalide.'; end if;
  if (select count(*) from jsonb_object_keys(p_pool)) > 30 then raise exception 'Trop de maps.'; end if;
  for k, v in select key, value #>> '{}' from jsonb_each(p_pool) loop
    if length(k) > 30 or v not in ('forte', 'jouable', 'ban') then raise exception 'Map pool invalide.'; end if;
  end loop;
  insert into public.team_map_pools (team_id, pool, updated_at) values (t, p_pool, now())
  on conflict (team_id) do update set pool = excluded.pool, updated_at = now();
  perform public.pulse('team:' || t);
  perform public.pulse('scrims');
end $$;
revoke all on function public.set_map_pool(jsonb) from public, anon;
grant execute on function public.set_map_pool(jsonb) to authenticated;

-- Fiche adversaire : tout ce qu'il faut savoir avant/pendant un scrim, calculé sur les données du réseau
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
                   'no_shows', l.no_shows, 'late_cancels', l.late_cancels,
                   'pos', (select count(*) + 1 from lb l2 where l2.division = l.division and
                           (l2.points > l.points or (l2.points = l.points and l2.rf - l2.ra > l.rf - l.ra))),
                   'of', (select count(*) from lb l3 where l3.division = l.division))
                 from lb l where l.team_id = t.id),
    'recent', public.team_recent_scrims(t.id) -> 'results',
    -- Maps indiquées dans leurs derniers scrims (texte libre, compté côté site)
    'maps_played', coalesce((select json_agg(s.maps) from (
        select s.maps from public.scrims s
        where t.id in (s.host_id, s.guest_id) and s.status in ('cale', 'termine') and coalesce(s.maps, '') <> ''
        order by s.starts_at desc limit 20) s), '[]'::json),
    'h2h', coalesce((select json_agg(x order by x.starts_at desc) from (
        select s.starts_at, s.format, s.no_show,
               case when s.host_id = me.id then s.host_score else s.guest_score end as us,
               case when s.host_id = me.id then s.guest_score else s.host_score end as them
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
grant execute on function public.opponent_brief(uuid) to anon, authenticated;
