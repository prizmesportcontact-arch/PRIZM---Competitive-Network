-- PRIZM Competitive Network : comptes Discord, profils joueurs, équipes
-- Rangs : 0-2 Fer, 3-5 Bronze, 6-8 Argent, 9-11 Or, 12-14 Platine,
--         15-17 Diamant, 18-20 Ascendant, 21-23 Immortel, 24 Radiant

-- ===== Tables =====
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  discord_id  text,
  username    text not null default 'Joueur',
  avatar_url  text,
  riot_id     text check (riot_id is null or riot_id ~ '^[^#]{3,16}#[A-Za-z0-9]{3,5}$'),
  rank        smallint check (rank between 0 and 24),
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 3 and 24),
  tag         text not null unique check (tag ~ '^[A-Za-z0-9]{2,5}$'),
  captain_id  uuid not null references public.profiles on delete restrict,
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  status      text not null default 'en_attente' check (status in ('en_attente','validee','refusee')),
  division    smallint check (division between 1 and 4),
  created_at  timestamptz not null default now()
);

create table public.team_members (
  team_id   uuid not null references public.teams on delete cascade,
  user_id   uuid not null unique references public.profiles on delete cascade,
  role      text not null default 'titulaire' check (role in ('titulaire','remplacant')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_team_idx on public.team_members(team_id);
create index teams_captain_idx on public.teams(captain_id);

-- ===== Profil créé automatiquement à la première connexion Discord =====
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, discord_id, username, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'provider_id',
    coalesce(new.raw_user_meta_data->'custom_claims'->>'global_name',
             new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name', 'Joueur'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Met à jour pseudo et avatar Discord à chaque connexion
create or replace function public.handle_user_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set
    username = coalesce(new.raw_user_meta_data->'custom_claims'->>'global_name',
                        new.raw_user_meta_data->>'full_name', username),
    avatar_url = coalesce(new.raw_user_meta_data->>'avatar_url', avatar_url)
  where id = new.id;
  return new;
end $$;

create trigger on_auth_user_updated
  after update of raw_user_meta_data on auth.users
  for each row execute function public.handle_user_update();

-- ===== Sécurité =====
alter table public.profiles     enable row level security;
alter table public.teams        enable row level security;
alter table public.team_members enable row level security;

create policy "profils lisibles" on public.profiles for select to anon, authenticated using (true);
create policy "modifier son profil" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "équipes lisibles" on public.teams for select to anon, authenticated using (true);
create policy "membres lisibles" on public.team_members for select to anon, authenticated using (true);

-- Écritures directes interdites : tout passe par les fonctions ci-dessous
revoke insert, update, delete on public.profiles, public.teams, public.team_members from anon, authenticated;
grant update (riot_id, rank) on public.profiles to authenticated;
-- Le code d'invitation reste caché (lisible seulement via my_invite_code)
revoke select on public.teams from anon, authenticated;
grant select (id, name, tag, captain_id, status, division, created_at) on public.teams to anon, authenticated;
-- is_admin non modifiable par les joueurs (pas dans les colonnes autorisées)

-- ===== Fonctions utilitaires =====
create or replace function public.rank_division(r smallint)
returns smallint language sql immutable set search_path = '' as $$
  select case when r is null then null
              when r <= 8  then 4
              when r <= 14 then 3
              when r <= 20 then 2
              else 1 end::smallint
$$;

-- Division suggérée : moyenne des titulaires, +1 division si un joueur est 2 divisions au-dessus
create or replace function public.suggested_division(p_team uuid)
returns smallint language sql stable set search_path = '' as $$
  with t as (
    select p.rank from public.team_members m join public.profiles p on p.id = m.user_id
    where m.team_id = p_team and m.role = 'titulaire' and p.rank is not null
  ), a as (
    select public.rank_division(round(avg(rank))::smallint) as d,
           min(public.rank_division(rank)) as best from t
  )
  select case when d is null then null
              when best <= d - 2 then greatest(d - 1, 1)
              else d end::smallint from a
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.my_team_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select team_id from public.team_members where user_id = auth.uid()
$$;

-- ===== Actions joueurs =====
create or replace function public.create_team(p_name text, p_tag text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); tid uuid;
begin
  if uid is null then raise exception 'Connecte-toi avec Discord.'; end if;
  if exists (select 1 from public.profiles where id = uid and (riot_id is null or rank is null)) then
    raise exception 'Complète ton profil (Riot ID et rang) avant de créer une équipe.';
  end if;
  if exists (select 1 from public.team_members where user_id = uid) then
    raise exception 'Tu es déjà dans une équipe.';
  end if;
  insert into public.teams (name, tag, captain_id) values (trim(p_name), upper(trim(p_tag)), uid) returning id into tid;
  insert into public.team_members (team_id, user_id, role) values (tid, uid, 'titulaire');
  return tid;
exception when unique_violation then
  raise exception 'Ce nom ou ce tag est déjà pris.';
end $$;

create or replace function public.join_team(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); tid uuid; n int; tit int;
begin
  if uid is null then raise exception 'Connecte-toi avec Discord.'; end if;
  if exists (select 1 from public.profiles where id = uid and (riot_id is null or rank is null)) then
    raise exception 'Complète ton profil (Riot ID et rang) avant de rejoindre une équipe.';
  end if;
  if exists (select 1 from public.team_members where user_id = uid) then
    raise exception 'Tu es déjà dans une équipe. Quitte-la d''abord.';
  end if;
  select id into tid from public.teams where invite_code = upper(trim(p_code));
  if tid is null then raise exception 'Code d''invitation introuvable.'; end if;
  select count(*), count(*) filter (where role = 'titulaire') into n, tit from public.team_members where team_id = tid;
  if n >= 7 then raise exception 'Cette équipe est complète (7 joueurs max).'; end if;
  insert into public.team_members (team_id, user_id, role)
  values (tid, uid, case when tit < 5 then 'titulaire' else 'remplacant' end);
  return tid;
end $$;

create or replace function public.leave_team()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); tid uuid; cap uuid; n int;
begin
  select m.team_id, t.captain_id into tid, cap from public.team_members m join public.teams t on t.id = m.team_id where m.user_id = uid;
  if tid is null then raise exception 'Tu n''es dans aucune équipe.'; end if;
  select count(*) into n from public.team_members where team_id = tid;
  if cap = uid and n > 1 then raise exception 'Donne le rôle de capitaine à un coéquipier avant de partir.'; end if;
  if cap = uid then delete from public.teams where id = tid;
  else delete from public.team_members where user_id = uid; end if;
end $$;

create or replace function public.captain_check(p_user uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare tid uuid;
begin
  select t.id into tid from public.teams t join public.team_members m on m.team_id = t.id
  where t.captain_id = auth.uid() and m.user_id = p_user;
  if tid is null then raise exception 'Réservé au capitaine de l''équipe.'; end if;
  return tid;
end $$;

create or replace function public.kick_member(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare tid uuid := public.captain_check(p_user);
begin
  if p_user = auth.uid() then raise exception 'Tu ne peux pas te retirer toi-même.'; end if;
  delete from public.team_members where team_id = tid and user_id = p_user;
end $$;

create or replace function public.set_member_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare tid uuid := public.captain_check(p_user); tit int;
begin
  if p_role not in ('titulaire','remplacant') then raise exception 'Rôle inconnu.'; end if;
  if p_role = 'titulaire' then
    select count(*) into tit from public.team_members where team_id = tid and role = 'titulaire' and user_id <> p_user;
    if tit >= 5 then raise exception 'Il y a déjà 5 titulaires.'; end if;
  end if;
  update public.team_members set role = p_role where team_id = tid and user_id = p_user;
end $$;

create or replace function public.transfer_captain(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare tid uuid := public.captain_check(p_user);
begin
  update public.teams set captain_id = p_user where id = tid;
end $$;

create or replace function public.my_invite_code()
returns text language sql stable security definer set search_path = '' as $$
  select t.invite_code from public.teams t join public.team_members m on m.team_id = t.id where m.user_id = auth.uid()
$$;

create or replace function public.regenerate_invite()
returns text language plpgsql security definer set search_path = '' as $$
declare c text := upper(substr(md5(random()::text), 1, 6));
begin
  update public.teams set invite_code = c where captain_id = auth.uid();
  if not found then raise exception 'Réservé au capitaine de l''équipe.'; end if;
  return c;
end $$;

-- ===== Lecture publique des équipes =====
create or replace function public.list_teams()
returns table (id uuid, name text, tag text, status text, division smallint, suggested smallint, members int, captain text)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, t.tag, t.status, t.division, public.suggested_division(t.id),
         (select count(*)::int from public.team_members m where m.team_id = t.id),
         (select p.username from public.profiles p where p.id = t.captain_id)
  from public.teams t order by t.created_at
$$;

create or replace function public.team_roster(p_team uuid)
returns table (user_id uuid, username text, avatar_url text, riot_id text, rank smallint, role text, is_captain boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.avatar_url, p.riot_id, p.rank, m.role, t.captain_id = p.id
  from public.team_members m join public.profiles p on p.id = m.user_id join public.teams t on t.id = m.team_id
  where m.team_id = p_team order by (t.captain_id = p.id) desc, m.role desc, m.joined_at
$$;

-- ===== Admin =====
create or replace function public.admin_review_team(p_team uuid, p_status text, p_division smallint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Réservé au staff.'; end if;
  if p_status not in ('en_attente','validee','refusee') then raise exception 'Statut inconnu.'; end if;
  if p_status = 'validee' and p_division is null then raise exception 'Choisis une division.'; end if;
  update public.teams set status = p_status, division = case when p_status = 'validee' then p_division else division end where id = p_team;
end $$;

-- Droits d'exécution
revoke execute on all functions in schema public from anon, public;
grant execute on function public.list_teams(), public.team_roster(uuid), public.rank_division(smallint), public.suggested_division(uuid) to anon, authenticated;
grant execute on function public.create_team(text,text), public.join_team(text), public.leave_team(),
  public.kick_member(uuid), public.set_member_role(uuid,text), public.transfer_captain(uuid),
  public.my_invite_code(), public.regenerate_invite(), public.admin_review_team(uuid,text,smallint),
  public.is_admin(), public.my_team_id() to authenticated;
revoke execute on function public.handle_new_user(), public.handle_user_update(), public.captain_check(uuid) from authenticated;
