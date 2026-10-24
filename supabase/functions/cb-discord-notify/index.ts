// PRIZM — Comp Builder : envoie un message (embed ou image) sur le webhook Discord de L'ÉQUIPE.
// Réservé au capitaine et aux éditeurs de cette équipe. L'URL du webhook est relue en base
// (jamais envoyée par le navigateur), sauf pour le bouton « Tester » des réglages.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const HOOK = /^https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  let body: {
    teamId?: string; payload?: Record<string, unknown>; testUrl?: string; wait?: boolean;
    imageBase64?: string; imageFilename?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "Corps de requête invalide." }, 400); }
  if (!body.teamId) return json({ error: "Équipe manquante." }, 400);

  // Qui appelle, et peut-il modifier le Comp Builder de cette équipe ?
  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: editTeam, error: rpcErr } = await asUser.rpc("my_cb_edit_team");
  if (rpcErr) return json({ error: "Connecte-toi avec Discord." }, 401);
  if (editTeam !== body.teamId) return json({ error: "Réservé au capitaine et aux éditeurs de l'équipe." }, 403);

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let hook = body.testUrl?.trim();
  if (!hook) {
    const { data } = await db.from("cb_settings").select("discord_webhook_url").eq("team_id", body.teamId).maybeSingle();
    hook = data?.discord_webhook_url ?? undefined;
  }
  if (!hook || !HOOK.test(hook)) return json({ error: "Aucun webhook Discord valide n'est configuré pour l'équipe." }, 400);

  const payload = { username: "PRIZM Comp Builder", ...(body.payload ?? {}) };
  const target = body.wait ? `${hook}?wait=true` : hook;

  try {
    let res: Response;
    if (body.imageBase64) {
      if (body.imageBase64.length > 8_000_000) return json({ error: "Image trop lourde." }, 413);
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(body.imageBase64), (c) => c.charCodeAt(0)); }
      catch { return json({ error: "Image invalide." }, 400); }
      const form = new FormData();
      form.append("payload_json", JSON.stringify(payload));
      form.append("files[0]", new Blob([bytes], { type: "image/png" }), (body.imageFilename || "carte.png").slice(0, 80));
      res = await fetch(target, { method: "POST", body: form });
    } else {
      res = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    let message: { id?: string; channel_id?: string } | null = null;
    if (body.wait && res.ok) {
      try { message = await res.json(); } catch { /* pas d'id, tant pis */ }
      // On note le message : le bot n'agira que sur les messages de l'équipe
      if (message?.id && message?.channel_id && !body.testUrl) {
        await db.from("cb_discord_messages").insert({ team_id: body.teamId, channel_id: message.channel_id, message_id: message.id });
      }
    }
    return json({ ok: res.ok, status: res.status, message });
  } catch (err) {
    return json({ error: `Discord injoignable : ${String(err)}` }, 502);
  }
});
