// PRIZM — sauvegarde hebdomadaire de la base.
// Appelée chaque lundi par la base (en-tête x-dm-secret). Exporte les tables utiles en JSON dans
// le bucket privé « backups » (backups/AAAA-MM-JJ.json) et garde les 12 dernières.
// Exclus : app_secrets (secrets), notify_queue et live_pulse (données jetables).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const TABLES = ["profiles", "teams", "team_members", "scrims", "lfg_posts", "cb_players", "cb_compositions",
  "cb_strats", "team_map_pools", "map_rotation", "cast_state"];
const KEEP = 12;

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: sec } = await db.from("app_secrets").select("value").eq("name", "dm").maybeSingle();
  if (!sec?.value || req.headers.get("x-dm-secret") !== sec.value) return json({ error: "Refusé." }, 401);

  const out: Record<string, unknown> = { created_at: new Date().toISOString(), tables: {} };
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(t).select("*").range(from, from + 999);
      if (error) return json({ error: `${t}: ${error.message}` }, 500);
      rows.push(...data);
      if (data.length < 1000) break;
    }
    (out.tables as Record<string, unknown>)[t] = rows;
    counts[t] = rows.length;
  }
  // Comptes (pour pouvoir recréer les liens profil ↔ compte Discord)
  const users: unknown[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return json({ error: `auth: ${error.message}` }, 500);
    users.push(...data.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at,
      identities: (u.identities ?? []).map((i) => ({ provider: i.provider, id: i.id })), meta: u.user_metadata })));
    if (data.users.length < 1000) break;
  }
  out.auth_users = users;
  counts.auth_users = users.length;

  const name = `${new Date().toISOString().slice(0, 10)}.json`;
  const body = new Blob([JSON.stringify(out)], { type: "application/json" });
  const up = await db.storage.from("backups").upload(name, body, { upsert: true, contentType: "application/json" });
  if (up.error) return json({ error: `upload: ${up.error.message}` }, 500);

  // Rotation : on garde les KEEP plus récentes
  const { data: list } = await db.storage.from("backups").list("", { limit: 200, sortBy: { column: "name", order: "desc" } });
  const old = (list ?? []).filter((f) => f.name.endsWith(".json")).slice(KEEP).map((f) => f.name);
  if (old.length) await db.storage.from("backups").remove(old);

  return json({ ok: true, file: name, bytes: body.size, counts, removed: old });
});
