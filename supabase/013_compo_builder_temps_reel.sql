-- PRIZM Competitive Network : Comp Builder intégré (une copie par équipe) + actualisation automatique du site
-- Déjà appliqué sur le projet « PRZM CN - Website ». Gardé ici pour l'historique.

-- =====================================================================
-- 1. Temps réel léger : une petite table de « signaux »
-- Chaque changement (scrim, équipe, annonce…) incrémente un compteur par sujet.
-- Le site écoute cette seule table et recharge la page concernée.
-- Avantages : aucune donnée envoyée en direct (juste « ça a bougé »),
-- très peu de messages, fonctionne aussi pour les visiteurs non connectés.
-- =====================================================================
create table if not exists public.live_pulse (
  topic text primary key,
  v     bigint not null default 0,
  at    timestamptz not null default now()
);
alter table public.live_pulse enable row level security;
drop policy if exists "signaux lisibles" on public.live_pulse;
create policy "signaux lisibles" on public.live_pulse for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.live_pulse from anon, authenticated;

create or replace function public.pulse(p_topic text)
returns void language sql security definer set search_path = '' as $$
  insert into public.live_pulse (topic, v, at) values (p_topic, 1, now())
  on conflict (topic) do update set v = public.live_pulse.v + 1, at = now()
$$;
revoke execute on function public.pulse(text) from public, anon, authenticated;

-- Une seule notification par requête (statement), même si elle touche plusieurs lignes
create or replace function public.pulse_stmt()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.pulse(tg_argv[0]);
  return null;
end $$;

-- Équipes : signal global « teams » + signal propre à l'équipe touchée
create or replace function public.pulse_team_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare tid uuid;
begin
  if tg_table_name = 'teams' then
    if tg_op = 'DELETE' then tid := old.id; else tid := new.id; end if;
  else
    if tg_op = 'DELETE' then tid := old.team_id; else tid := new.team_id; end if;
  end if;
  perform public.pulse('team:' || tid);
  if tg_op = 'UPDATE' and tg_table_name = 'team_members' then
    if old.team_id is distinct from new.team_id then perform public.pulse('team:' || old.team_id); end if;
  end if;
  return null;
end $$;

-- Profil : seulement si ce qui s'affiche change (pseudo, avatar, Riot ID, rang)
create or replace function public.pulse_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare tid uuid;
begin
  select team_id into tid from public.team_members where user_id = new.id;
  if tid is not null then
    perform public.pulse('team:' || tid);
    perform public.pulse('teams');
  end if;
  return null;
end $$;

revoke execute on function public.pulse_stmt(), public.pulse_team_row(), public.pulse_profile() from public, anon, authenticated;

drop trigger if exists pulse_scrims on public.scrims;
create trigger pulse_scrims after insert or update or delete on public.scrims
  for each statement execute function public.pulse_stmt('scrims');
drop trigger if exists pulse_lfg on public.lfg_posts;
create trigger pulse_lfg after insert or update or delete on public.lfg_posts
  for each statement execute function public.pulse_stmt('lfg');
drop trigger if exists pulse_teams on public.teams;
create trigger pulse_teams after insert or update or delete on public.teams
  for each statement execute function public.pulse_stmt('teams');
drop trigger if exists pulse_members on public.team_members;
create trigger pulse_members after insert or update or delete on public.team_members
  for each statement execute function public.pulse_stmt('teams');
drop trigger if exists pulse_teams_row on public.teams;
create trigger pulse_teams_row after insert or update or delete on public.teams
  for each row execute function public.pulse_team_row();
drop trigger if exists pulse_members_row on public.team_members;
create trigger pulse_members_row after insert or update or delete on public.team_members
  for each row execute function public.pulse_team_row();
drop trigger if exists pulse_profiles on public.profiles;
create trigger pulse_profiles after update on public.profiles
  for each row when (old.username is distinct from new.username or old.avatar_url is distinct from new.avatar_url
                  or old.riot_id is distinct from new.riot_id or old.rank is distinct from new.rank
                  or old.rank_source is distinct from new.rank_source)
  execute function public.pulse_profile();

-- =====================================================================
-- 2. Comp Builder : les données de chaque équipe, visibles par ses seuls membres
-- =====================================================================
alter table public.team_members add column if not exists cb_editor boolean not null default false;

-- Équipe de la personne connectée si elle peut modifier le Comp Builder (capitaine ou éditeur)
create or replace function public.my_cb_edit_team()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.team_id from public.team_members m join public.teams t on t.id = m.team_id
  where m.user_id = auth.uid() and (m.cb_editor or t.captain_id = auth.uid())
$$;
revoke execute on function public.my_cb_edit_team() from public, anon;
grant execute on function public.my_cb_edit_team() to authenticated;
grant execute on function public.my_team_id() to authenticated;

create table if not exists public.cb_players (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams on delete cascade,
  user_id        uuid references public.profiles on delete set null,
  pseudo         text not null check (char_length(pseudo) between 1 and 32),
  primary_role   text check (primary_role is null or char_length(primary_role) <= 20),
  secondary_role text check (secondary_role is null or char_length(secondary_role) <= 20),
  color          text not null default '#ff4655' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at     timestamptz not null default now(),
  unique (team_id, user_id),
  unique (id, team_id)
);
create index if not exists cb_players_team_idx on public.cb_players (team_id);
create index if not exists cb_players_user_idx on public.cb_players (user_id);

create table if not exists public.cb_compositions (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams on delete cascade,
  map_uuid        text not null check (char_length(map_uuid) <= 64),
  name            text not null default 'Composition principale' check (char_length(name) between 1 and 60),
  slots           jsonb not null default '[{"agentUuid":null,"playerId":null},{"agentUuid":null,"playerId":null},{"agentUuid":null,"playerId":null},{"agentUuid":null,"playerId":null},{"agentUuid":null,"playerId":null}]'::jsonb
                  check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) = 5),
  status          text not null default 'todo' check (status in ('todo', 'testing', 'needs_work', 'validated')),
  notes           text not null default '' check (char_length(notes) <= 5000),
  is_main         boolean not null default false,
  vote_status     text check (vote_status is null or vote_status = 'open'),
  vote_message_id text,
  vote_channel_id text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists cb_compositions_team_idx on public.cb_compositions (team_id);

create table if not exists public.cb_matches (
  id                  uuid primary key default gen_random_uuid(),
  team_id             uuid not null references public.teams on delete cascade,
  opponent_name       text check (opponent_name is null or char_length(opponent_name) <= 60),
  type                text not null default 'match' check (type in ('scrim', 'match')),
  format              text not null default 'bo1' check (format in ('bo1', 'bo3', 'bo5')),
  match_date          date,
  match_time          time,
  notes               text not null default '' check (char_length(notes) <= 5000),
  position            integer not null default 0,
  opponent_logo_url   text check (opponent_logo_url is null or char_length(opponent_logo_url) <= 500),
  vod_url             text check (vod_url is null or char_length(vod_url) <= 500),
  presence_message_id text,
  presence_channel_id text,
  presence_yes        integer,
  presence_no         integer,
  presence_synced_at  timestamptz,
  reminder_sent_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, team_id)
);
create index if not exists cb_matches_team_idx on public.cb_matches (team_id);
create index if not exists cb_matches_reminder_idx on public.cb_matches (match_date) where reminder_sent_at is null;

create table if not exists public.cb_match_maps (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null,
  match_id       uuid not null,
  position       integer not null default 0,
  map_uuid       text check (map_uuid is null or char_length(map_uuid) <= 64),
  composition_id uuid references public.cb_compositions on delete set null,
  our_score      integer check (our_score is null or our_score between 0 and 99),
  opponent_score integer check (opponent_score is null or opponent_score between 0 and 99),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (match_id, position),
  foreign key (match_id, team_id) references public.cb_matches (id, team_id) on delete cascade
);
create index if not exists cb_match_maps_team_idx on public.cb_match_maps (team_id);
create index if not exists cb_match_maps_comp_idx on public.cb_match_maps (composition_id);

create table if not exists public.cb_availability (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null,
  player_id  uuid not null,
  date       date not null,
  period     text not null check (period in ('morning', 'afternoon', 'evening')),
  created_at timestamptz not null default now(),
  unique (player_id, date, period),
  foreign key (player_id, team_id) references public.cb_players (id, team_id) on delete cascade
);
create index if not exists cb_availability_team_date_idx on public.cb_availability (team_id, date);

-- Webhook Discord de l'équipe (secret : lisible seulement par les éditeurs)
create table if not exists public.cb_settings (
  team_id             uuid primary key references public.teams on delete cascade,
  discord_webhook_url text check (discord_webhook_url is null or discord_webhook_url ~ '^https://(ptb\.|canary\.)?discord(app)?\.com/api/webhooks/')
);

-- ----- Sécurité -----
alter table public.cb_players      enable row level security;
alter table public.cb_compositions enable row level security;
alter table public.cb_matches      enable row level security;
alter table public.cb_match_maps   enable row level security;
alter table public.cb_availability enable row level security;
alter table public.cb_settings     enable row level security;
revoke all on public.cb_players, public.cb_compositions, public.cb_matches, public.cb_match_maps,
              public.cb_availability, public.cb_settings from anon;

-- (select fonction()) : calculé une seule fois par requête, pas une fois par ligne
create policy "cb lecture équipe" on public.cb_players for select to authenticated using (team_id = (select public.my_team_id()));
create policy "cb ajout éditeur" on public.cb_players for insert to authenticated with check (team_id = (select public.my_cb_edit_team()));
create policy "cb modif éditeur ou soi" on public.cb_players for update to authenticated
  using (team_id = (select public.my_cb_edit_team()) or user_id = (select auth.uid()))
  with check (team_id = (select public.my_team_id()));
create policy "cb suppression éditeur" on public.cb_players for delete to authenticated using (team_id = (select public.my_cb_edit_team()) and user_id is null);

create policy "cb lecture équipe" on public.cb_compositions for select to authenticated using (team_id = (select public.my_team_id()));
create policy "cb ajout éditeur" on public.cb_compositions for insert to authenticated with check (team_id = (select public.my_cb_edit_team()));
create policy "cb modif éditeur" on public.cb_compositions for update to authenticated using (team_id = (select public.my_cb_edit_team())) with check (team_id = (select public.my_cb_edit_team()));
create policy "cb suppression éditeur" on public.cb_compositions for delete to authenticated using (team_id = (select public.my_cb_edit_team()));

create policy "cb lecture équipe" on public.cb_matches for select to authenticated using (team_id = (select public.my_team_id()));
create policy "cb ajout éditeur" on public.cb_matches for insert to authenticated with check (team_id = (select public.my_cb_edit_team()));
create policy "cb modif éditeur" on public.cb_matches for update to authenticated using (team_id = (select public.my_cb_edit_team())) with check (team_id = (select public.my_cb_edit_team()));
create policy "cb suppression éditeur" on public.cb_matches for delete to authenticated using (team_id = (select public.my_cb_edit_team()));

create policy "cb lecture équipe" on public.cb_match_maps for select to authenticated using (team_id = (select public.my_team_id()));
create policy "cb ajout éditeur" on public.cb_match_maps for insert to authenticated with check (team_id = (select public.my_cb_edit_team()));
create policy "cb modif éditeur" on public.cb_match_maps for update to authenticated using (team_id = (select public.my_cb_edit_team())) with check (team_id = (select public.my_cb_edit_team()));
create policy "cb suppression éditeur" on public.cb_match_maps for delete to authenticated using (team_id = (select public.my_cb_edit_team()));

-- Dispos : chacun coche les siennes, les éditeurs peuvent dépanner
create policy "cb lecture équipe" on public.cb_availability for select to authenticated using (team_id = (select public.my_team_id()));
create policy "cb ajout soi ou éditeur" on public.cb_availability for insert to authenticated with check (
  team_id = (select public.my_cb_edit_team())
  or (team_id = (select public.my_team_id())
      and exists (select 1 from public.cb_players p where p.id = player_id and p.user_id = (select auth.uid()))));
create policy "cb suppression soi ou éditeur" on public.cb_availability for delete to authenticated using (
  team_id = (select public.my_cb_edit_team())
  or exists (select 1 from public.cb_players p where p.id = player_id and p.user_id = (select auth.uid())));

create policy "cb réglages éditeur" on public.cb_settings for select to authenticated using (team_id = (select public.my_cb_edit_team()));
create policy "cb réglages ajout" on public.cb_settings for insert to authenticated with check (team_id = (select public.my_cb_edit_team()));
create policy "cb réglages modif" on public.cb_settings for update to authenticated using (team_id = (select public.my_cb_edit_team())) with check (team_id = (select public.my_cb_edit_team()));

-- ----- Effectif synchronisé avec l'équipe du réseau -----
create or replace function public.cb_sync_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.cb_players (team_id, user_id, pseudo)
    select new.team_id, new.user_id, left(coalesce(p.username, 'Joueur'), 32) from public.profiles p where p.id = new.user_id
    on conflict (team_id, user_id) do nothing;
  elsif tg_op = 'DELETE' then
    delete from public.cb_players where team_id = old.team_id and user_id = old.user_id;
  end if;
  return null;
end $$;
revoke execute on function public.cb_sync_member() from public, anon, authenticated;
drop trigger if exists cb_sync_member on public.team_members;
create trigger cb_sync_member after insert or delete on public.team_members
  for each row execute function public.cb_sync_member();

-- Les joueurs déjà dans une équipe ont leur fiche tout de suite
insert into public.cb_players (team_id, user_id, pseudo)
select m.team_id, m.user_id, left(coalesce(p.username, 'Joueur'), 32)
from public.team_members m join public.profiles p on p.id = m.user_id
on conflict (team_id, user_id) do nothing;

-- Le capitaine donne ou retire le droit de modifier le Comp Builder
create or replace function public.cb_set_editor(p_user uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare tid uuid := public.captain_check(p_user);
begin
  update public.team_members set cb_editor = coalesce(p_on, false) where team_id = tid and user_id = p_user;
end $$;
revoke execute on function public.cb_set_editor(uuid, boolean) from public, anon;
grant execute on function public.cb_set_editor(uuid, boolean) to authenticated;

-- Identifiants Discord des membres de mon équipe (sert à reprendre les anciennes données du Comp Builder)
create or replace function public.cb_member_discord_ids()
returns table (user_id uuid, discord_id text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, p.discord_id from public.team_members m join public.profiles p on p.id = m.user_id
  where m.team_id = public.my_cb_edit_team()
$$;
revoke execute on function public.cb_member_discord_ids() from public, anon;
grant execute on function public.cb_member_discord_ids() to authenticated;

-- ----- Signal « le Comp Builder de l'équipe X a bougé » (pour le tableau de bord du site) -----
create or replace function public.pulse_cb_row()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then perform public.pulse('cb:' || old.team_id);
  else perform public.pulse('cb:' || new.team_id); end if;
  return null;
end $$;
revoke execute on function public.pulse_cb_row() from public, anon, authenticated;
drop trigger if exists pulse_cb_comp on public.cb_compositions;
create trigger pulse_cb_comp after insert or delete or update of status, map_uuid on public.cb_compositions
  for each row execute function public.pulse_cb_row();
drop trigger if exists pulse_cb_match on public.cb_matches;
create trigger pulse_cb_match after insert or delete or update of match_date, match_time, type, opponent_name, format on public.cb_matches
  for each row execute function public.pulse_cb_row();
drop trigger if exists pulse_cb_dispo on public.cb_availability;
create trigger pulse_cb_dispo after insert or delete on public.cb_availability
  for each row execute function public.pulse_cb_row();

-- =====================================================================
-- 3. Tableau de bord de l'équipe : tout en un seul appel
-- =====================================================================
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
      'next', (select coalesce(json_agg(x order by x.match_date, x.match_time nulls last), '[]'::json) from (
                 select m.type, m.opponent_name, m.format, m.match_date, m.match_time from public.cb_matches m, me
                 where m.team_id = me.tid and m.match_date >= (now() at time zone 'Europe/Paris')::date
                 order by m.match_date, m.match_time nulls last limit 3) x),
      'dispo', (select coalesce(json_agg(x order by x.date), '[]'::json) from (
                 select d.date, count(distinct d.player_id)::int as players from public.cb_availability d, me
                 where d.team_id = me.tid and d.date between (now() at time zone 'Europe/Paris')::date
                       and (now() at time zone 'Europe/Paris')::date + 6
                 group by d.date) x),
      'my_dispo', (select count(*)::int from public.cb_availability d join public.cb_players p on p.id = d.player_id, me
                   where d.team_id = me.tid and p.user_id = auth.uid()
                     and d.date between (now() at time zone 'Europe/Paris')::date and (now() at time zone 'Europe/Paris')::date + 6),
      'editor', (select public.my_cb_edit_team() is not null)),
    'lfg', exists (select 1 from public.lfg_posts l, me where l.team_id = me.tid)
  ) end
$$;
revoke execute on function public.team_dashboard() from public, anon;
grant execute on function public.team_dashboard() to authenticated;

-- =====================================================================
-- 4. Temps réel : on écoute les signaux + les tables du Comp Builder
-- (équipes et membres passent désormais par les signaux)
-- =====================================================================
do $$ begin
  begin alter publication supabase_realtime drop table public.teams; exception when others then null; end;
  begin alter publication supabase_realtime drop table public.team_members; exception when others then null; end;
  begin alter publication supabase_realtime add table public.live_pulse; exception when others then null; end;
  begin alter publication supabase_realtime add table public.cb_players; exception when others then null; end;
  begin alter publication supabase_realtime add table public.cb_compositions; exception when others then null; end;
  begin alter publication supabase_realtime add table public.cb_matches; exception when others then null; end;
  begin alter publication supabase_realtime add table public.cb_match_maps; exception when others then null; end;
  begin alter publication supabase_realtime add table public.cb_availability; exception when others then null; end;
end $$;
