-- 027 — Saisons : le classement repart de zéro à chaque saison, les anciennes restent consultables.
create table if not exists public.seasons (
  id serial primary key,
  name text not null check (length(name) between 1 and 40),
  starts_at timestamptz not null default now(),
  ends_at timestamptz
);
create unique index if not exists seasons_one_current on public.seasons ((ends_at is null)) where ends_at is null;
insert into public.seasons (name, starts_at)
select 'Saison 0', coalesce((select min(starts_at) from public.scrims), now()) - interval '1 day'
where not exists (select 1 from public.seasons);

-- Classement figé de chaque saison terminée
create table if not exists public.season_standings (
  season_id int not null references public.seasons(id) on delete cascade,
  team_id uuid not null,
  pos int not null,
  name text, tag text, logo_url text, division smallint,
  played int, wins int, draws int, losses int, rf int, ra int, points int,
  no_shows int, late_cancels int, reliability int, mw int, ml int,
  primary key (season_id, team_id)
);

alter table public.seasons enable row level security;
alter table public.season_standings enable row level security;
drop policy if exists "saisons lisibles" on public.seasons;
create policy "saisons lisibles" on public.seasons for select to anon, authenticated using (true);
drop policy if exists "classements lisibles" on public.season_standings;
create policy "classements lisibles" on public.season_standings for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.seasons, public.season_standings from anon, authenticated;

-- Début de la saison en cours
create or replace function public.season_start()
returns timestamptz language sql stable security definer set search_path = '' as $$
  select coalesce((select starts_at from public.seasons where ends_at is null order by id desc limit 1), '-infinity'::timestamptz)
$$;
grant execute on function public.season_start() to anon, authenticated;

-- Le classement ne compte que les scrims de la saison en cours
create or replace function public.scrim_leaderboard()
returns table(team_id uuid, name text, tag text, logo_url text, division smallint, played integer, wins integer, draws integer, losses integer,
              rf integer, ra integer, points integer, no_shows integer, late_cancels integer, reliability integer, mw integer, ml integer)
language sql stable security definer set search_path = '' as $$
  with ok as (
    select s.*, public.scrim_maps_won(s, true) as hw, public.scrim_maps_won(s, false) as gw from public.scrims s
    where s.status = 'termine' and s.no_show is null and s.host_score is not null
      and s.starts_at >= public.season_start()
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
      (select count(*)::int from public.scrims s where s.no_show = t.id and s.starts_at >= public.season_start()) as ns,
      (select count(*)::int from public.scrims s where s.cancelled_by = t.id and s.cancel_late and s.starts_at >= public.season_start()) as lc
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

-- Staff : terminer la saison en cours (le classement est figé) et en ouvrir une nouvelle
create or replace function public.admin_end_season(p_new_name text)
returns int language plpgsql security definer set search_path = '' as $$
declare cur public.seasons; nid int;
begin
  if not public.is_admin() then raise exception 'Réservé aux admins.'; end if;
  if coalesce(btrim(p_new_name), '') = '' or length(btrim(p_new_name)) > 40 then raise exception 'Donne un nom à la nouvelle saison (40 caractères max).'; end if;
  select * into cur from public.seasons where ends_at is null order by id desc limit 1 for update;
  if found then
    insert into public.season_standings (season_id, team_id, pos, name, tag, logo_url, division, played, wins, draws, losses, rf, ra, points,
                                         no_shows, late_cancels, reliability, mw, ml)
    select cur.id, l.team_id,
           row_number() over (partition by l.division order by l.points desc, l.rf - l.ra desc, l.name)::int,
           l.name, l.tag, l.logo_url, l.division, l.played, l.wins, l.draws, l.losses, l.rf, l.ra, l.points,
           l.no_shows, l.late_cancels, l.reliability, l.mw, l.ml
    from public.scrim_leaderboard() l
    on conflict do nothing;
    update public.seasons set ends_at = now() where id = cur.id;
  end if;
  insert into public.seasons (name, starts_at) values (btrim(p_new_name), now()) returning id into nid;
  perform public.pulse('scrims');
  return nid;
end $$;
revoke all on function public.admin_end_season(text) from public, anon;
grant execute on function public.admin_end_season(text) to authenticated;

-- Renommer la saison en cours (ex. « Saison 1 — Hiver »)
create or replace function public.admin_rename_season(p_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux admins.'; end if;
  if coalesce(btrim(p_name), '') = '' or length(btrim(p_name)) > 40 then raise exception 'Nom invalide (40 caractères max).'; end if;
  update public.seasons set name = btrim(p_name) where ends_at is null;
  perform public.pulse('scrims');
end $$;
revoke all on function public.admin_rename_season(text) from public, anon;
grant execute on function public.admin_rename_season(text) to authenticated;
