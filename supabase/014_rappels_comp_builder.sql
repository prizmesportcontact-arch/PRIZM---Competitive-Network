-- Rappels Discord automatiques des matchs du Comp Builder (une heure avant, ou le jour même sans heure)
-- Chaque équipe reçoit ses rappels sur son propre webhook (réglé dans le Comp Builder).
-- Déjà appliqué sur le projet « PRZM CN - Website ».

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Le Comp Builder : on ne laisse pas modifier à qui appartient une fiche joueur
revoke update on public.cb_players from authenticated;
grant update (pseudo, primary_role, secondary_role, color) on public.cb_players to authenticated;

create or replace function public.cb_send_reminders()
returns void language plpgsql security definer set search_path = '' as $$
declare
  m record; label text; title text; when_text text;
  today date := (now() at time zone 'Europe/Paris')::date;
begin
  for m in
    select x.id, x.type, x.opponent_name, x.match_date, x.match_time, s.discord_webhook_url as hook
    from public.cb_matches x join public.cb_settings s on s.team_id = x.team_id
    where x.reminder_sent_at is null and x.match_date between today and today + 1
      and coalesce(s.discord_webhook_url, '') <> ''
      and not exists (select 1 from public.cb_match_maps mm
                      where mm.match_id = x.id and mm.our_score is not null and mm.opponent_score is not null)
      and ((x.match_time is not null
              and ((x.match_date + x.match_time) at time zone 'Europe/Paris') - now() <= interval '1 hour'
              and ((x.match_date + x.match_time) at time zone 'Europe/Paris') > now())
        or (x.match_time is null and x.match_date = today))
  loop
    label := case when m.type = 'scrim' then 'Scrim' else 'Match' end;
    title := label || case when coalesce(m.opponent_name, '') <> '' then ' contre ' || m.opponent_name else '' end;
    when_text := to_char(m.match_date, 'DD/MM/YYYY') || case when m.match_time is not null then ' à ' || to_char(m.match_time, 'HH24:MI') else '' end;
    perform net.http_post(
      url := m.hook,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('username', 'PRIZM Comp Builder',
        'embeds', jsonb_build_array(jsonb_build_object(
          'title', '⏰ Rappel : ' || title,
          'description', 'C''est bientôt l''heure : ' || when_text || '.',
          'color', 16731733))));
    update public.cb_matches set reminder_sent_at = now() where id = m.id;
  end loop;
end $$;
revoke execute on function public.cb_send_reminders() from public, anon, authenticated;

-- Reprogrammer un match relance le rappel
create or replace function public.cb_reset_reminder()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.match_date is distinct from old.match_date or new.match_time is distinct from old.match_time then
    new.reminder_sent_at := null;
  end if;
  return new;
end $$;
revoke execute on function public.cb_reset_reminder() from public, anon, authenticated;
drop trigger if exists cb_reset_reminder on public.cb_matches;
create trigger cb_reset_reminder before update on public.cb_matches
  for each row execute function public.cb_reset_reminder();

select cron.schedule('cb-match-reminders', '*/10 * * * *', $$select public.cb_send_reminders();$$)
where not exists (select 1 from cron.job where jobname = 'cb-match-reminders');

-- (015) Messages Discord envoyés par le Comp Builder d'une équipe : le bot ne réagit / ne compte
-- que sur ces messages-là (impossible de le faire agir ailleurs)
create table if not exists public.cb_discord_messages (
  team_id    uuid not null references public.teams on delete cascade,
  channel_id text not null,
  message_id text not null,
  created_at timestamptz not null default now(),
  primary key (team_id, message_id)
);
alter table public.cb_discord_messages enable row level security;
revoke all on public.cb_discord_messages from anon, authenticated;
