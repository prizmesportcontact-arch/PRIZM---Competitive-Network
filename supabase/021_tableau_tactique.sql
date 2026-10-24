-- Tableau tactique du Comp Builder : strats dessinées sur la minimap, par équipe.
-- Déjà appliqué sur « PRZM CN - Website ».
--
-- steps : [{ "id": "...", "name": "Setup", "items": [ {t:"agent", a, x, y}, {t:"line", p:[...], c, ar}, ... ] }]
-- Coordonnées entières de 0 à 1000 (indépendantes de la taille de l'écran).

create table if not exists public.cb_strats (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams on delete cascade,
  map_uuid       text not null check (char_length(map_uuid) <= 64),
  composition_id uuid references public.cb_compositions on delete set null,
  name           text not null default 'Nouvelle strat' check (char_length(name) between 1 and 60),
  side           text not null default 'attaque' check (side in ('attaque', 'defense')),
  flipped        boolean not null default false,
  steps          jsonb not null default '[]'::jsonb
                 check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 12 and pg_column_size(steps) <= 120000),
  updated_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists cb_strats_team_idx on public.cb_strats (team_id);
create index if not exists cb_strats_comp_idx on public.cb_strats (composition_id);

alter table public.cb_strats enable row level security;
revoke all on public.cb_strats from anon;
grant select, insert, update, delete on public.cb_strats to authenticated;

drop policy if exists "cb lecture équipe" on public.cb_strats;
drop policy if exists "cb ajout éditeur" on public.cb_strats;
drop policy if exists "cb modif éditeur" on public.cb_strats;
drop policy if exists "cb suppression éditeur" on public.cb_strats;
create policy "cb lecture équipe" on public.cb_strats for select to authenticated using (team_id = (select public.my_team_id()));
create policy "cb ajout éditeur" on public.cb_strats for insert to authenticated with check (team_id = (select public.my_cb_edit_team()));
create policy "cb modif éditeur" on public.cb_strats for update to authenticated
  using (team_id = (select public.my_cb_edit_team())) with check (team_id = (select public.my_cb_edit_team()));
create policy "cb suppression éditeur" on public.cb_strats for delete to authenticated using (team_id = (select public.my_cb_edit_team()));

-- Auteur et date toujours posés par la base
create or replace function public.cb_strats_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists cb_strats_stamp on public.cb_strats;
create trigger cb_strats_stamp before insert or update on public.cb_strats
  for each row execute function public.cb_strats_stamp();

do $$ begin
  begin alter publication supabase_realtime add table public.cb_strats; exception when others then null; end;
end $$;
