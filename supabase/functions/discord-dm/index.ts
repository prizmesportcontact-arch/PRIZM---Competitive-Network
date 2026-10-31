// PRIZM — envoie en message privé Discord les notifications de la file notify_queue :
// scrim accepté, rappel 30 min avant, retard annoncé, score à confirmer, absence déclarée.
// Appelée uniquement par la base (en-tête x-dm-secret = secret rangé dans app_secrets).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const API = "https://discord.com/api/v10";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const ts = (iso: string, f = "F") => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${f}>`;

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: sec } = await db.from("app_secrets").select("value").eq("name", "dm").maybeSingle();
  if (!sec?.value || req.headers.get("x-dm-secret") !== sec.value) return json({ error: "Refusé." }, 401);

  const token = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!token) return json({ error: "Bot Discord pas configuré." }, 503);
  const bot = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
  const site = (Deno.env.get("SITE_URL") ?? "https://prizmesportcontact-arch.github.io/PRIZM---Competitive-Network/").replace(/\/?$/, "/");

  const { data: jobs } = await db.from("notify_queue").select("*")
    .is("sent_at", null).lt("attempts", 3).gt("created_at", new Date(Date.now() - 86400000).toISOString())
    .order("created_at").limit(25);
  if (!jobs?.length) return json({ ok: true, sent: 0 });

  // Une seule lecture des scrims et profils concernés
  const scrimIds = [...new Set(jobs.map((j) => j.scrim_id).filter(Boolean))];
  const userIds = [...new Set(jobs.map((j) => j.user_id))];
  const [{ data: scrims }, { data: users }] = await Promise.all([
    db.from("scrims").select("id, starts_at, format, maps, host_id, guest_id, host_score, guest_score, reported_by, no_show, status, late_minutes").in("id", scrimIds),
    db.from("profiles").select("id, discord_id").in("id", userIds),
  ]);
  const teamIds = [...new Set((scrims ?? []).flatMap((s) => [s.host_id, s.guest_id]).filter(Boolean))];
  const { data: teams } = await db.from("teams").select("id, name, tag, captain_id").in("id", teamIds);
  const S = new Map((scrims ?? []).map((s) => [s.id, s]));
  const U = new Map((users ?? []).map((u) => [u.id, u.discord_id]));
  const T = new Map((teams ?? []).map((t) => [t.id, t]));

  let sent = 0;
  for (const j of jobs) {
    const s = S.get(j.scrim_id);
    const discordId = U.get(j.user_id);
    const fail = async (error: string, final = false) =>
      db.from("notify_queue").update({ attempts: final ? 3 : j.attempts + 1, error }).eq("id", j.id);
    if (!s || !discordId) { await fail("scrim ou compte Discord introuvable", true); continue; }

    // Équipe du destinataire et adversaire
    const mine = T.get(s.host_id)?.captain_id === j.user_id ? s.host_id : s.guest_id;
    const opp = T.get(mine === s.host_id ? s.guest_id : s.host_id);
    const oppName = opp?.name ?? "l'adversaire";
    const details = `${ts(s.starts_at)} · ${s.format}${s.maps ? " · " + s.maps : ""}`;
    let embed: Record<string, unknown>;
    if (j.kind === "accepted") {
      embed = { title: "✅ Scrim calé", color: 0x4ade80, description: `**${oppName}** a accepté ton scrim.\n${details}\n\nÉchangez le code de partie sur Discord.` };
    } else if (j.kind === "reminder") {
      if (s.status !== "cale") { await fail("scrim plus calé", true); continue; }
      embed = { title: "⏰ Scrim bientôt", color: 0xffa043, description: `Ton scrim contre **${oppName}** commence ${ts(s.starts_at, "R")}.\n${details}` };
    } else if (j.kind === "confirm") {
      const us = mine === s.host_id ? s.host_score : s.guest_score, them = mine === s.host_id ? s.guest_score : s.host_score;
      embed = { title: "📝 Score à confirmer", color: 0xf2d45c,
        description: `**${oppName}** a envoyé le score : **${us} – ${them}** pour ton équipe.\nConfirme ou conteste sur le site. Sans réponse sous 48 h, il est validé.` };
    } else if (j.kind === "late") {
      if (s.status !== "cale") { await fail("scrim plus calé", true); continue; }
      embed = { title: "🕒 Retard annoncé", color: 0xffa043,
        description: `**${oppName}** prévient : environ **${s.late_minutes} min** de retard pour le scrim de ${ts(s.starts_at, "t")}.\nPas besoin de déclarer une absence : le délai est allongé d'autant.` };
    } else {
      embed = { title: "⚠️ Absence déclarée", color: 0xff6170,
        description: `**${oppName}** a déclaré ton équipe absente au scrim du ${ts(s.starts_at, "f")}.\nUne erreur ? Ouvre un ticket dans #support.` };
    }
    embed.url = `${site}#/scrims`;
    embed.footer = { text: "PRIZM Competitive Network" };

    const ch = await fetch(`${API}/users/@me/channels`, { method: "POST", headers: bot, body: JSON.stringify({ recipient_id: discordId }) });
    if (!ch.ok) { await fail(`ouverture MP ${ch.status}`); continue; }
    const { id: channelId } = await ch.json();
    const msg = await fetch(`${API}/channels/${channelId}/messages`, { method: "POST", headers: bot,
      body: JSON.stringify({ embeds: [embed], components: [{ type: 1, components: [{ type: 2, style: 5, label: "Ouvrir les scrims", url: `${site}#/scrims` }] }] }) });
    if (msg.ok) { await db.from("notify_queue").update({ sent_at: new Date().toISOString(), attempts: j.attempts + 1, error: null }).eq("id", j.id); sent++; }
    else if (msg.status === 403) await fail("MP fermés par le joueur", true); // Discord 50007 : le joueur bloque les MP
    else await fail(`envoi ${msg.status}`);
  }
  return json({ ok: true, sent });
});
