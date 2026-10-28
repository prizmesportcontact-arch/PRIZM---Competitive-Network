-- 029 — Le site se met à jour quand une fiche joueur du Comp Builder change
drop trigger if exists pulse_cb_players on public.cb_players;
create trigger pulse_cb_players after insert or update or delete on public.cb_players for each row execute function public.pulse_cb_row();
