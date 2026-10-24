// PRIZM — met à jour le pool de maps compétitif (les 7 maps du classé).
// Appelée une fois par jour par la base (en-tête x-dm-secret).
// L'API Valorant donne la liste de toutes les maps mais pas la rotation : on lit la rotation
// sur valorant-spind.de (« comp map pool (Abyss, Bind, …) ») ; le wiki Fandom n'est pas utilisé,
// il a souvent un acte de retard. Si la lecture échoue ou semble
// douteuse (moins de 6 ou plus de 8 maps reconnues), on garde la liste actuelle ; le staff peut
// aussi la corriger à la main (admin_set_rotation).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const UA = { "User-Agent": "PRIZM-Competitive-Network/1.0 (map rotation check)" };

async function knownMaps(): Promise<string[]> {
  const r = await fetch("https://valorant-api.com/v1/maps");
  const j = await r.json();
  const names = new Set<string>();
  for (const m of j.data ?? []) {
    if (!m.displayName || !m.tacticalDescription || /range|tutorial|npe/i.test(m.mapUrl ?? "")) continue;
    names.add(String(m.displayName).trim());
  }
  return [...names];
}

const found = (chunk: string, maps: string[]) =>
  maps.filter((n) => new RegExp(`(^|[^A-Za-z])${n}([^A-Za-z]|$)`, "i").test(chunk));

// Page « Current Valorant Map Pool » de valorant-spind.de
async function fromSpind(maps: string[]) {
  const r = await fetch("https://www.valorant-spind.de/en/valorant-maps.html", { headers: UA });
  if (!r.ok) return null;
  const html = (await r.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  // « … for ranked – also called the comp map pool (Abyss, Bind, Corrode, …) »
  const m = html.match(/comp(?:etitive)? map pool \(([^)]{10,200})\)/i);
  if (m) return found(m[1], maps);
  const i = html.search(/current (competitive )?map pool/i);
  if (i < 0) return null;
  const chunk = html.slice(i, i + 700);
  const j = chunk.search(/rotated out|removed|not in/i);
  return found(j > 0 ? chunk.slice(0, j) : chunk, maps);
}

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: sec } = await db.from("app_secrets").select("value").eq("name", "dm").maybeSingle();
  if (!sec?.value || req.headers.get("x-dm-secret") !== sec.value) return json({ error: "Refusé." }, 401);

  let maps: string[];
  try { maps = await knownMaps(); } catch (e) { return json({ ok: false, error: "valorant-api: " + String(e) }, 502); }

  const tries: Record<string, unknown> = {};
  let pool: string[] | null = null, source = "";
  for (const [name, fn] of [["spind", fromSpind]] as const) {
    try {
      const got = await fn(maps);
      tries[name] = got;
      if (got && got.length >= 6 && got.length <= 8) { pool = got.sort(); source = name; break; }
    } catch (e) { tries[name] = String(e); }
  }

  const { data: cur } = await db.from("map_rotation").select("maps").eq("id", 1).maybeSingle();
  if (!pool) {
    await db.from("map_rotation").update({ checked_at: new Date().toISOString() }).eq("id", 1);
    return json({ ok: false, kept: cur?.maps, tries });
  }
  const same = JSON.stringify([...(cur?.maps ?? [])].sort()) === JSON.stringify(pool);
  const patch: Record<string, unknown> = { checked_at: new Date().toISOString(), source };
  if (!same) { patch.maps = pool; patch.changed_at = new Date().toISOString(); }
  await db.from("map_rotation").update(patch).eq("id", 1);
  if (!same) await db.rpc("pulse", { p_topic: "scrims" });
  return json({ ok: true, changed: !same, pool, source, tries });
});
