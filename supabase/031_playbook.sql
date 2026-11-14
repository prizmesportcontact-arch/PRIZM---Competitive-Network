-- Playbook du Comp Builder : pages de texte mis en forme (façon Word) par équipe,
-- rangées par map (map_uuid) ou « Général » (map_uuid null).
--
-- content : document Tiptap (JSON). Les strats et compos insérées ne sont que des
-- références (identifiants) : le texte reste léger.
-- Mêmes droits que les strats : toute l'équipe lit, le capitaine et les éditeurs écrivent.

create table if not exists public.cb_docs (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams on delete cascade,
  map_uuid    text check (map_uuid is null or char_length(map_uuid) <= 64),
  title       text not null default 'Nouvelle page' check (char_length(title) between 1 and 80),
  content     jsonb not null default '{"type":"doc","content":[]}'::jsonb
              check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 200000),
  updated_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists cb_docs_team_idx on public.cb_docs (team_id);

alter table public.cb_docs enable row level security;
revoke all on public.cb_docs from anon;
grant select, insert, update, delete on public.cb_docs to authenticated;

drop policy if exists "cb lecture équipe" on public.cb_docs;
drop policy if exists "cb ajout éditeur" on public.cb_docs;
drop policy if exists "cb modif éditeur" on public.cb_docs;
drop policy if exists "cb suppression éditeur" on public.cb_docs;
create policy "cb lecture équipe" on public.cb_docs for select to authenticated using (team_id = (select public.my_team_id()));
create policy "cb ajout éditeur" on public.cb_docs for insert to authenticated with check (team_id = (select public.my_cb_edit_team()));
create policy "cb modif éditeur" on public.cb_docs for update to authenticated
  using (team_id = (select public.my_cb_edit_team())) with check (team_id = (select public.my_cb_edit_team()));
create policy "cb suppression éditeur" on public.cb_docs for delete to authenticated using (team_id = (select public.my_cb_edit_team()));

-- 100 pages maximum par équipe (garde la base gratuite sous contrôle)
create or replace function public.cb_docs_limit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.cb_docs where team_id = new.team_id) >= 100 then
    raise exception 'Limite de 100 pages de playbook atteinte pour cette équipe.';
  end if;
  return new;
end $$;
drop trigger if exists cb_docs_limit on public.cb_docs;
create trigger cb_docs_limit before insert on public.cb_docs
  for each row execute function public.cb_docs_limit();

-- Auteur et date toujours posés par la base (même fonction que les strats)
drop trigger if exists cb_docs_stamp on public.cb_docs;
create trigger cb_docs_stamp before insert or update on public.cb_docs
  for each row execute function public.cb_strats_stamp();

do $$ begin
  begin alter publication supabase_realtime add table public.cb_docs; exception when others then null; end;
end $$;
