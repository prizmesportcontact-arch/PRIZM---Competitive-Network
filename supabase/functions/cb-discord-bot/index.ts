// PRIZM — Comp Builder : le bot du réseau ajoute ✅/❌ sous un message de vote, puis compte les votes.
// Seulement sur les messages envoyés par le Comp Builder de l'équipe (table cb_discord_messages),
// et seulement pour le capitaine ou un éditeur. Le bot doit avoir accès au salon (serveur où il est invité).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const API = "https://discord.com/api/v10";
const YES = encodeURIComponent("✅"), NO = encodeURIComponent("❌");

async function putReaction(channel: string, message: string, emoji: string, headers: Record<string, string>) {
  const u = `${API}/channels/${channel}/messages/${message}/reactions/${emoji}/@me`;
  const res = await fetch(u, { method: "PUT", headers });
  if (res.status !== 429) return res;
  let wait = 600;
  try { const b = await res.clone().json(); if (typeof b?.retry_after === "number") wait = Math.ceil(b.retry_after * 1000) + 50; } catch { /* défaut */ }
  await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
  return fetch(u, { method: "PUT", headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  let body: { teamId?: string; action?: string; channelId?: string; messageId?: string };
  try { body = await req.json(); } catch { return json({ error: "Corps de requête invalide." }, 400); }
  const { teamId, action, channelId, messageId } = body;
  if (!teamId || !channelId || !messageId) return json({ error: "teamId, channelId et messageId sont requis." }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: editTeam, error: rpcErr } = await asUser.rpc("my_cb_edit_team");
  if (rpcErr) return json({ error: "Connecte-toi avec Discord." }, 401);
  if (editTeam !== teamId) return json({ error: "Réservé au capitaine et aux éditeurs de l'équipe." }, 403);

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: known } = await db.from("cb_discord_messages").select("channel_id")
    .eq("team_id", teamId).eq("message_id", messageId).maybeSingle();
  if (!known || known.channel_id !== channelId) return json({ error: "Ce message n'a pas été envoyé par le Comp Builder de ton équipe." }, 403);

  const token = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!token) return json({ error: "Le bot Discord du réseau n'est pas configuré." }, 503);
  const headers = { Authorization: `Bot ${token}` };

  if (action === "addReactions") {
    for (const [i, emoji] of [YES, NO].entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, 350));
      const res = await putReaction(channelId, messageId, emoji, headers);
      if (!res.ok) {
        const hint = res.status === 403 || res.status === 404
          ? " Invite le bot PRIZM sur ton serveur Discord et donne-lui accès à ce salon (voir les messages, ajouter des réactions)."
          : "";
        return json({ error: `Discord a refusé l'ajout de réaction (${res.status}).${hint}` }, 502);
      }
    }
    return json({ ok: true });
  }

  if (action === "getReactionCounts") {
    let botId: string | null = null;
    try { const me = await fetch(`${API}/users/@me`, { headers }); if (me.ok) botId = (await me.json())?.id ?? null; } catch { /* sans */ }
    const counts = { yes: 0, no: 0 };
    for (const [key, emoji] of [["yes", YES], ["no", NO]] as const) {
      const res = await fetch(`${API}/channels/${channelId}/messages/${messageId}/reactions/${emoji}?limit=100`, { headers });
      if (!res.ok) {
        if (res.status === 403 || res.status === 404) return json({ error: "Le bot PRIZM n'a pas accès à ce salon Discord." }, 502);
        continue;
      }
      const users = (await res.json()) as Array<{ id: string }>;
      counts[key] = users.filter((u) => u.id !== botId).length;
    }
    return json({ ok: true, counts });
  }

  return json({ error: "Action inconnue." }, 400);
});
