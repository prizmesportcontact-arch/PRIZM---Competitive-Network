-- Pages publiques : une page par équipe (#/equipe/TAG) et une par joueur (#/joueur/<id>).
-- Déjà appliqué sur « PRZM CN - Website ».

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
                   'pos', (select count(*) + 1 from lb l2 where l2.division = l.division and
                           (l2.points > l.points or (l2.points = l.points and l2.rf - l2.ra > l.rf - l.ra))),
                   'of', (select count(*) from lb l3 where l3.division = l.division))
                 from lb l where l.team_id = t.id),
    'scrims', public.team_recent_scrims(t.id),
    'recruit', (select json_build_object('roles', p.roles, 'dispo', p.dispo, 'message', p.message)
                from public.lfg_posts p where p.team_id = t.id and p.kind = 'equipe' and p.created_at > now() - interval '30 days' limit 1),
    'contact', (select c.discord_id from public.profiles c where c.id = t.captain_id))
  from t
$$;

create or replace function public.player_public(p_user uuid)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'profile', json_build_object('id', p.id, 'username', p.username, 'avatar_url', p.avatar_url, 'riot_id', p.riot_id,
                                 'rank', p.rank, 'rank_source', p.rank_source, 'created_at', p.created_at,
                                 'staff', p.is_admin or p.staff_role is not null),
    'team', (select json_build_object('name', t.name, 'tag', t.tag, 'logo_url', t.logo_url, 'division', t.division,
                                      'status', t.status, 'role', m.role, 'is_captain', t.captain_id = p.id)
             from public.team_members m join public.teams t on t.id = m.team_id
             where m.user_id = p.id and (not t.is_test or public.is_staff())),
    'lfg', (select json_build_object('roles', l.roles, 'dispo', l.dispo, 'message', l.message, 'division', l.division)
            from public.lfg_posts l where l.user_id = p.id and l.kind = 'joueur' and l.created_at > now() - interval '30 days' limit 1),
    -- Discord seulement si le joueur cherche une équipe (il a choisi d'être contacté)
    'contact', (select p.discord_id where exists (select 1 from public.lfg_posts l where l.user_id = p.id and l.kind = 'joueur'
                                                  and l.created_at > now() - interval '30 days')))
  from public.profiles p where p.id = p_user
$$;

grant execute on function public.team_public(text), public.player_public(uuid) to anon, authenticated;

-- Les annonces de joueurs donnent l'id du joueur (lien vers sa page)
create or replace function public.list_lfg()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'players', coalesce((select json_agg(x order by x.created_at desc) from (
        select l.id, l.user_id, l.roles, l.division, l.dispo, l.message, l.created_at, l.user_id = auth.uid() as mine,
               p.username, p.avatar_url, p.discord_id, p.riot_id, p.rank, p.rank_source
        from public.lfg_posts l join public.profiles p on p.id = l.user_id
        where l.kind = 'joueur' and l.created_at > now() - interval '30 days') x), '[]'::json),
    'teams', coalesce((select json_agg(x order by x.created_at desc) from (
        select l.id, l.roles, l.division, l.dispo, l.message, l.created_at, t.captain_id = auth.uid() as mine,
               t.id as team_id, t.name, t.tag, t.logo_url, t.status,
               (select count(*)::int from public.team_members m where m.team_id = t.id) as members,
               c.username as captain, c.discord_id
        from public.lfg_posts l join public.teams t on t.id = l.team_id left join public.profiles c on c.id = t.captain_id
        where l.kind = 'equipe' and l.created_at > now() - interval '30 days' and not t.is_test) x), '[]'::json))
$$;
