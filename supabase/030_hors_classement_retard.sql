-- 030 — Scrims hors classement pour les équipes pas encore validées, et « on a du retard »

-- 1) Un scrim est « classé » seulement si les deux équipes sont validées au moment où il est calé
alter table public.scrims add column if not exists ranked boolean not null default true;
-- 2) Retard annoncé par une équipe (minutes), avant ou juste après l'heure prévue
alter table public.scrims add column if not exists late_team uuid references public.teams(id) on delete set null;
alter table public.scrims add column if not exists late_minutes smallint;
alter table public.scrims add column if not exists late_at timestamptz;

-- Proposer un scrim : une équipe en attente de validation peut le faire, hors classement,
-- dans sa division estimée (calculée sur les rangs de ses titulaires)
create or replace function public.post_scrim(p_starts_at timestamptz, p_format text, p_maps text, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.teams; n int; sid uuid; ok boolean; d smallint;
begin
  t := public.my_captain_team();
  if t.id is null then raise exception 'Seul le capitaine d''une équipe peut proposer un scrim.'; end if;
  if t.status = 'refusee' then raise exception 'Ton équipe a été refusée : contacte le staff dans #support.'; end if;
  ok := t.status = 'validee' and t.division is not null;
  d := coalesce(case when ok then t.division end, public.suggested_division(t.id), 4);
  if p_starts_at is null or p_starts_at < now() + interval '15 minutes' then raise exception 'Choisis une heure dans au moins 15 minutes.'; end if;
  if p_starts_at > now() + interval '14 days' then raise exception 'Pas plus de 14 jours à l''avance.'; end if;
  select count(*) into n from public.scrims where host_id = t.id and status = 'ouvert' and starts_at > now();
  if n >= 5 then raise exception 'Tu as déjà 5 propositions ouvertes.'; end if;
  insert into public.scrims (host_id, division, starts_at, format, maps, note, ranked)
  values (t.id, d, p_starts_at, p_format, nullif(trim(p_maps), ''), nullif(trim(p_note), ''), ok)
  returning id into sid;
  return sid;
end $$;

-- Accepter : idem, et le scrim devient hors classement si l'une des deux équipes n'est pas validée
create or replace function public.accept_scrim(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.teams; s public.scrims; ok boolean; d smallint;
begin
  t := public.my_captain_team();
  if t.id is null then raise exception 'Seul le capitaine d''une équipe peut accepter un scrim.'; end if;
  if t.status = 'refusee' then raise exception 'Ton équipe a été refusée : contacte le staff dans #support.'; end if;
  ok := t.status = 'validee' and t.division is not null;
  select * into s from public.scrims where id = p_id for update;
  if not found or s.status <> 'ouvert' or s.starts_at <= now() then raise exception 'Ce scrim n''est plus disponible.'; end if;
  if s.host_id = t.id then raise exception 'C''est ta propre proposition.'; end if;
  d := coalesce(case when ok then t.division end, public.suggested_division(t.id), s.division);
  if abs(s.division - d) > 1 then raise exception 'Ce scrim est trop loin de ta division (D%).', d; end if;
  update public.scrims set guest_id = t.id, status = 'cale', accepted_at = now(), ranked = s.ranked and ok where id = s.id;
end $$;

-- Annoncer un retard : capitaine d'une des deux équipes, de 2 h avant à 30 min après l'heure prévue.
-- Le capitaine adverse est prévenu en message privé Discord, et le délai avant de déclarer
-- une absence est allongé d'autant.
create or replace function public.scrim_late(p_id uuid, p_minutes int)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.teams; s public.scrims; other uuid;
begin
  t := public.my_captain_team();
  select * into s from public.scrims where id = p_id for update;
  if not found or t.id is null or s.guest_id is null or t.id not in (s.host_id, s.guest_id) then raise exception 'Réservé aux capitaines du scrim.'; end if;
  if s.status <> 'cale' then raise exception 'Ce scrim n''est plus en cours.'; end if;
  if p_minutes is null or p_minutes not in (5, 10, 15, 20, 30) then raise exception 'Choisis 5, 10, 15, 20 ou 30 minutes.'; end if;
  if now() < s.starts_at - interval '2 hours' then raise exception 'Tu pourras prévenir d''un retard 2 h avant le scrim.'; end if;
  if now() > s.starts_at + interval '30 minutes' then raise exception 'Trop tard pour annoncer un retard.'; end if;
  update public.scrims set late_team = t.id, late_minutes = p_minutes, late_at = now() where id = s.id;
  other := case when t.id = s.host_id then s.guest_id else s.host_id end;
  insert into public.notify_queue (user_id, kind, scrim_id)
  select public.captain_of(other), 'late', s.id where public.captain_of(other) is not null;
end $$;
revoke all on function public.scrim_late(uuid, int) from public, anon;
grant execute on function public.scrim_late(uuid, int) to authenticated;

-- Absence : on attend 15 min après l'heure, plus le retard annoncé par l'équipe en question
create or replace function public.report_no_show(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.teams; s public.scrims; other uuid; wait interval;
begin
  t := public.my_captain_team();
  select * into s from public.scrims where id = p_id for update;
  if not found or t.id is null or t.id not in (s.host_id, coalesce(s.guest_id, s.host_id)) or s.guest_id is null then raise exception 'Réservé aux capitaines du scrim.'; end if;
  if s.status <> 'cale' then raise exception 'Ce scrim est déjà terminé.'; end if;
  other := case when t.id = s.host_id then s.guest_id else s.host_id end;
  wait := interval '15 minutes' + case when s.late_team = other then make_interval(mins => s.late_minutes) else interval '0' end;
  if now() < s.starts_at + wait then
    raise exception 'Attends % minutes après l''heure prévue.', extract(epoch from wait)::int / 60;
  end if;
  update public.scrims set status = 'termine', no_show = other,
    reported_by = t.id, reported_at = now(), confirmed = true where id = s.id;
end $$;

-- Le site affiche « Hors classement » et le retard annoncé
create or replace function public.scrim_json(s public.scrims)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'division', s.division, 'starts_at', s.starts_at, 'format', s.format, 'maps', s.maps, 'note', s.note,
    'status', s.status, 'host_score', s.host_score, 'guest_score', s.guest_score, 'map_scores', s.map_scores,
    'reported_by', s.reported_by, 'confirmed', s.confirmed,
    'no_show', s.no_show, 'cancelled_by', s.cancelled_by, 'cancel_late', s.cancel_late,
    'ranked', s.ranked, 'late_team', s.late_team, 'late_minutes', s.late_minutes,
    'host', (select jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'logo_url', t.logo_url, 'division', t.division, 'status', t.status,
               'captain', c.username, 'discord_id', c.discord_id) from public.teams t left join public.profiles c on c.id = t.captain_id where t.id = s.host_id),
    'guest', (select jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'logo_url', t.logo_url, 'division', t.division, 'status', t.status,
               'captain', c.username, 'discord_id', c.discord_id) from public.teams t left join public.profiles c on c.id = t.captain_id where t.id = s.guest_id))
$$;

-- Classement : seulement les scrims classés (les pénalités aussi)
create or replace function public.scrim_leaderboard()
returns table(team_id uuid, name text, tag text, logo_url text, division smallint, played integer, wins integer, draws integer, losses integer,
              rf integer, ra integer, points integer, no_shows integer, late_cancels integer, reliability integer, mw integer, ml integer)
language sql stable security definer set search_path = '' as $$
  with ok as (
    select s.*, public.scrim_maps_won(s, true) as hw, public.scrim_maps_won(s, false) as gw from public.scrims s
    where s.status = 'termine' and s.no_show is null and s.host_score is not null and s.ranked
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
      (select count(*)::int from public.scrims s where s.no_show = t.id and s.ranked and s.starts_at >= public.season_start()) as ns,
      (select count(*)::int from public.scrims s where s.cancelled_by = t.id and s.cancel_late and s.ranked and s.starts_at >= public.season_start()) as lc
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

-- Nouveau type de message privé Discord : retard annoncé
alter table public.notify_queue drop constraint if exists notify_queue_kind_check;
alter table public.notify_queue add constraint notify_queue_kind_check check (kind in ('accepted', 'reminder', 'confirm', 'no_show', 'late'));
