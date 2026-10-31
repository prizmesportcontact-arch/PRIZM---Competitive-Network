// PRIZM — relaie sur Discord ce qui se passe sur le site (le bot poste ou met à jour un message).
// Corps : { type: "scrim" | "lfg" | "clip", id, quiet? }
//  - scrim : proposition postée dans #scrim-dX, puis message mis à jour (calé, retard, annulé, résultat) ;
//            les 2 capitaines sont pingés quand c'est calé (sauf quiet : simple mise à jour, ex. retard annoncé)
//  - lfg   : annonce de recherche postée (ou mise à jour) dans le salon de recherche
//  - clip  : clip posté dans le salon des clips
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const API = "https://discord.com/api/v10";
const COLOR: Record<number, number> = { 1: 0xc0392b, 2: 0x8e44ad, 3: 0x2471a3, 4: 0x1e8449 };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const ts = (iso: string, f = "F") => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${f}>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const token = Deno.env.get("DISCORD_BOT_TOKEN");
  const guild = Deno.env.get("DISCORD_GUILD_ID") ?? "1242083344838295573";
  if (!token) return json({ error: "Bot Discord pas configuré." }, 503);
  const site = (Deno.env.get("SITE_URL") ?? "https://prizmesportcontact-arch.github.io/PRIZM---Competitive-Network/").replace(/\/?$/, "/");

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return json({ error: "Connecte-toi avec Discord." }, 401);
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { type, id, quiet } = await req.json().catch(() => ({}));
  if (!id || !["scrim", "lfg", "clip"].includes(type)) return json({ error: "Requête invalide." }, 400);

  const bot = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
  const chRes = await fetch(`${API}/guilds/${guild}/channels`, { headers: bot });
  if (!chRes.ok) return json({ error: `Le bot ne voit pas le serveur (${chRes.status}).` }, 502);
  const channels = (await chRes.json()) as { id: string; name: string; type: number }[];
  const findCh = (...keys: string[]) => {
    for (const k of keys) { const c = channels.find((x) => (x.type === 0 || x.type === 5) && x.name.toLowerCase().includes(k)); if (c) return c.id; }
    return null;
  };
  const post = (ch: string, body: unknown) => fetch(`${API}/channels/${ch}/messages`, { method: "POST", headers: bot, body: JSON.stringify(body) });
  const edit = (ch: string, mid: string, body: unknown) => fetch(`${API}/channels/${ch}/messages/${mid}`, { method: "PATCH", headers: bot, body: JSON.stringify(body) });
  const team = async (tid: string | null) => {
    if (!tid) return null;
    const { data } = await db.from("teams").select("name, tag, logo_url, captain_id, profiles!teams_captain_id_fkey(discord_id)").eq("id", tid).maybeSingle();
    // deno-lint-ignore no-explicit-any
    return data as any;
  };

  // ---------- Scrims ----------
  if (type === "scrim") {
    const { data: s } = await db.from("scrims").select("*").eq("id", id).maybeSingle();
    if (!s) return json({ error: "Scrim introuvable." }, 404);
    const ch = findCh(`scrim-d${s.division}`, "scrim");
    if (!ch) return json({ error: "Salon de scrims introuvable." }, 404);
    const [h, g] = await Promise.all([team(s.host_id), team(s.guest_id)]);
    const link = `${site}#/scrims`;
    const details = `${s.format}${s.maps ? " · " + s.maps : ""}${s.ranked === false ? " · hors classement" : ""}`;
    let embed: Record<string, unknown>;
    if (s.status === "ouvert") {
      embed = { title: `🔎 ${h?.name ?? "?"} cherche un scrim`, url: link, color: COLOR[s.division],
        description: `${ts(s.starts_at)} · ${details}${s.note ? `\n« ${s.note} »` : ""}\n\n👉 [Accepter sur le site](${link}) (capitaines D${Math.max(1, s.division - 1)} à D${Math.min(4, s.division + 1)})`,
        ...(h?.logo_url ? { thumbnail: { url: h.logo_url } } : {}) };
    } else if (s.status === "cale") {
      const late = s.late_team ? `\n🕒 **${s.late_team === s.host_id ? h?.name : g?.name}** annonce environ ${s.late_minutes} min de retard.` : "";
      embed = { title: `✅ Scrim calé : ${h?.name} vs ${g?.name}`, url: link, color: 0x2ecc71, description: `${ts(s.starts_at)} · ${details}${late}` };
    } else if (s.status === "annule") {
      embed = { title: `❌ Scrim annulé : ${h?.name}${g ? " vs " + g.name : ""}`, color: 0x7f8c8d, description: `Prévu ${ts(s.starts_at)}` };
    } else {
      const res = s.no_show ? `Absence de ${s.no_show === s.host_id ? h?.name : g?.name}` : `${h?.tag} **${s.host_score}** – **${s.guest_score}** ${g?.tag}${s.confirmed ? "" : " (à confirmer)"}`;
      embed = { title: `🏁 ${h?.name} vs ${g?.name}`, url: `${site}#/classement`, color: 0x95a5a6, description: `${res}\n${ts(s.starts_at, "f")} · ${s.format}${s.ranked === false ? " · hors classement" : ""}` };
    }
    embed.footer = { text: "PRIZM Competitive Network · scrims" };
    let mid = s.discord_message_id as string | null;
    if (mid) {
      const r = await edit(ch, mid, { embeds: [embed] });
      if (!r.ok) mid = null;
    }
    if (!mid) {
      const r = await post(ch, { embeds: [embed] });
      if (r.ok) { mid = (await r.json()).id; await db.from("scrims").update({ discord_message_id: mid }).eq("id", s.id); }
    }
    // Calé : on pingue les deux capitaines (une modification de message ne notifie personne)
    if (s.status === "cale" && mid && !quiet) {
      const ids = [h?.profiles?.discord_id, g?.profiles?.discord_id].filter(Boolean) as string[];
      if (ids.length) await post(ch, { content: `${ids.map((x) => `<@${x}>`).join(" ")} votre scrim est calé ${ts(s.starts_at, "R")}. Échangez le code de partie ici ou en MP.`,
        message_reference: { message_id: mid, fail_if_not_exists: false }, allowed_mentions: { users: ids } });
    }
    return json({ ok: true });
  }

  // ---------- Recherche ----------
  if (type === "lfg") {
    const { data: l } = await db.from("lfg_posts").select("*").eq("id", id).maybeSingle();
    if (!l) return json({ error: "Annonce introuvable." }, 404);
    const ch = findCh("recherche", "recrutement", "lft", "lfg");
    if (!ch) return json({ error: "Salon de recherche introuvable." }, 404);
    const link = `${site}#/recherche`;
    let embed: Record<string, unknown>;
    if (l.kind === "joueur") {
      const { data: p } = await db.from("profiles").select("username, avatar_url, discord_id, riot_id, rank").eq("id", l.user_id).maybeSingle();
      const RANKS = ["Fer","Bronze","Argent","Or","Platine","Diamant","Ascendant","Immortel"];
      const rank = p?.rank == null ? "Non classé" : p.rank === 24 ? "Radiant" : `${RANKS[Math.floor(p.rank / 3)]} ${(p.rank % 3) + 1}`;
      embed = { title: `🙋 ${p?.username} cherche une équipe`, url: link, color: COLOR[l.division] ?? 0x6f8dff,
        description: `${p?.discord_id ? `<@${p.discord_id}>` : ""} · ${rank} · D${l.division}\n**Rôles :** ${l.roles.join(", ") || "—"}${l.dispo ? `\n**Dispo :** ${l.dispo}` : ""}${l.message ? `\n\n${l.message}` : ""}`,
        ...(p?.avatar_url ? { thumbnail: { url: p.avatar_url } } : {}) };
    } else {
      const t = await team(l.team_id);
      embed = { title: `📣 ${t?.name} recrute`, url: link, color: COLOR[l.division] ?? 0x6f8dff,
        description: `${t?.profiles?.discord_id ? `Contact : <@${t.profiles.discord_id}>` : ""} · D${l.division ?? "?"}\n**Cherche :** ${l.roles.join(", ") || "—"}${l.dispo ? `\n**Dispo :** ${l.dispo}` : ""}${l.message ? `\n\n${l.message}` : ""}`,
        ...(t?.logo_url ? { thumbnail: { url: t.logo_url } } : {}) };
    }
    embed.footer = { text: "PRIZM Competitive Network · recherche" };
    let mid = l.discord_message_id as string | null;
    if (mid) { const r = await edit(ch, mid, { embeds: [embed], allowed_mentions: { parse: [] } }); if (!r.ok) mid = null; }
    if (!mid) {
      const r = await post(ch, { embeds: [embed], allowed_mentions: { parse: [] } });
      if (r.ok) await db.from("lfg_posts").update({ discord_message_id: (await r.json()).id }).eq("id", l.id);
    }
    return json({ ok: true });
  }

  // ---------- Clips ----------
  const { data: c } = await db.from("clips").select("*").eq("id", id).maybeSingle();
  if (!c) return json({ error: "Clip introuvable." }, 404);
  if (c.discord_message_id) return json({ ok: true });
  const ch = findCh("clip");
  if (!ch) return json({ error: "Salon des clips introuvable." }, 404);
  const { data: p } = await db.from("profiles").select("username").eq("id", c.user_id).maybeSingle();
  // Le lien seul permet à Discord d'afficher la vidéo
  const r = await post(ch, { content: `🎬 **${c.title}** — par ${p?.username ?? "?"}\nVote sur le site : ${site}#/clips\n${c.url}`, allowed_mentions: { parse: [] } });
  if (r.ok) await db.from("clips").update({ discord_message_id: (await r.json()).id }).eq("id", c.id);
  return json({ ok: true });
});
