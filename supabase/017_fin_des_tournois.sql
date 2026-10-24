-- Plus de tournois, de ligues ni de clips : le réseau se concentre sur les scrims.
-- Déjà appliqué sur « PRZM CN - Website ».

-- Le verrou de roster ne servait que pendant une compétition : il ne bloque plus rien
create or replace function public.team_lock(p_team uuid)
returns text language sql stable security definer set search_path = '' as $$ select null::text $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname in (
      'admin_forfeit','my_matches','report_score','answer_report','cancel_report','advance_winner',
      'register_team','unregister_team','checkin_team','admin_set_tournament_status','admin_remove_team',
      'admin_create_bracket','admin_reset_bracket','admin_delete_tournament','unregister_league',
      'league_standings','register_league','admin_set_league_status','admin_remove_league_team',
      'admin_generate_schedule','admin_reset_schedule','admin_report_league_score','admin_delete_league',
      'admin_create_playoffs','cast_matches','league_detail','tournament_detail','list_tournaments',
      'list_leagues','admin_fill_test_teams','admin_delete_test_data','admin_test_summary',
      'admin_save_tournament','admin_save_league','apply_league_score','apply_cup_score','match_info',
      'admin_list_reports','list_clips','submit_clip','vote_clip','delete_clip','current_week')
  loop
    execute 'drop function if exists ' || f.sig || ' cascade';
  end loop;
end $$;

do $$ begin
  begin alter publication supabase_realtime drop table public.score_reports; exception when others then null; end;
end $$;

drop table if exists public.clip_votes, public.clips, public.score_reports,
  public.league_matches, public.league_teams, public.matches, public.tournament_teams,
  public.leagues, public.tournaments cascade;

drop policy if exists "capture de score" on storage.objects;
