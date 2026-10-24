-- Pool de maps compétitif (les maps du classé), mis à jour tout seul chaque jour
-- par la fonction map-rotation. Le map pool des équipes et les maps conseillées
-- n'utilisent que ces maps. Déjà appliqué sur « PRZM CN - Website ».

create table if not exists public.map_rotation (
  id         int primary key default 1 check (id = 1),
  maps       text[] not null,
  source     text not null default 'manuel',
  checked_at timestamptz not null default now(),
  changed_at timestamptz not null default now()
);
alter table public.map_rotation enable row level security;
drop policy if exists "rotation lisible" on public.map_rotation;
create policy "rotation lisible" on public.map_rotation for select to anon, authenticated using (true);
grant select on public.map_rotation to anon, authenticated;

-- Pool en vigueur depuis le 13 octobre 2026 (V26 Acte 6)
insert into public.map_rotation (id, maps, source)
values (1, array['Abyss', 'Bind', 'Corrode', 'Haven', 'Lotus', 'Summit', 'Sunset'], 'manuel')
on conflict (id) do nothing;

-- Le staff peut corriger à la main si besoin
create or replace function public.admin_set_rotation(p_maps text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux admins.'; end if;
  if coalesce(array_length(p_maps, 1), 0) not between 3 and 12 then raise exception 'Liste de maps invalide.'; end if;
  update public.map_rotation set maps = p_maps, source = 'manuel', changed_at = now(), checked_at = now() where id = 1;
  perform public.pulse('scrims');
end $$;
revoke all on function public.admin_set_rotation(text[]) from public, anon;
grant execute on function public.admin_set_rotation(text[]) to authenticated;

create or replace function public.map_rotation_check()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://cbbnrdfvaaikawszaysu.supabase.co/functions/v1/map-rotation',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-dm-secret', (select value from public.app_secrets where name = 'dm')),
    body := '{}'::jsonb);
end $$;
revoke all on function public.map_rotation_check() from public, anon, authenticated;

-- Tous les jours à 6 h 17 (UTC)
select cron.schedule('map-rotation', '17 6 * * *', $$select public.map_rotation_check();$$)
where not exists (select 1 from cron.job where jobname = 'map-rotation');
