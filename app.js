/* PRIZM Competitive Network — connexion Discord, profils, équipes, admin */
(() => {
  const CFG = window.PRIZM_CONFIG || {};
  const RANKS = ["Fer 1","Fer 2","Fer 3","Bronze 1","Bronze 2","Bronze 3","Argent 1","Argent 2","Argent 3",
    "Or 1","Or 2","Or 3","Platine 1","Platine 2","Platine 3","Diamant 1","Diamant 2","Diamant 3",
    "Ascendant 1","Ascendant 2","Ascendant 3","Immortel 1","Immortel 2","Immortel 3","Radiant"];
  const DIV_NAMES = {1:"D1 · Élite",2:"D2 · Haute",3:"D3 · Inter",4:"D4 · Open"};
  const rankDiv = r => r == null ? null : r <= 8 ? 4 : r <= 14 ? 3 : r <= 20 ? 2 : 1;

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  // ---------- Liens Discord / Twitch / YouTube ----------
  document.querySelectorAll("[data-link]").forEach(a => {
    const url = (CFG.links || {})[a.dataset.link];
    if (url) { a.href = url; a.target = "_blank"; a.rel = "noopener"; }
    else { a.setAttribute("aria-disabled", "true"); a.title = "Lien disponible bientôt"; }
  });

  // ---------- Accueil : aperçu Cup / League ----------
  document.querySelectorAll("[data-prev]").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("[data-prev]").forEach(x => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-selected", String(on)); });
    document.querySelectorAll("[data-pane]").forEach(p => { p.hidden = p.dataset.pane !== b.dataset.prev; });
  }));

  // ---------- Copier le modèle de scrim ----------
  const copyBtn = $("#copy-tpl");
  if (copyBtn) copyBtn.addEventListener("click", () => copyText($("#tpl").textContent, $("#copied"), $("#tpl")));

  function copyText(text, out, selectEl) {
    const fallback = () => {
      if (selectEl) { const r = document.createRange(); r.selectNodeContents(selectEl); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      if (out) out.textContent = "Sélectionné, fais Ctrl+C.";
    };
    try { navigator.clipboard.writeText(text).then(() => { if (out) out.textContent = "Copié."; }, fallback); }
    catch (e) { fallback(); }
  }

  // ---------- Toasts ----------
  function toast(msg, kind = "ok", ms = 4200) {
    const t = document.createElement("div");
    t.className = "toast " + kind; t.textContent = msg; t.setAttribute("role", "status");
    $("#toasts").appendChild(t);
    setTimeout(() => t.remove(), ms);
  }
  const errMsg = e => (e && (e.message || e.error_description)) || "Une erreur est survenue. Réessaie.";

  // ---------- Supabase ----------
  let sb = null;
  if (window.supabase && CFG.supabaseUrl && CFG.supabaseKey) {
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } });
  }
  const state = { session: null, profile: null, team: null, isAdmin: false, isStaff: false };

  // Profil + équipe du joueur connecté, en une seule requête (gardés en mémoire entre les pages)
  async function loadMe() {
    if (!sb || !state.session) { clearMe(); return; }
    const { data, error } = await sb.rpc("my_context");
    if (error) { if (isSetupError(error)) showSetupBanner(); return; }
    const p = data && data.profile;
    state.profile = p || null; state.team = (data && data.team) || null;
    state.isAdmin = !!(p && p.is_admin);
    state.isStaff = state.isAdmin || !!(p && ["admin", "arbitre"].includes(p.staff_role));
    updateTeamCtas();
  }
  function clearMe() {
    state.profile = null; state.team = null; state.isAdmin = false; state.isStaff = false;
    updateTeamCtas();
  }
  // Boutons « Inscrire mon équipe » → « Mon équipe » quand le joueur a déjà une équipe
  const teamCtaLabel = () => state.team ? "Mon équipe" : "Inscrire mon équipe";
  function updateTeamCtas() {
    document.querySelectorAll("[data-team-cta]").forEach(a => { a.textContent = teamCtaLabel(); });
  }

  function isSetupError(e) {
    return e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || /does not exist|Could not find/i.test(e.message || ""));
  }
  function showSetupBanner() {
    const b = $("#setup-banner"); if (b) b.hidden = false;
  }

  async function login() {
    if (!sb) return toast("Le site n'est pas encore relié à la base de données.", "err");
    const redirectTo = location.origin + location.pathname;
    const back = location.hash && location.hash.startsWith("#/") ? location.hash : "#/mon-equipe";
    try { sessionStorage.setItem("prizm_after_login", back); } catch (e) {}
    const { error } = await sb.auth.signInWithOAuth({ provider: "discord", options: { redirectTo } });
    if (error) toast(errMsg(error), "err");
  }
  async function logout() {
    await sb.auth.signOut(); state.session = null; clearMe();
    renderAuth(); location.hash = "#top"; route();
  }

  // ---------- Barre de connexion ----------
  function avatar(url, name, size = 32) {
    return url ? `<img class="av" src="${esc(url)}" alt="" width="${size}" height="${size}" referrerpolicy="no-referrer">`
               : `<span class="av av-fallback" style="width:${size}px;height:${size}px">${esc((name || "?").slice(0,1).toUpperCase())}</span>`;
  }
  function renderAuth() {
    const slot = $("#auth-slot");
    if (!state.session) {
      slot.innerHTML = `<button class="btn sm solid" id="login-btn" type="button">${discordIcon()} Connexion</button>`;
      $("#login-btn").onclick = login;
      return;
    }
    const p = state.profile || {};
    slot.innerHTML = `
      <div class="me">
        <button class="me-btn" id="me-btn" type="button" aria-expanded="false" aria-haspopup="true">${avatar(p.avatar_url, p.username, 30)}<span class="me-name">${esc(p.username || "Mon compte")}</span></button>
        <div class="me-menu" id="me-menu" hidden>
          <a href="#/profil">Mon profil</a>
          <a href="#/mon-equipe">Mon équipe</a>
          ${state.isAdmin ? '<a href="#/admin">Admin</a>' : state.isStaff ? '<a href="#/tournois">Gérer les compétitions</a>' : ""}
          ${state.isStaff ? '<a href="#/regie">Régie de cast</a>' : ""}
          <button type="button" id="logout-btn">Déconnexion</button>
        </div>
      </div>`;
    const btn = $("#me-btn"), menu = $("#me-menu");
    btn.onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden)); };
    menu.onclick = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
    $("#logout-btn").onclick = logout;
  }
  // Ferme le menu du compte quand on clique ailleurs (un seul écouteur pour toute la page)
  document.addEventListener("click", () => {
    const menu = $("#me-menu"), btn = $("#me-btn");
    if (menu && !menu.hidden) { menu.hidden = true; if (btn) btn.setAttribute("aria-expanded", "false"); }
  });
  function discordIcon() {
    return `<svg width="18" height="14" viewBox="0 0 71 55" aria-hidden="true" fill="currentColor"><path d="M60.1 4.9A58.5 58.5 0 0 0 45.5.4a40 40 0 0 0-1.9 3.8 54 54 0 0 0-16.2 0A40 40 0 0 0 25.5.4 58.4 58.4 0 0 0 10.9 4.9C1.6 18.7-.9 32.2.3 45.5a58.8 58.8 0 0 0 17.9 9 43 43 0 0 0 3.8-6.2 38 38 0 0 1-6-2.9l1.5-1.1a42 42 0 0 0 36 0l1.5 1.1a38 38 0 0 1-6 2.9 43 43 0 0 0 3.8 6.2 58.6 58.6 0 0 0 17.9-9c1.5-15.4-2.5-28.8-10.6-40.6ZM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2Z"/></svg>`;
  }

  // ---------- Routeur ----------
  const views = { "/confidentialite": viewPrivacy, "/profil": viewProfile, "/mon-equipe": viewMyTeam, "/equipes": viewTeams, "/admin": viewAdmin, "/tournois": viewTournaments, "/staff": viewStaff, "/regie": viewRegie };
  function route() {
    const h = location.hash || "";
    const path = h.startsWith("#/") ? h.slice(1).split("?")[0] : null;
    const home = $("#view-home"), app = $("#view-app");
    document.querySelectorAll("header.top nav a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === h || ((h.startsWith("#/tournoi") || h.startsWith("#/league")) && a.getAttribute("href") === "#/tournois")));
    const tm = path && path.match(/^\/tournoi\/(.+)$/), lm = path && path.match(/^\/league\/(.+)$/);
    if (path && (views[path] || tm || lm)) {
      home.hidden = true; app.hidden = false; window.scrollTo(0, 0);
      app.innerHTML = `<div class="wrap app-wrap"><p class="eyebrow">Chargement…</p></div>`;
      (tm ? viewTournament(app, tm[1]) : lm ? viewLeague(app, lm[1]) : views[path](app)).catch(e => { app.innerHTML = panel("Oups", `<p class="lead">${esc(errMsg(e))}</p>`); });
    } else {
      app.hidden = true; home.hidden = false;
      if (h && !h.startsWith("#/")) { const el = document.getElementById(h.slice(1)); if (el) el.scrollIntoView(); }
    }
  }
  window.addEventListener("hashchange", route);

  const panel = (title, inner, eyebrow = "") =>
    `<div class="wrap app-wrap">${eyebrow ? `<span class="eyebrow">${eyebrow}</span>` : ""}<h2 class="app-title">${title}</h2>${inner}</div>`;

  function needLogin(app, what) {
    app.innerHTML = panel("Connecte-toi avec Discord",
      `<p class="lead">${what}</p><div class="ctas" style="margin-top:24px"><button class="btn solid" id="login-inline" type="button">${discordIcon()} Se connecter avec Discord</button></div>
       <p class="small-note">On récupère seulement ton pseudo et ton avatar Discord.</p>`, "Compte");
    $("#login-inline").onclick = login;
  }

  // Bouton à double clic de confirmation
  function confirmable(btn, label, action) {
    let armed = false, timer;
    btn.addEventListener("click", async () => {
      if (!armed) { armed = true; const old = btn.textContent; btn.textContent = label; btn.classList.add("armed");
        timer = setTimeout(() => { armed = false; btn.textContent = old; btn.classList.remove("armed"); }, 3500); return; }
      clearTimeout(timer); btn.disabled = true; await action(); btn.disabled = false;
    });
  }

  async function rpc(name, args) {
    const { data, error } = await sb.rpc(name, args);
    if (error) { if (isSetupError(error)) showSetupBanner(); throw error; }
    return data;
  }

  // Synchro des rôles Discord (D1 à D4, Capitaine) via la fonction discord-sync
  async function discordSync(body, verbose = false) {
    if (!sb) return;
    try {
      const { data, error } = await sb.functions.invoke("discord-sync", { body });
      if (error) { if (verbose) toast("Synchro Discord impossible : " + (await error.context?.json?.().then(j => j.error).catch(() => null) || error.message), "err"); return; }
      if (verbose && data && data.report) {
        const lines = Object.entries(data.report).map(([k, v]) => k + " : " + v);
        toast("Discord · " + (lines.join(" · ") || "rien à changer"));
      }
    } catch (e) { if (verbose) toast("Synchro Discord impossible.", "err"); }
  }

  // Logo d'équipe (ou initiales du tag si pas de logo)
  const teamLogo = (t, size = 32) => t && t.logo_url
    ? `<img class="team-logo" src="${esc(t.logo_url)}" alt="" width="${size}" height="${size}" loading="lazy">`
    : `<span class="team-logo team-logo-empty" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px">${esc((t && t.tag || "?").slice(0, 3))}</span>`;

  // Redimensionne l'image en 256×256 (contenue, fond transparent) puis l'envoie
  async function uploadTeamLogo(teamId, file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Format accepté : PNG, JPG ou WEBP.");
    if (file.size > 8 * 1024 * 1024) throw new Error("Image trop lourde (8 Mo max avant redimensionnement).");
    const img = await createImageBitmap(file);
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const k = Math.min(256 / img.width, 256 / img.height), w = img.width * k, h = img.height * k;
    c.getContext("2d").drawImage(img, (256 - w) / 2, (256 - h) / 2, w, h);
    let blob = await new Promise(r => c.toBlob(r, "image/webp", 0.9)), ext = "webp";
    if (!blob || blob.type !== "image/webp") { blob = await new Promise(r => c.toBlob(r, "image/png")); ext = "png"; }
    const path = `${teamId}/logo-${Date.now()}.${ext}`;
    const up = await sb.storage.from("team-logos").upload(path, blob, { contentType: blob.type, upsert: false });
    if (up.error) throw new Error(/Bucket not found/i.test(up.error.message) ? "Le stockage des logos n'est pas encore activé (script SQL 002)." : /row-level|policy/i.test(up.error.message) ? "Envoi refusé par le stockage : seul le capitaine peut changer le logo." : "Envoi impossible : " + up.error.message);
    const url = sb.storage.from("team-logos").getPublicUrl(path).data.publicUrl;
    await rpc("set_team_logo", { p_url: url });
    await cleanLogos(teamId, path.split("/")[1]);
  }
  // Supprime les anciens logos de l'équipe pour ne pas remplir le stockage
  async function cleanLogos(teamId, keep) {
    try {
      const { data } = await sb.storage.from("team-logos").list(teamId, { limit: 100 });
      const old = (data || []).filter(f => f.name !== keep).map(f => `${teamId}/${f.name}`);
      if (old.length) await sb.storage.from("team-logos").remove(old);
    } catch (e) { /* pas grave : le nouveau logo est déjà en place */ }
  }

  const rankOptions = sel => `<option value="">Choisis ton rang</option>` +
    ["Fer","Bronze","Argent","Or","Platine","Diamant","Ascendant","Immortel"].map((g, gi) =>
      `<optgroup label="${g}">${[0,1,2].map(k => { const i = gi*3+k; return `<option value="${i}" ${sel === i ? "selected" : ""}>${RANKS[i]}</option>`; }).join("")}</optgroup>`).join("") +
    `<option value="24" ${sel === 24 ? "selected" : ""}>Radiant</option>`;

  // ---------- Vue : confidentialité ----------
  async function viewPrivacy(app) {
    const support = (CFG.links || {}).discord
      ? `ouvre un ticket dans <b>#support</b> sur <a href="${esc(CFG.links.discord)}" target="_blank" rel="noopener">notre serveur Discord</a>`
      : "ouvre un ticket dans <b>#support</b> sur notre serveur Discord";
    app.innerHTML = panel("Confidentialité", `
      <div class="legal">
        <p class="lead">PRIZM Competitive Network est un réseau communautaire et bénévole de scrims et tournois Valorant. Cette page explique quelles données le site enregistre, pourquoi, et comment les faire supprimer.</p>
        <p class="small-note">Dernière mise à jour : 23 octobre 2026.</p>

        <h3>Qui s'occupe de tes données ?</h3>
        <p>Le staff de PRIZM Competitive Network. Pour toute question ou demande, ${support}.</p>

        <h3>Ce que nous enregistrons</h3>
        <ul>
          <li><b>Ton compte Discord</b>, quand tu te connectes : identifiant Discord, pseudo et avatar. Nous n'avons jamais accès à ton mot de passe ni à tes messages.</li>
          <li><b>Ton profil joueur</b>, que tu renseignes toi-même : Riot ID et rang actuel.</li>
          <li><b>Ton équipe</b> : nom, tag, logo, composition, rôle (titulaire, remplaçant, capitaine), statut et division.</li>
        </ul>
        <p>Pas de publicité, pas de revente, pas de traceur. Le site garde seulement ta session de connexion dans le stockage de ton navigateur, pour que tu restes connecté.</p>

        <h3>Pourquoi</h3>
        <ul>
          <li>Te connecter et gérer ton profil et ton équipe.</li>
          <li>Placer ton équipe dans la bonne division et organiser les scrims et tournois.</li>
          <li>Te donner automatiquement ton rôle de division sur notre serveur Discord.</li>
        </ul>

        <h3>Qui peut les voir</h3>
        <p>La liste des équipes validées (nom, tag, logo, pseudos, Riot ID et rangs des joueurs) est <b>publique</b> sur le site : c'est nécessaire pour la compétition. Le code d'invitation d'une équipe n'est visible que par ses membres. Le staff voit toutes les équipes pour les valider.</p>

        <h3>Où elles sont stockées</h3>
        <ul>
          <li><b>Supabase</b> : base de données et logos, serveurs dans l'Union européenne (Irlande).</li>
          <li><b>GitHub Pages</b> : héberge les pages du site.</li>
          <li><b>Discord</b> : sert à la connexion et aux rôles du serveur.</li>
        </ul>

        <h3>Combien de temps</h3>
        <p>Tant que ton compte existe. Tu peux le supprimer à tout moment depuis <a href="#/profil">Mon profil</a> : ton profil est effacé immédiatement et tu es retiré de ton équipe.</p>

        <h3>Tes droits</h3>
        <p>Tu peux consulter, corriger ou supprimer tes données, ou t'opposer à leur utilisation. Corrige ton profil toi-même sur le site, ou ${support} pour toute autre demande. Si tu estimes que tes droits ne sont pas respectés, tu peux saisir la CNIL (cnil.fr).</p>

        <h3>Mineurs</h3>
        <p>Si tu as moins de 15 ans, parle de ton inscription à un de tes parents avant de créer ton compte.</p>
      </div>`, "Légal");
  }

  // ---------- Vue : profil ----------
  async function viewProfile(app) {
    if (!state.session) return needLogin(app, "Ton profil joueur est lié à ton compte Discord.");
    await loadMe(); const p = state.profile;
    if (!p) { app.innerHTML = panel("Profil introuvable", `<p class="lead">La base de données n'est pas encore prête.</p>`); return; }
    app.innerHTML = panel("Mon profil", `
      <div class="profile-head">${avatar(p.avatar_url, p.username, 64)}<div><b class="ph-name">${esc(p.username)}</b><span class="small-note">Compte Discord relié</span></div></div>
      <form class="form" id="profile-form" novalidate>
        <label for="riot-id">Riot ID</label>
        <input id="riot-id" name="riot" placeholder="Pseudo#TAG" value="${esc(p.riot_id || "")}" autocomplete="off" required>
        <span class="hint">Exactement comme en jeu, avec le #. Ton rang est détecté automatiquement à partir de ton Riot ID.</span>
        <div class="ctas"><button class="btn solid" type="submit" id="save-riot">${p.riot_id ? "Enregistrer et actualiser mon rang" : "Enregistrer et détecter mon rang"}</button></div>
        <p class="form-err" id="profile-err" role="alert"></p>
      </form>
      <div class="rank-box" id="rank-box">${rankBox(p)}</div>
      <div class="card danger-zone">
        <h3>Supprimer mon compte</h3>
        <p class="small-note">Efface ton profil (pseudo, avatar, Riot ID, rang) et te retire de ton équipe. C'est définitif. Plus d'infos dans la <a href="#/confidentialite">politique de confidentialité</a>.</p>
        <button class="btn danger" id="delete-account" type="button">Supprimer mon compte</button>
        <p class="form-err" id="delete-err" role="alert"></p>
      </div>`, "Compte");
    confirmable($("#delete-account"), "Clique encore : suppression définitive", async () => {
      $("#delete-err").textContent = "";
      try { await rpc("delete_my_account"); await sb.auth.signOut(); state.session = null; clearMe(); renderAuth(); toast("Ton compte a été supprimé."); location.hash = "#top"; }
      catch (x) { $("#delete-err").textContent = errMsg(x); }
    });
    $("#profile-form").onsubmit = async e => {
      e.preventDefault();
      const riot = $("#riot-id").value.trim();
      const err = $("#profile-err"); err.textContent = "";
      if (!/^[^#]{3,16}#[A-Za-z0-9]{3,5}$/.test(riot)) { err.textContent = "Riot ID invalide. Format attendu : Pseudo#TAG (ex : Celyan#EUW)."; return; }
      const btn = $("#save-riot"); btn.disabled = true; btn.textContent = "Détection du rang…";
      if (riot !== (p.riot_id || "")) {
        const { error } = await sb.from("profiles").update({ riot_id: riot }).eq("id", state.session.user.id);
        if (error) { err.textContent = errMsg(error); btn.disabled = false; btn.textContent = "Enregistrer et détecter mon rang"; return; }
      }
      const r = await rankSync({});
      const mine = r && r.results ? Object.values(r.results)[0] : null;
      if (r && r.error) err.textContent = r.error;
      else if (mine && !mine.ok) err.textContent = mine.message;
      else if (mine && mine.ok) toast(mine.rank == null ? "Compte trouvé, mais non classé pour l'instant." : "Rang détecté : " + mine.label + ".");
      await loadMe(); renderAuth(); $("#rank-box").innerHTML = rankBox(state.profile);
      btn.disabled = false; btn.textContent = "Enregistrer et actualiser mon rang";
    };
  }

  function rankBox(p) {
    if (!p) return "";
    const d = rankDiv(p.rank);
    const when = p.rank_checked_at ? new Date(p.rank_checked_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "";
    const src = p.rank_source === "auto" ? `<span class="pill ok">Vérifié</span><span class="small-note">Détecté automatiquement${when ? " le " + when : ""}</span>`
      : p.rank_source === "staff" ? `<span class="pill ok">Fixé par le staff</span>${when ? `<span class="small-note">le ${when}</span>` : ""}`
      : p.rank != null ? `<span class="pill wait">Non vérifié</span><span class="small-note">Clique sur le bouton ci-dessus pour le vérifier.</span>` : "";
    if (p.rank == null) return `<span class="eyebrow">Rang actuel</span><b class="rank-big">${p.riot_id ? "Non classé" : "—"}</b>
      <p class="small-note">${p.riot_id ? "Aucun rang compétitif trouvé pour ce Riot ID. Joue tes matchs de placement, ou demande au staff de fixer ton rang via un ticket dans #support." : "Renseigne ton Riot ID pour détecter ton rang."}</p>`;
    return `<span class="eyebrow">Rang actuel</span><b class="rank-big">${esc(RANKS[p.rank])}</b>
      <div class="rank-meta">${src}</div>
      <p class="div-preview">Ce rang correspond à la <b>${DIV_NAMES[d]}</b>.</p>`;
  }

  // Appelle la fonction rank-sync (détection du rang via HenrikDev)
  async function rankSync(body) {
    try {
      const { data, error } = await sb.functions.invoke("rank-sync", { body });
      if (error) {
        let msg = null; try { msg = (await error.context.json()).error; } catch (e) {}
        return { error: msg || "La détection du rang est indisponible pour le moment." };
      }
      return data;
    } catch (e) { return { error: "La détection du rang est indisponible pour le moment." }; }
  }

  // ---------- Vue : mon équipe ----------
  async function viewMyTeam(app) {
    if (!state.session) return needLogin(app, "Pour créer ou rejoindre une équipe, connecte-toi avec ton compte Discord.");
    await loadMe();
    const p = state.profile;
    const profileOk = p && p.riot_id && p.rank != null;
    const teamId = state.team ? state.team.id : null;
    let pendingCode = ""; try { pendingCode = sessionStorage.getItem("prizm_join") || ""; } catch (e) {}

    if (!teamId) {
      app.innerHTML = panel("Mon équipe", `
        ${profileOk ? "" : `<div class="callout">Complète d'abord <a href="#/profil">ton profil</a> (Riot ID et rang). Il sert à placer ton équipe dans la bonne division.</div>`}
        <div class="two">
          <form class="card form" id="create-form" novalidate>
            <h3>Créer une équipe</h3>
            <p class="small-note">Tu deviens capitaine. Tu reçois un code pour inviter tes coéquipiers.</p>
            <label for="t-name">Nom de l'équipe</label><input id="t-name" maxlength="24" placeholder="ex : Nova Esport" required>
            <label for="t-tag">Tag (2 à 5 caractères)</label><input id="t-tag" maxlength="5" placeholder="ex : NOVA" required>
            <div class="ctas"><button class="btn solid" type="submit" ${profileOk ? "" : "disabled"}>Créer l'équipe</button></div>
            <p class="form-err" id="create-err" role="alert"></p>
          </form>
          <form class="card form" id="join-form" novalidate>
            <h3>Rejoindre une équipe</h3>
            <p class="small-note">Demande le code d'invitation à ton capitaine.</p>
            <label for="j-code">Code d'invitation</label><input id="j-code" maxlength="6" placeholder="ex : A1B2C3" value="${esc(pendingCode)}" required>
            <div class="ctas"><button class="btn" type="submit" ${profileOk ? "" : "disabled"}>Rejoindre</button></div>
            <p class="form-err" id="join-err" role="alert"></p>
          </form>
        </div>`, "Équipe");
      $("#create-form").onsubmit = async e => {
        e.preventDefault(); const err = $("#create-err"); err.textContent = "";
        const name = $("#t-name").value.trim(), tag = $("#t-tag").value.trim();
        if (name.length < 3) return err.textContent = "Le nom doit faire au moins 3 caractères.";
        if (!/^[A-Za-z0-9]{2,5}$/.test(tag)) return err.textContent = "Le tag doit faire 2 à 5 lettres ou chiffres.";
        try { await rpc("create_team", { p_name: name, p_tag: tag }); toast("Équipe créée."); viewMyTeam(app); }
        catch (x) { err.textContent = errMsg(x); }
      };
      $("#join-form").onsubmit = async e => {
        e.preventDefault(); const err = $("#join-err"); err.textContent = "";
        try { const tid = await rpc("join_team", { p_code: $("#j-code").value.trim() }); discordSync({ team_id: tid }); toast("Tu as rejoint l'équipe."); try { sessionStorage.removeItem("prizm_join"); } catch (e) {} viewMyTeam(app); }
        catch (x) { err.textContent = errMsg(x); }
      };
      return;
    }

    const t = state.team, code = t.invite_code;
    const roster = await rpc("team_roster", { p_team: teamId });
    const me = state.session.user.id;
    const isCap = !!t.is_captain;
    const inviteLink = location.origin + location.pathname + "?join=" + code + "#/mon-equipe";
    const tit = roster.filter(r => r.role === "titulaire").length;

    app.innerHTML = panel(`${teamLogo(t, 64)}<span>${esc(t.name)}</span> <span class="tag-chip">${esc(t.tag)}</span>`, `
      <div class="team-status">
        ${statusPill(t)}
        <span class="small-note">${t.status === "validee" ? "Ton équipe peut scrimer et s'inscrire aux tournois de sa division." :
          t.status === "refusee" ? "Contacte le staff dans #support sur le Discord." :
          `Division estimée : <b>${t.suggested ? DIV_NAMES[t.suggested] : "à calculer"}</b>. Le staff valide la division finale.`}</span>
      </div>
      ${t.status === "validee" ? `<div class="callout info">Ton rôle <b>D${t.division}</b> est donné automatiquement sur le Discord PRIZM. Tu dois être sur le serveur pour le recevoir${(CFG.links || {}).discord ? ` : <a href="${esc(CFG.links.discord)}" target="_blank" rel="noopener">rejoindre le Discord</a>` : ""}. Arrivé après la validation ? <button class="link-btn" id="sync-me" type="button">Recevoir mon rôle</button></div>` : ""}
      ${tit < 5 && t.status !== "validee" ? `<div class="callout">Il te faut 5 titulaires pour être validé. Pour l'instant : ${tit}/5.</div>` : ""}
      ${rosterTable(roster, isCap, me)}
      <div class="roster-tools"><button class="link-btn" id="refresh-ranks" type="button">Actualiser les rangs de l'équipe</button><span class="small-note">✓ = rang vérifié · ? = rang non vérifié</span></div>
      <div class="cards3" style="margin-top:32px">
        <div class="card">
          <h3>Inviter des joueurs</h3>
          <p class="small-note">7 joueurs max (5 titulaires + 2 remplaçants). Envoie le lien ou le code.</p>
          <div class="code-big" id="inv-code">${esc(code)}</div>
          <div class="copy-row"><input id="inv-link" readonly value="${esc(inviteLink)}" aria-label="Lien d'invitation"><button class="btn sm" id="copy-inv" type="button">Copier le lien</button></div>
          <p class="copied" id="inv-copied" aria-live="polite"></p>
          ${isCap ? `<button class="link-btn" id="regen" type="button">Générer un nouveau code</button>` : ""}
        </div>
        <div class="card">
          <h3>Logo de l'équipe</h3>
          <div class="logo-edit">${teamLogo(t, 96)}
            ${isCap ? `<div class="logo-actions">
              <label class="btn sm" for="logo-file">${t.logo_url ? "Changer le logo" : "Ajouter un logo"}</label>
              <input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp" hidden>
              ${t.logo_url ? `<button class="link-btn danger-t" id="logo-remove" type="button">Retirer le logo</button>` : ""}
              <p class="small-note">PNG, JPG ou WEBP. Format carré conseillé, fond transparent idéal.</p>
              <p class="form-err" id="logo-err" role="alert"></p>
            </div>` : `<p class="small-note">Seul le capitaine peut changer le logo.</p>`}
          </div>
        </div>
        <div class="card">
          <h3>Quitter l'équipe</h3>
          <p class="small-note">${isCap ? (roster.length > 1 ? "Tu es capitaine : nomme un autre capitaine avant de partir." : "Tu es seul : quitter supprime l'équipe.") : "Tu pourras rejoindre une autre équipe ensuite."}</p>
          <button class="btn danger" id="leave" type="button" ${isCap && roster.length > 1 ? "disabled" : ""}>${isCap && roster.length === 1 ? "Supprimer l'équipe" : "Quitter l'équipe"}</button>
        </div>
      </div>`, "Mon équipe");

    $("#refresh-ranks").onclick = async () => {
      const b = $("#refresh-ranks"); b.disabled = true; b.textContent = "Actualisation…";
      const r = await rankSync({ team_id: teamId });
      if (r.error) toast(r.error, "err");
      else { const fails = Object.values(r.results).filter(x => !x.ok); toast(fails.length ? fails.map(x => (x.username || "?") + " : " + x.message).join(" · ") : "Rangs actualisés.", fails.length ? "err" : "ok"); }
      viewMyTeam(app);
    };
    if ($("#sync-me")) $("#sync-me").onclick = () => discordSync({ user_ids: [me] }, true);
    if ($("#logo-file")) $("#logo-file").onchange = async e => {
      const f = e.target.files[0]; if (!f) return; $("#logo-err").textContent = "Envoi en cours…";
      try { await uploadTeamLogo(teamId, f); toast("Logo enregistré."); viewMyTeam(app); }
      catch (x) { $("#logo-err").textContent = errMsg(x); }
    };
    if ($("#logo-remove")) confirmable($("#logo-remove"), "Confirmer ?", async () => {
      try { await rpc("set_team_logo", { p_url: null }); await cleanLogos(teamId, null); toast("Logo retiré."); viewMyTeam(app); } catch (x) { toast(errMsg(x), "err"); } });
    $("#copy-inv").onclick = () => copyText(inviteLink, $("#inv-copied"), null);
    if ($("#regen")) confirmable($("#regen"), "Confirmer : l'ancien code ne marchera plus", async () => {
      try { await rpc("regenerate_invite"); toast("Nouveau code généré."); viewMyTeam(app); } catch (x) { toast(errMsg(x), "err"); } });
    confirmable($("#leave"), "Clique encore pour confirmer", async () => {
      try { await rpc("leave_team"); discordSync({ user_ids: [me] }); toast("Tu as quitté l'équipe."); viewMyTeam(app); } catch (x) { toast(errMsg(x), "err"); } });
    bindRosterActions(app, () => viewMyTeam(app));
  }

  function statusPill(t) {
    if (t.status === "validee") return `<span class="pill ok">Validée · ${DIV_NAMES[t.division]}</span>`;
    if (t.status === "refusee") return `<span class="pill bad">Refusée</span>`;
    return `<span class="pill wait">En attente de validation</span>`;
  }

  const rankCell = r => {
    const label = r.rank != null ? esc(RANKS[r.rank]) : "—";
    const mark = r.rank_source === "auto" ? `<span class="rank-ok" title="Rang vérifié automatiquement">✓</span>`
      : r.rank_source === "staff" ? `<span class="rank-ok" title="Rang fixé par le staff">✓</span>`
      : r.rank != null ? `<span class="rank-unv" title="Rang non vérifié">?</span>` : "";
    return label + mark;
  };

  function rosterTable(roster, isCap, me, admin = false) {
    return `<div class="table-scroll"><table class="roster">
      <thead><tr><th>Joueur</th><th>Riot ID</th><th>Rang</th><th>Rôle</th>${isCap ? "<th><span class='sr'>Actions</span></th>" : ""}</tr></thead>
      <tbody>${roster.map(r => `<tr>
        <td><span class="pl">${avatar(r.avatar_url, r.username, 28)}<b>${esc(r.username)}</b>${r.is_captain ? '<span class="cap">Capitaine</span>' : ""}</span></td>
        <td class="mono">${esc(r.riot_id || "—")}</td>
        <td>${admin ? `<span class="admin-rank"><select data-rank-for="${r.user_id}" aria-label="Rang de ${esc(r.username)}"><option value="">Non classé</option>${RANKS.map((n, i) => `<option value="${i}" ${r.rank === i ? "selected" : ""}>${n}</option>`).join("")}</select><button class="link-btn" data-rank-save="${r.user_id}" type="button">Fixer</button></span> ${rankCell(r).replace(/^[^<]*/, "")}` : rankCell(r)}</td>
        <td>${r.role === "titulaire" ? "Titulaire" : "Remplaçant"}</td>
        ${isCap ? `<td class="act">${r.user_id === me ? "" : `
          <button class="link-btn" data-act="role" data-u="${r.user_id}" data-r="${r.role === "titulaire" ? "remplacant" : "titulaire"}" type="button">${r.role === "titulaire" ? "Passer remplaçant" : "Passer titulaire"}</button>
          <button class="link-btn" data-act="cap" data-u="${r.user_id}" type="button">Nommer capitaine</button>
          <button class="link-btn danger-t" data-act="kick" data-u="${r.user_id}" type="button">Retirer</button>`}</td>` : ""}
      </tr>`).join("")}</tbody></table></div>`;
  }

  function bindRosterActions(root, refresh) {
    root.querySelectorAll("[data-act]").forEach(b => {
      const u = b.dataset.u;
      if (b.dataset.act === "role") b.onclick = async () => { try { await rpc("set_member_role", { p_user: u, p_role: b.dataset.r }); refresh(); } catch (x) { toast(errMsg(x), "err"); } };
      if (b.dataset.act === "cap") confirmable(b, "Confirmer ?", async () => { try { await rpc("transfer_captain", { p_user: u }); discordSync({ user_ids: [u, state.session.user.id] }); toast("Nouveau capitaine nommé."); refresh(); } catch (x) { toast(errMsg(x), "err"); } });
      if (b.dataset.act === "kick") confirmable(b, "Confirmer ?", async () => { try { await rpc("kick_member", { p_user: u }); discordSync({ user_ids: [u] }); toast("Joueur retiré."); refresh(); } catch (x) { toast(errMsg(x), "err"); } });
    });
  }

  // ---------- Vue : équipes ----------
  async function viewTeams(app) {
    if (!sb) { app.innerHTML = panel("Équipes", `<p class="lead">Bientôt disponible.</p>`); return; }
    const teams = await rpc("list_teams");
    const ok = teams.filter(t => t.status === "validee" && !t.is_test);
    const pending = teams.filter(t => t.status === "en_attente").length;
    app.innerHTML = panel("Équipes du réseau", `
      <p class="lead">${ok.length} équipe${ok.length > 1 ? "s" : ""} validée${ok.length > 1 ? "s" : ""}${pending ? ` · ${pending} en attente de validation` : ""}. Clique sur une équipe pour voir ses joueurs.</p>
      <div class="ctas" style="margin:20px 0 40px"><a class="btn solid" href="#/mon-equipe" data-team-cta>${teamCtaLabel()}</a></div>
      ${[1,2,3,4].map(d => {
        const list = ok.filter(t => t.division === d);
        return `<section class="div-block"><h3>${DIV_NAMES[d]}</h3>
          ${list.length ? `<div class="team-list">${list.map(teamRow).join("")}</div>` : `<p class="small-note">Aucune équipe pour l'instant.</p>`}</section>`;
      }).join("")}`, "Classement par division");
    bindTeamRows(app);
  }
  const teamRow = t => `<details class="team-row" data-id="${t.id}"><summary>${teamLogo(t, 36)}<b>${esc(t.name)}</b><span class="tag-chip">${esc(t.tag)}</span><span class="small-note">${t.members} joueur${t.members > 1 ? "s" : ""}</span></summary><div class="roster-slot"><p class="small-note">Chargement…</p></div></details>`;
  function bindTeamRows(root, admin = false) {
    const load = async d => {
      try {
        const r = await rpc("team_roster", { p_team: d.dataset.id });
        $(".roster-slot", d).innerHTML = rosterTable(r, false, null, admin);
        if (admin) d.querySelectorAll("[data-rank-save]").forEach(b => b.onclick = async () => {
          const u = b.dataset.rankSave, v = d.querySelector(`[data-rank-for="${u}"]`).value;
          try { await rpc("admin_set_rank", { p_user: u, p_rank: v === "" ? null : +v }); toast("Rang fixé."); load(d); }
          catch (x) { toast(errMsg(x), "err"); }
        });
      } catch (x) { $(".roster-slot", d).innerHTML = `<p class="form-err">${esc(errMsg(x))}</p>`; }
    };
    root.querySelectorAll("details.team-row").forEach(d => d.addEventListener("toggle", () => {
      if (!d.open || d.dataset.loaded) return; d.dataset.loaded = "1"; load(d);
    }));
  }


  // ================= Tournois =================
  const T_STATUS = { brouillon: "Brouillon", inscriptions: "Inscriptions ouvertes", checkin: "Check-in ouvert", en_cours: "En cours", termine: "Terminé" };
  const T_PILL = { brouillon: "wait", inscriptions: "ok", checkin: "warn", en_cours: "live", termine: "done" };
  const tPill = s => `<span class="pill t-${T_PILL[s]}">${T_STATUS[s]}</span>`;
  const divChip = d => `<span class="div-chip d${d}">D${d}</span>`;
  const fmtDate = iso => iso ? new Date(iso).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "Date à venir";
  const toLocalInput = iso => { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  // Types de tournoi proposés (le nom est généré à partir du type, du numéro et de la division)
  const T_TYPES = [
    { name: "PRIZM Cup", max: 8, bo: 1, fbo: 3, hint: "Tournoi d'une soirée en élimination directe : BO1, finale en BO3." },
    { name: "PRIZM League · Playoffs", max: 4, bo: 3, fbo: 5, hint: "Playoffs de fin de saison pour le top 4 : demi-finales en BO3, grande finale en BO5." },
  ];
  const roundName = (r, total) => r === total ? "Finale" : r === total - 1 ? "Demi-finales" : r === total - 2 ? "Quarts de finale" : r === total - 3 ? "Huitièmes" : "Tour " + r;

  async function announce(tid, event) {
    try {
      const { error } = await sb.functions.invoke("tournament-announce", { body: { tournament_id: tid, event } });
      if (error) { let m = null; try { m = (await error.context.json()).error; } catch (e) {} toast(m || "Annonce Discord impossible.", "err"); return; }
      toast("Annonce publiée sur Discord.");
    } catch (e) { toast("Annonce Discord impossible.", "err"); }
  }

  // Mode test : compétitions invisibles pour les joueurs, remplies d'équipes fictives
  const testBox = id => `<label class="check-line" for="${id}"><input type="checkbox" id="${id}" ${location.hash.includes("?test") ? "checked" : ""}> <span><b>Compétition de test</b> : visible seulement par le staff, pas d'annonce Discord, remplie en un clic avec des équipes fictives. Tout s'efface depuis Admin.</span></label>`;
  const testCallout = `<div class="callout test-callout"><b>Compétition de test.</b> Les joueurs ne la voient pas. Tu peux tout essayer : équipes fictives, scores, bracket, HUD de cast.</div>`;
  const testBadge = `<span class="type-badge test">Test</span>`;

  async function viewTournamentForm(app, t) {
    if (!state.isStaff) { app.innerHTML = panel("Accès refusé", `<p class="lead">Réservé au staff.</p>`); return; }
    const v = t || { name: "", division: 2, starts_at: null, max_teams: 8, best_of: 1, final_best_of: 3, description: "" };
    const locked = t && ["en_cours", "termine"].includes(t.status);
    const opt = (vals, cur, lab = x => x) => vals.map(x => `<option value="${x}" ${+cur === x ? "selected" : ""}>${lab(x)}</option>`).join("");
    app.innerHTML = panel(t ? "Modifier le tournoi" : "Nouveau tournoi", `
      <form class="form" id="t-form" novalidate>
        ${t ? `<label>Nom</label><p class="t-name-fixed">${esc(v.name)}</p>`
          : `<label for="t-type">Type de tournoi</label><select id="t-type">${T_TYPES.map(x => `<option value="${x.name}">${x.name}</option>`).join("")}</select>
             <span class="hint" id="t-type-hint"></span>
             <p class="t-name-preview">Nom : <b id="t-name-preview"></b></p>`}
        <label for="t-div">Division</label><select id="t-div" ${locked ? "disabled" : ""}>${opt([1, 2, 3, 4], v.division, d => DIV_NAMES[d])}</select>
        <label for="t-date">Date et heure de début</label><input id="t-date" type="datetime-local" value="${toLocalInput(v.starts_at)}">
        <label for="t-max">Nombre d'équipes maximum</label><select id="t-max" ${locked ? "disabled" : ""}>${opt([4, 8, 16, 32], v.max_teams)}</select>
        <label for="t-bo">Format des matchs</label><select id="t-bo" ${locked ? "disabled" : ""}>${opt([1, 3, 5], v.best_of, x => "BO" + x)}</select>
        <label for="t-fbo">Format de la finale</label><select id="t-fbo" ${locked ? "disabled" : ""}>${opt([1, 3, 5], v.final_best_of, x => "BO" + x)}</select>
        <label for="t-desc">Description (optionnelle)</label><textarea id="t-desc" rows="4" maxlength="1000" placeholder="Récompenses, règles particulières, horaires…">${esc(v.description || "")}</textarea>
        ${locked ? `<p class="small-note">Le bracket est lancé : seules la date et la description sont modifiables.</p>` : ""}
        ${t ? "" : testBox("t-test")}
        <div class="ctas"><button class="btn solid" type="submit">${t ? "Enregistrer" : "Créer le tournoi"}</button><a class="btn" href="${t ? "#/tournoi/" + t.id : "#/tournois"}">Annuler</a></div>
        <p class="form-err" id="t-err" role="alert"></p>
      </form>`, "Staff");
    // Nom généré automatiquement : « Type #N · Dx », N = prochain numéro libre dans la division
    let existing = [];
    if (!t) { try { existing = (await rpc("list_tournaments")).map(x => x.name); } catch (e) {} }
    const autoName = () => {
      const type = $("#t-type").value, div = +$("#t-div").value;
      const re = new RegExp("^" + type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " #(\\d+) · D" + div + "$");
      const n = existing.reduce((mx, nm) => { const m = nm.match(re); return m ? Math.max(mx, +m[1]) : mx; }, 0) + 1;
      return `${type} #${n} · D${div}`;
    };
    const refreshName = () => { if (t) return; $("#t-name-preview").textContent = ($("#t-test").checked ? "Test · " : "") + autoName(); const ty = T_TYPES.find(x => x.name === $("#t-type").value); $("#t-type-hint").textContent = ty.hint; };
    if (!t) {
      $("#t-type").onchange = () => { const ty = T_TYPES.find(x => x.name === $("#t-type").value); $("#t-max").value = ty.max; $("#t-bo").value = ty.bo; $("#t-fbo").value = ty.fbo; refreshName(); };
      $("#t-div").onchange = refreshName; $("#t-test").onchange = refreshName;
      $("#t-type").onchange();
    }
    $("#t-form").onsubmit = async e => {
      e.preventDefault(); const err = $("#t-err"); err.textContent = "";
      const name = t ? t.name : autoName();
      const date = $("#t-date").value;
      try {
        const id = await rpc("admin_save_tournament", { p_id: t ? t.id : null, p_name: name, p_division: +$("#t-div").value, p_starts_at: date ? new Date(date).toISOString() : null,
          p_max_teams: +$("#t-max").value, p_best_of: +$("#t-bo").value, p_final_best_of: +$("#t-fbo").value, p_description: $("#t-desc").value,
          p_is_test: !t && $("#t-test").checked });
        toast(t ? "Tournoi enregistré." : "Tournoi créé en brouillon."); location.hash = "#/tournoi/" + id;
      } catch (x) { err.textContent = errMsg(x); }
    };
  }

  function bracketHtml(d, admin) {
    const t = d.tournament, total = t.rounds, ms = d.matches;
    if (!ms.length) return "";
    const team = id => d.teams.find(x => x.id === id) || d._gone?.[id];
    const row = (m, side) => {
      const id = side === 1 ? m.team1_id : m.team2_id, sc = side === 1 ? m.score1 : m.score2, tm = id ? team(id) : null;
      const win = m.winner_id && m.winner_id === id, lose = m.winner_id && id && m.winner_id !== id;
      const label = tm ? `${teamLogo(tm, 22)}<span class="bk-name">${esc(tm.name)}</span>` : `<span class="bk-name bk-tbd">${m.bye && m.round === 1 ? "Exempt" : "À déterminer"}</span>`;
      return `<div class="bk-row${win ? " win" : ""}${lose ? " lose" : ""}">${label}<span class="bk-sc">${sc ?? ""}</span></div>`;
    };
    const box = m => {
      const playable = admin && m.team1_id && m.team2_id && !m.bye;
      return `<div class="bk-slot"><${playable ? "button type=\"button\"" : "div"} class="bk-m${m.winner_id ? " done" : ""}${playable ? " editable" : ""}" data-match="${m.id}" ${playable ? `aria-label="Saisir le score"` : ""}>${row(m, 1)}${row(m, 2)}</${playable ? "button" : "div"}></div>`;
    };
    let html = "";
    for (let r = 1; r <= total; r++) {
      const rm = ms.filter(m => m.round === r).sort((a, b) => a.slot - b.slot);
      const bo = rm[0] ? rm[0].best_of : 1;
      let col = "";
      if (rm.length === 1) col = `<div class="bk-pair single">${box(rm[0])}</div>`;
      else for (let i = 0; i < rm.length; i += 2) col += `<div class="bk-pair">${box(rm[i])}${box(rm[i + 1])}</div>`;
      html += `<div class="bk-round"><h4>${roundName(r, total)} · BO${bo}</h4><div class="bk-col">${col}</div></div>`;
    }
    const champ = t.winner_team_id ? team(t.winner_team_id) : null;
    html += `<div class="bk-round bk-champ"><h4>Vainqueur</h4><div class="bk-col"><div class="bk-pair single"><div class="bk-slot"><div class="bk-win${champ ? "" : " empty"}">${champ ? `${teamLogo(champ, 44)}<b>${esc(champ.name)}</b>` : `<span class="small-note">À déterminer</span>`}</div></div></div></div></div>`;
    return `<div class="bk-scroll"><div class="bk" style="--cols:${total + 1}">${html}</div></div>`;
  }

  async function viewTournament(app, id) {
    if (id === "nouveau") return viewTournamentForm(app, null);
    if (id.endsWith("/modifier")) { const d = await rpc("tournament_detail", { p_id: id.slice(0, -9) }); return viewTournamentForm(app, d.tournament); }
    const d = await rpc("tournament_detail", { p_id: id });
    const t = d.tournament;
    if (!t) { app.innerHTML = panel("Tournoi introuvable", `<p class="lead">Ce tournoi n'existe pas ou n'est pas encore publié.</p><div class="ctas"><a class="btn" href="#/tournois">Voir les tournois</a></div>`); return; }
    // Équipe du visiteur (déjà en mémoire)
    const my = state.team, isCap = !!(my && my.is_captain);
    const reg = my ? d.teams.find(x => x.id === my.id) : null;
    const isAdmin = state.isStaff;

    // Bloc d'action du capitaine
    let action = "";
    if (["inscriptions", "checkin"].includes(t.status)) {
      if (!state.session) action = `<p>Connecte-toi avec Discord pour inscrire ton équipe.</p><button class="btn solid" id="t-login" type="button">${discordIcon()} Connexion</button>`;
      else if (!my) action = `<p>Tu n'as pas encore d'équipe.</p><a class="btn" href="#/mon-equipe">Créer ou rejoindre une équipe</a>`;
      else if (reg) {
        action = t.status === "checkin"
          ? (reg.checked_in ? `<p class="ok-line">✓ Check-in fait pour <b>${esc(my.name)}</b>. Rendez-vous ${esc(fmtDate(t.starts_at))}.</p>`
            : isCap ? `<p><b>${esc(my.name)}</b> est inscrite. Confirme votre présence :</p><button class="btn solid" id="t-checkin" type="button">Faire le check-in</button>`
            : `<p><b>${esc(my.name)}</b> est inscrite. Ton capitaine doit faire le check-in.</p>`)
          : `<p class="ok-line">✓ <b>${esc(my.name)}</b> est inscrite.${t.status === "inscriptions" ? " Le check-in ouvrira avant le début." : ""}</p>`;
        if (isCap) action += `<button class="link-btn danger-t" id="t-unreg" type="button">Désinscrire mon équipe</button>`;
      } else if (t.status === "checkin") action = `<p>Les inscriptions sont closes, le check-in est en cours.</p>`;
      else if (!isCap) action = `<p>Seul le capitaine de <b>${esc(my.name)}</b> peut inscrire l'équipe.</p>`;
      else if (my.status !== "validee") action = `<p>Ton équipe doit d'abord être validée par le staff.</p>`;
      else if (my.division !== t.division) action = `<p>Ce tournoi est réservé à la ${DIV_NAMES[t.division]}. Ton équipe est en ${DIV_NAMES[my.division]}.</p>`;
      else if (d.teams.length >= t.max_teams) action = `<p>Le tournoi est complet.</p>`;
      else action = `<p>Inscris <b>${esc(my.name)}</b> à ce tournoi.</p><button class="btn solid" id="t-reg" type="button">Inscrire mon équipe</button>`;
    }

    const showCheck = t.status === "checkin";
    const teamsHtml = d.teams.length ? `<div class="t-teams">${d.teams.map(x => `<div class="t-team">${teamLogo(x, 36)}<div><b>${esc(x.name)}</b><span class="small-note">${esc(x.tag)}${x.avg_rank != null ? " · moy. " + esc(RANKS[Math.round(x.avg_rank)]) : ""}</span></div>
        ${showCheck ? (x.checked_in ? `<span class="pill ok">Check-in ✓</span>` : `<span class="pill wait">En attente</span>`) : ""}
        ${isAdmin && ["brouillon", "inscriptions", "checkin"].includes(t.status) ? `<button class="link-btn danger-t" data-rm="${x.id}" type="button">Retirer</button>` : ""}</div>`).join("")}</div>`
      : `<p class="small-note">Aucune équipe inscrite pour l'instant.</p>`;

    // Panneau staff
    let staff = "";
    if (isAdmin) {
      const b = [];
      if (t.status === "brouillon") b.push(`<button class="btn sm solid" data-st="inscriptions" type="button">Ouvrir les inscriptions</button>`);
      if (t.status === "inscriptions") b.push(`<button class="btn sm solid" data-st="checkin" type="button">Ouvrir le check-in</button>`, `<button class="btn sm" data-gen type="button">Générer le bracket sans check-in</button>`, `<button class="link-btn" data-st="brouillon" type="button">Repasser en brouillon</button>`);
      if (t.status === "checkin") b.push(`<button class="btn sm solid" data-gen type="button">Générer le bracket</button>`, `<button class="link-btn" data-st="inscriptions" type="button">Rouvrir les inscriptions</button>`);
      if (["en_cours", "termine"].includes(t.status)) b.push(`<button class="link-btn danger-t" id="t-reset" type="button">Réinitialiser le bracket</button>`);
      if (t.is_test && ["brouillon", "inscriptions", "checkin"].includes(t.status) && d.teams.length < t.max_teams) b.unshift(`<button class="btn sm" id="t-fill" type="button">Ajouter des équipes de test</button>`);
      const ev = t.is_test ? null : { inscriptions: "inscriptions", checkin: "checkin", en_cours: "bracket", termine: "vainqueur" }[t.status];
      staff = `<div class="card staff-card">
        <h3>Staff</h3>
        <div class="staff-row">${b.join("")}</div>
        <div class="staff-row">${ev ? `<button class="btn sm" id="t-ann" type="button">Annoncer sur Discord</button>` : ""}<a class="link-btn" href="#/tournoi/${t.id}/modifier">Modifier</a><button class="link-btn danger-t" id="t-del" type="button">Supprimer le tournoi</button></div>
        ${t.status === "en_cours" ? `<p class="small-note">Clique sur un match du bracket pour saisir son score. Le vainqueur avance automatiquement.</p>` : ""}
        ${t.status === "checkin" ? `<p class="small-note">Les équipes sans check-in seront retirées à la génération. Têtes de série : rang moyen des titulaires.</p>` : ""}
        <div id="score-editor"></div>
      </div>`;
    }

    app.innerHTML = panel(esc(t.name), `
      <div class="t-meta">${divChip(t.division)}${tPill(t.status)}<span>${esc(fmtDate(t.starts_at))}</span><span>BO${t.best_of} · finale BO${t.final_best_of}</span><span>${d.teams.length} / ${t.max_teams} équipes</span></div>
      ${t.description ? `<p class="lead t-desc">${esc(t.description)}</p>` : ""}
      ${t.is_test ? testCallout : ""}
      ${action ? `<div class="card t-action">${action}<p class="form-err" id="t-err" role="alert"></p></div>` : ""}
      ${staff}
      ${d.matches.length ? `<h3 class="t-h">Bracket</h3>${bracketHtml(d, isAdmin)}` : ""}
      <h3 class="t-h">Équipes inscrites</h3>${teamsHtml}
      <div class="ctas" style="margin-top:32px"><a class="btn" href="#/tournois">Toutes les compétitions</a></div>`, `Tournoi · ${DIV_NAMES[t.division]}`);

    const reload = () => viewTournament(app, id);
    const err = $("#t-err");
    const act = async (fn, okMsg) => { if (err) err.textContent = ""; try { await fn(); if (okMsg) toast(okMsg); reload(); } catch (x) { if (err) err.textContent = errMsg(x); else toast(errMsg(x), "err"); } };
    if ($("#t-login")) $("#t-login").onclick = login;
    if ($("#t-reg")) $("#t-reg").onclick = () => act(() => rpc("register_team", { p_tournament: t.id }), "Équipe inscrite !");
    if ($("#t-checkin")) $("#t-checkin").onclick = () => act(() => rpc("checkin_team", { p_tournament: t.id }), "Check-in validé !");
    if ($("#t-unreg")) confirmable($("#t-unreg"), "Confirmer la désinscription", () => act(() => rpc("unregister_team", { p_tournament: t.id }), "Équipe désinscrite."));
    if (!isAdmin) return;

    app.querySelectorAll("[data-st]").forEach(b => b.onclick = () => act(async () => {
      await rpc("admin_set_tournament_status", { p_id: t.id, p_status: b.dataset.st });
    }, "Statut mis à jour. Pense à l'annoncer sur Discord."));
    app.querySelectorAll("[data-rm]").forEach(b => confirmable(b, "Confirmer ?", () => act(() => rpc("admin_remove_team", { p_tournament: t.id, p_team: b.dataset.rm }), "Équipe retirée.")));
    app.querySelectorAll("[data-gen]").forEach(b => confirmable(b, "Confirmer la génération", () => act(async () => {
      const eligible = d.teams.filter(x => t.status !== "checkin" || x.checked_in)
        .map(x => ({ ...x, k: Math.random() })).sort((a, b) => (b.avg_rank ?? -1) - (a.avg_rank ?? -1) || a.k - b.k);
      if (eligible.length < 2) throw new Error(t.status === "checkin" ? "Il faut au moins 2 équipes ayant fait leur check-in." : "Il faut au moins 2 équipes inscrites.");
      const size = Math.max(2, 2 ** Math.ceil(Math.log2(eligible.length)));
      let order = [1]; while (order.length < size) { const n = order.length * 2; order = order.flatMap(s => [s, n + 1 - s]); }
      await rpc("admin_create_bracket", { p_id: t.id, p_order: order.map(s => eligible[s - 1] ? eligible[s - 1].id : null) });
    }, "Bracket généré ! Pense à l'annoncer sur Discord.")));
    if ($("#t-fill")) $("#t-fill").onclick = () => act(async () => { const n = await rpc("admin_fill_test_teams", { p_kind: "cup", p_id: t.id }); toast(n + " équipes de test ajoutées (check-in fait)."); });
    if ($("#t-reset")) confirmable($("#t-reset"), "Confirmer : tous les scores seront effacés", () => act(() => rpc("admin_reset_bracket", { p_id: t.id }), "Bracket réinitialisé."));
    if ($("#t-del")) confirmable($("#t-del"), "Confirmer la suppression définitive", async () => { try { await rpc("admin_delete_tournament", { p_id: t.id }); toast("Tournoi supprimé."); location.hash = "#/tournois"; } catch (x) { toast(errMsg(x), "err"); } });
    if ($("#t-ann")) $("#t-ann").onclick = async () => { const b = $("#t-ann"); b.disabled = true; await announce(t.id, { inscriptions: "inscriptions", checkin: "checkin", en_cours: "bracket", termine: "vainqueur" }[t.status]); b.disabled = false; };

    // Saisie des scores
    app.querySelectorAll(".bk-m.editable").forEach(el => el.onclick = () => {
      const m = d.matches.find(x => x.id === el.dataset.match), a = d.teams.find(x => x.id === m.team1_id), b2 = d.teams.find(x => x.id === m.team2_id);
      app.querySelectorAll(".bk-m.sel").forEach(x => x.classList.remove("sel")); el.classList.add("sel");
      const total = t.rounds;
      $("#score-editor").innerHTML = `<form class="score-form" id="score-form">
        <span class="eyebrow">${roundName(m.round, total)} · BO${m.best_of} · ${m.best_of === 1 ? "score en rounds" : "score en maps"}</span>
        <div class="score-line"><label for="s1">${esc(a ? a.name : "?")}</label><input id="s1" type="number" min="0" max="99" inputmode="numeric" value="${m.score1 ?? ""}">
        <span>–</span><input id="s2" type="number" min="0" max="99" inputmode="numeric" value="${m.score2 ?? ""}"><label for="s2">${esc(b2 ? b2.name : "?")}</label></div>
        <div class="staff-row"><button class="btn sm solid" type="submit">Enregistrer le score</button><button class="link-btn" type="button" id="score-cancel">Annuler</button></div>
        <p class="form-err" id="score-err" role="alert"></p></form>`;
      $("#score-editor").scrollIntoView({ behavior: "smooth", block: "nearest" });
      $("#s1").focus();
      $("#score-cancel").onclick = () => { $("#score-editor").innerHTML = ""; el.classList.remove("sel"); };
      $("#score-form").onsubmit = async e => {
        e.preventDefault(); const s1 = $("#s1").value, s2 = $("#s2").value;
        if (s1 === "" || s2 === "") { $("#score-err").textContent = "Entre les deux scores."; return; }
        try {
          await rpc("admin_report_score", { p_match: m.id, p_score1: +s1, p_score2: +s2 });
          const done = m.round === total;
          toast(done ? "Finale enregistrée : le tournoi est terminé ! Annonce le vainqueur sur Discord." : "Score enregistré.");
          reload();
        } catch (x) { $("#score-err").textContent = errMsg(x); }
      };
    });
  }

  // ================= Compétitions (Cups + League) =================
  const L_STATUS = { brouillon: "Brouillon", inscriptions: "Inscriptions ouvertes", en_cours: "En cours", termine: "Terminée" };
  const L_PILL = { brouillon: "wait", inscriptions: "ok", en_cours: "live", termine: "done" };
  const lPill = s => `<span class="pill t-${L_PILL[s]}">${L_STATUS[s]}</span>`;
  const compFilter = { div: null, type: "all", init: null };
  const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const dateTile = iso => {
    if (!iso) return `<div class="date-tile empty"><b>?</b><span>date à venir</span></div>`;
    const d = new Date(iso);
    return `<div class="date-tile"><b>${d.getDate()}</b><span>${MONTHS[d.getMonth()]}</span><small>${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</small></div>`;
  };

  async function viewTournaments(app) {
    if (!sb) { app.innerHTML = panel("Compétitions", `<p class="lead">Bientôt disponible.</p>`); return; }
    const [cups, leagues] = await Promise.all([rpc("list_tournaments"), rpc("list_leagues").catch(() => [])]);
    // Division par défaut : celle de mon équipe (une fois par compte)
    const who = state.session ? state.session.user.id : "";
    if (compFilter.init !== who) {
      compFilter.init = who;
      compFilter.div = state.team && state.team.status === "validee" && state.team.division ? state.team.division : null;
    }
    renderComps(app, cups, leagues);
  }

  // Affichage de la page Compétitions : les filtres ne refont pas de requête
  function renderComps(app, cups, leagues) {
    const items = [
      ...cups.map(t => ({ kind: "cup", id: t.id, name: t.name, division: t.division, date: t.starts_at, status: t.status,
        live: t.status === "en_cours", open: ["inscriptions", "checkin"].includes(t.status), done: t.status === "termine",
        type: /PRIZM League · Playoffs/.test(t.name) ? "Playoffs" : "Cup", test: t.is_test, places: `${t.teams} / ${t.max_teams} équipes`,
        format: `BO${t.best_of} · finale BO${t.final_best_of}`, pill: tPill(t.status), href: "#/tournoi/" + t.id,
        result: t.winner_name ? { label: "Vainqueur", name: t.winner_name, tag: t.winner_tag, logo: t.winner_logo } : null })),
      ...leagues.map(l => ({ kind: "league", id: l.id, name: l.name, division: l.division, date: l.starts_at, status: l.status,
        live: l.status === "en_cours", open: l.status === "inscriptions", done: l.status === "termine",
        type: "League", test: l.is_test, places: `${l.teams} / ${l.max_teams} équipes`, format: `Saison régulière · BO${l.best_of}`, pill: lPill(l.status), href: "#/league/" + l.id,
        result: l.leader_name ? { label: l.status === "termine" ? "1er" : "En tête", name: l.leader_name, tag: l.leader_tag, logo: l.leader_logo } : null })),
    ];
    const shown = items.filter(x => (!compFilter.div || x.division === compFilter.div) &&
      (compFilter.type === "all" || (compFilter.type === "cup" ? x.kind === "cup" : x.kind === "league")));
    const byDate = (a, b) => (a.date ? new Date(a.date) : Infinity) - (b.date ? new Date(b.date) : Infinity);
    const live = shown.filter(x => x.live).sort(byDate);
    const next = shown.filter(x => !x.live && !x.done).sort((a, b) => (b.open - a.open) || byDate(a, b));
    const done = shown.filter(x => x.done).sort((a, b) => -byDate(a, b));

    const typeBadge = x => `<span class="type-badge ${x.kind}">${x.type}</span>${x.test ? testBadge : ""}`;
    const resultHtml = x => x.result ? `<span class="row-result">${teamLogo({ logo_url: x.result.logo, tag: x.result.tag }, 26)}<span><small>${x.result.label}</small>${esc(x.result.name)}</span></span>` : "";
    const row = x => `<a class="comp-row${x.open ? " open" : ""}" href="${x.href}">
        ${dateTile(x.date)}
        <span class="comp-main"><span class="comp-tags">${divChip(x.division)}${typeBadge(x)}${x.pill}</span>
          <b class="comp-name">${esc(x.name)}</b><span class="small-note">${x.format} · ${x.places}</span></span>
        ${x.done ? resultHtml(x) : `<span class="comp-cta">${x.open ? "S'inscrire →" : x.live ? "Suivre →" : "Voir →"}</span>`}
      </a>`;
    const liveCard = x => `<a class="live-card" href="${x.href}">
        <span class="comp-tags">${divChip(x.division)}${typeBadge(x)}${x.pill}</span>
        <b class="comp-name">${esc(x.name)}</b>
        <span class="small-note">${x.format} · ${x.places}</span>
        ${x.result ? resultHtml(x) : ""}
        <span class="comp-cta">${x.kind === "cup" ? "Voir le bracket en direct →" : "Voir le classement →"}</span></a>`;
    const chip = (key, val, label) => `<button type="button" class="f-chip${compFilter[key] === val ? " on" : ""}" data-f="${key}" data-v="${val ?? ""}" aria-pressed="${compFilter[key] === val}">${label}</button>`;

    app.innerHTML = panel("Compétitions", `
      <p class="lead">Les PRIZM Cup se jouent en une soirée, en élimination directe. La PRIZM League est une saison où chaque équipe affronte toutes les autres, avant des playoffs pour le top 4.</p>
      <div class="filters" role="group" aria-label="Filtres">
        <div class="f-group"><span class="eyebrow">Division</span>${chip("div", null, "Toutes")}${[1, 2, 3, 4].map(d => chip("div", d, "D" + d)).join("")}</div>
        <div class="f-group"><span class="eyebrow">Type</span>${chip("type", "all", "Tout")}${chip("type", "cup", "Cups")}${chip("type", "league", "League")}</div>
      </div>
      ${state.isStaff ? `<div class="staff-row" style="margin-top:8px"><a class="btn sm solid" href="#/tournoi/nouveau">Créer une Cup</a><a class="btn sm" href="#/league/nouveau">Créer une saison de League</a></div>` : ""}
      ${live.length ? `<section class="comp-sec"><h3><span class="live-dot"></span>En direct</h3><div class="live-grid">${live.map(liveCard).join("")}</div></section>` : ""}
      <section class="comp-sec"><h3>Prochainement</h3>${next.length ? `<div class="comp-list">${next.map(row).join("")}</div>` : `<p class="small-note">Rien de prévu${compFilter.div ? " en D" + compFilter.div : ""} pour l'instant. Les annonces arrivent sur le Discord.</p>`}</section>
      <section class="comp-sec"><h3>Résultats</h3>${done.length ? `<div class="comp-list">${done.map(row).join("")}</div>` : `<p class="small-note">Pas encore de compétition terminée${compFilter.div ? " en D" + compFilter.div : ""}.</p>`}</section>`, "Compétition");
    app.querySelectorAll(".f-chip").forEach(b => b.onclick = () => {
      const k = b.dataset.f; compFilter[k] = k === "div" ? (b.dataset.v ? +b.dataset.v : null) : b.dataset.v; renderComps(app, cups, leagues);
    });
  }

  // ---------- League ----------
  async function viewLeagueForm(app, l) {
    if (!state.isStaff) { app.innerHTML = panel("Accès refusé", `<p class="lead">Réservé au staff.</p>`); return; }
    const v = l || { division: 2, starts_at: null, max_teams: 8, best_of: 1, description: "" };
    const locked = l && ["en_cours", "termine"].includes(l.status);
    const opt = (vals, cur, lab = x => x) => vals.map(x => `<option value="${x}" ${+cur === x ? "selected" : ""}>${lab(x)}</option>`).join("");
    let seasons = [];
    if (!l) { try { seasons = await rpc("list_leagues"); } catch (e) {} }
    app.innerHTML = panel(l ? "Modifier la saison" : "Nouvelle saison de League", `
      <form class="form" id="l-form" novalidate>
        ${l ? `<label>Nom</label><p class="t-name-fixed">${esc(l.name)}</p>` : ""}
        <label for="l-div">Division</label><select id="l-div" ${l ? "disabled" : ""}>${opt([1, 2, 3, 4], v.division, d => DIV_NAMES[d])}</select>
        ${l ? "" : `<p class="t-name-preview">Nom : <b id="l-name-preview"></b></p>`}
        <label for="l-date">Date de début</label><input id="l-date" type="datetime-local" value="${toLocalInput(v.starts_at)}">
        <label for="l-max">Nombre d'équipes maximum</label><select id="l-max" ${locked ? "disabled" : ""}>${opt([4, 5, 6, 7, 8, 9, 10, 11, 12], v.max_teams)}</select>
        <span class="hint">Chaque équipe joue une fois contre toutes les autres : 8 équipes = 7 journées.</span>
        <label for="l-bo">Format des matchs</label><select id="l-bo" ${locked ? "disabled" : ""}>${opt([1, 3, 5], v.best_of, x => "BO" + x)}</select>
        <label for="l-desc">Description (optionnelle)</label><textarea id="l-desc" rows="4" maxlength="1000" placeholder="Jour des matchs, récompenses…">${esc(v.description || "")}</textarea>
        ${l ? "" : testBox("l-test")}
        <div class="ctas"><button class="btn solid" type="submit">${l ? "Enregistrer" : "Créer la saison"}</button><a class="btn" href="${l ? "#/league/" + l.id : "#/tournois"}">Annuler</a></div>
        <p class="form-err" id="l-err" role="alert"></p>
      </form>`, "Staff");
    const preview = () => { if (l) return; const d = +$("#l-div").value;
      if ($("#l-test").checked) { $("#l-name-preview").textContent = `Test · PRIZM League · D${d}`; return; }
      const n = seasons.filter(s => s.division === d && !s.is_test).reduce((m, s) => Math.max(m, s.season), 0) + 1; $("#l-name-preview").textContent = `PRIZM League · Saison ${n} · D${d}`; };
    if (!l) { $("#l-div").onchange = preview; $("#l-test").onchange = preview; preview(); }
    $("#l-form").onsubmit = async e => {
      e.preventDefault(); const err = $("#l-err"); err.textContent = ""; const date = $("#l-date").value;
      try {
        const id = await rpc("admin_save_league", { p_id: l ? l.id : null, p_division: +$("#l-div").value, p_starts_at: date ? new Date(date).toISOString() : null,
          p_max_teams: +$("#l-max").value, p_best_of: +$("#l-bo").value, p_description: $("#l-desc").value, p_is_test: !l && $("#l-test").checked });
        toast(l ? "Saison enregistrée." : "Saison créée en brouillon."); location.hash = "#/league/" + id;
      } catch (x) { err.textContent = errMsg(x); }
    };
  }

  async function announceLeague(lid, event) {
    try {
      const { error } = await sb.functions.invoke("tournament-announce", { body: { league_id: lid, event } });
      if (error) { let m = null; try { m = (await error.context.json()).error; } catch (e) {} toast(m || "Annonce Discord impossible.", "err"); return; }
      toast("Annonce publiée sur Discord.");
    } catch (e) { toast("Annonce Discord impossible.", "err"); }
  }

  async function viewLeague(app, id) {
    if (id === "nouveau") return viewLeagueForm(app, null);
    if (id.endsWith("/modifier")) { const d = await rpc("league_detail", { p_id: id.slice(0, -9) }); return viewLeagueForm(app, d.league); }
    const d = await rpc("league_detail", { p_id: id });
    const l = d.league;
    if (!l) { app.innerHTML = panel("Saison introuvable", `<p class="lead">Cette saison n'existe pas ou n'est pas encore publiée.</p><div class="ctas"><a class="btn" href="#/tournois">Compétitions</a></div>`); return; }
    const st = d.standings, staff = state.isStaff;
    const team = tid => st.find(x => x.team_id === tid);
    const my = state.team, isCap = !!(my && my.is_captain);
    const reg = my ? team(my.id) : null;

    let action = "";
    if (l.status === "inscriptions") {
      if (!state.session) action = `<p>Connecte-toi avec Discord pour inscrire ton équipe.</p><button class="btn solid" id="l-login" type="button">${discordIcon()} Connexion</button>`;
      else if (!my) action = `<p>Tu n'as pas encore d'équipe.</p><a class="btn" href="#/mon-equipe">Créer ou rejoindre une équipe</a>`;
      else if (reg) action = `<p class="ok-line">✓ <b>${esc(my.name)}</b> est inscrite à la saison.</p>${isCap ? `<button class="link-btn danger-t" id="l-unreg" type="button">Désinscrire mon équipe</button>` : ""}`;
      else if (!isCap) action = `<p>Seul le capitaine de <b>${esc(my.name)}</b> peut inscrire l'équipe.</p>`;
      else if (my.status !== "validee") action = `<p>Ton équipe doit d'abord être validée par le staff.</p>`;
      else if (my.division !== l.division) action = `<p>Cette saison est réservée à la ${DIV_NAMES[l.division]}. Ton équipe est en ${DIV_NAMES[my.division]}.</p>`;
      else if (st.length >= l.max_teams) action = `<p>La saison est complète.</p>`;
      else action = `<p>Inscris <b>${esc(my.name)}</b> à cette saison.</p><button class="btn solid" id="l-reg" type="button">Inscrire mon équipe</button>`;
    }

    const started = ["en_cours", "termine"].includes(l.status);
    const table = st.length ? `<div class="table-scroll"><table class="standings">
      <thead><tr><th>#</th><th>Équipe</th><th title="Matchs joués">J</th><th title="Victoires">V</th><th title="Défaites">D</th><th title="Différence de ${l.best_of === 1 ? "rounds" : "maps"}">+/-</th><th>Pts</th></tr></thead>
      <tbody>${st.map((r, i) => `<tr class="${started && i < 4 ? "po" : ""}${my && r.team_id === my.id ? " me" : ""}">
        <td class="pos">${i + 1}</td><td><span class="pl">${teamLogo(r, 28)}<b>${esc(r.name)}</b><span class="tag-chip">${esc(r.tag)}</span></span></td>
        <td>${r.played}</td><td>${r.wins}</td><td>${r.losses}</td><td>${r.diff > 0 ? "+" : ""}${r.diff}</td><td class="pts">${r.points}</td>
        ${staff && !started ? `<td><button class="link-btn danger-t" data-rm="${r.team_id}" type="button">Retirer</button></td>` : ""}</tr>`).join("")}</tbody></table></div>
      ${started ? `<p class="small-note legend"><span class="po-mark"></span>Top 4 : qualifiés pour les playoffs · 3 points par victoire, départage à la différence de ${l.best_of === 1 ? "rounds" : "maps"}.</p>` : ""}`
      : `<p class="small-note">Aucune équipe inscrite pour l'instant.</p>`;

    const weeks = [...new Set(d.matches.map(m => m.week))].sort((a, b) => a - b);
    const nextWeek = weeks.find(w => d.matches.some(m => m.week === w && !m.winner_id));
    const side = (tid, sc, win) => { const t = team(tid); return `<span class="lm-team${win ? " win" : ""}">${t ? teamLogo(t, 24) : ""}<span>${t ? esc(t.name) : "Équipe supprimée"}</span></span><span class="lm-sc${win ? " win" : ""}">${sc ?? "–"}</span>`; };
    const schedule = weeks.length ? weeks.map(w => `<details class="week"${w === nextWeek || (!nextWeek && w === weeks[weeks.length - 1]) ? " open" : ""}>
        <summary>Journée ${w}<span class="small-note">${d.matches.filter(m => m.week === w && m.winner_id).length} / ${d.matches.filter(m => m.week === w).length} joués</span></summary>
        <div class="week-list">${d.matches.filter(m => m.week === w).map(m => `<${staff && l.status === "en_cours" ? `button type="button"` : "div"} class="lm${staff && l.status === "en_cours" ? " editable" : ""}" data-lm="${m.id}">
          <span class="lm-side l">${side(m.team1_id, m.score1, m.winner_id && m.winner_id === m.team1_id)}</span><span class="lm-vs">vs</span><span class="lm-side r">${side(m.team2_id, m.score2, m.winner_id && m.winner_id === m.team2_id)}</span>
        </${staff && l.status === "en_cours" ? "button" : "div"}>`).join("")}</div></details>`).join("") : "";

    let staffHtml = "";
    if (staff) {
      const b = [];
      if (l.status === "brouillon") b.push(`<button class="btn sm solid" data-lst="inscriptions" type="button">Ouvrir les inscriptions</button>`);
      if (l.status === "inscriptions") b.push(`<button class="btn sm solid" id="l-gen" type="button">Générer le calendrier et lancer la saison</button>`, `<button class="link-btn" data-lst="brouillon" type="button">Repasser en brouillon</button>`);
      if (l.status === "en_cours") b.push(`<button class="btn sm solid" id="l-po" type="button">Créer les playoffs (top 4) et terminer</button>`, `<button class="btn sm" data-lst="termine" type="button">Terminer sans playoffs</button>`, `<button class="link-btn danger-t" id="l-reset" type="button">Réinitialiser le calendrier</button>`);
      if (l.status === "termine" && !l.playoffs_tournament_id) b.push(`<button class="btn sm" data-lst="en_cours" type="button">Rouvrir la saison</button>`);
      if (l.is_test && ["brouillon", "inscriptions"].includes(l.status) && st.length < l.max_teams) b.unshift(`<button class="btn sm" id="l-fill" type="button">Ajouter des équipes de test</button>`);
      const ann = l.is_test ? null : { inscriptions: ["inscriptions", "Annoncer les inscriptions"], en_cours: ["classement", "Publier le classement"], termine: ["classement", "Publier le classement final"] }[l.status];
      staffHtml = `<div class="card staff-card"><h3>Staff</h3>
        <div class="staff-row">${b.join("")}</div>
        <div class="staff-row">${ann ? `<button class="btn sm" data-ann="${ann[0]}" type="button">${ann[1]} sur Discord</button>` : ""}${l.status === "en_cours" && !l.is_test ? `<button class="btn sm" data-ann="calendrier" type="button">Annoncer le début de saison</button>` : ""}
          <a class="link-btn" href="#/league/${l.id}/modifier">Modifier</a><button class="link-btn danger-t" id="l-del" type="button">Supprimer la saison</button></div>
        ${l.status === "en_cours" ? `<p class="small-note">Clique sur un match du calendrier pour saisir ou corriger son score.</p>` : ""}
        ${l.status === "inscriptions" ? `<p class="small-note">Il faut au moins 3 équipes. L'ordre des matchs est tiré au sort.</p>` : ""}
        <div id="score-editor"></div></div>`;
    }

    app.innerHTML = panel(esc(l.name), `
      <div class="t-meta">${divChip(l.division)}<span class="type-badge league">League</span>${lPill(l.status)}<span>Début : ${esc(fmtDate(l.starts_at))}</span><span>BO${l.best_of}</span><span>${st.length} / ${l.max_teams} équipes</span></div>
      ${l.description ? `<p class="lead t-desc">${esc(l.description)}</p>` : ""}
      ${l.is_test ? testCallout : ""}
      ${l.playoffs_tournament_id ? `<a class="card po-link" href="#/tournoi/${l.playoffs_tournament_id}"><b>🏆 Playoffs de la saison</b><span>Voir le bracket →</span></a>` : ""}
      ${action ? `<div class="card t-action">${action}<p class="form-err" id="l-err" role="alert"></p></div>` : ""}
      ${staffHtml}
      <div class="league-grid">
        <section><h3 class="t-h">Classement</h3>${table}</section>
        ${weeks.length ? `<section><h3 class="t-h">Calendrier</h3>${schedule}</section>` : ""}
      </div>
      <div class="ctas" style="margin-top:32px"><a class="btn" href="#/tournois">Toutes les compétitions</a></div>`, `League · ${DIV_NAMES[l.division]}`);

    const reload = () => viewLeague(app, id), err = $("#l-err");
    const act = async (fn, okMsg) => { if (err) err.textContent = ""; try { await fn(); if (okMsg) toast(okMsg); reload(); } catch (x) { if (err) err.textContent = errMsg(x); else toast(errMsg(x), "err"); } };
    if ($("#l-login")) $("#l-login").onclick = login;
    if ($("#l-reg")) $("#l-reg").onclick = () => act(() => rpc("register_league", { p_league: l.id }), "Équipe inscrite !");
    if ($("#l-unreg")) confirmable($("#l-unreg"), "Confirmer la désinscription", () => act(() => rpc("unregister_league", { p_league: l.id }), "Équipe désinscrite."));
    if (!staff) return;
    app.querySelectorAll("[data-lst]").forEach(b => b.onclick = () => act(() => rpc("admin_set_league_status", { p_id: l.id, p_status: b.dataset.lst }), "Statut mis à jour."));
    app.querySelectorAll("[data-rm]").forEach(b => confirmable(b, "Confirmer ?", () => act(() => rpc("admin_remove_league_team", { p_league: l.id, p_team: b.dataset.rm }), "Équipe retirée.")));
    app.querySelectorAll("[data-ann]").forEach(b => b.onclick = async () => { b.disabled = true; await announceLeague(l.id, b.dataset.ann); b.disabled = false; });
    if ($("#l-fill")) $("#l-fill").onclick = () => act(async () => { const n = await rpc("admin_fill_test_teams", { p_kind: "league", p_id: l.id }); toast(n + " équipes de test ajoutées."); });
    if ($("#l-gen")) confirmable($("#l-gen"), "Confirmer : la saison démarre", () => act(() => rpc("admin_generate_schedule", { p_league: l.id }), "Calendrier généré ! Pense à l'annoncer sur Discord."));
    if ($("#l-reset")) confirmable($("#l-reset"), "Confirmer : tous les scores seront effacés", () => act(() => rpc("admin_reset_schedule", { p_league: l.id }), "Calendrier réinitialisé."));
    if ($("#l-po")) confirmable($("#l-po"), "Confirmer : la saison sera terminée", async () => {
      try { const tid = await rpc("admin_create_playoffs", { p_league: l.id }); toast("Playoffs créés ! Annonce-les depuis la page du tournoi."); location.hash = "#/tournoi/" + tid; }
      catch (x) { if (err) err.textContent = errMsg(x); else toast(errMsg(x), "err"); }
    });
    if ($("#l-del")) confirmable($("#l-del"), "Confirmer la suppression définitive", async () => { try { await rpc("admin_delete_league", { p_id: l.id }); toast("Saison supprimée."); location.hash = "#/tournois"; } catch (x) { toast(errMsg(x), "err"); } });
    app.querySelectorAll(".lm.editable").forEach(el => el.onclick = () => {
      const m = d.matches.find(x => x.id === el.dataset.lm), a = team(m.team1_id), b2 = team(m.team2_id);
      app.querySelectorAll(".lm.sel").forEach(x => x.classList.remove("sel")); el.classList.add("sel");
      $("#score-editor").innerHTML = `<form class="score-form" id="score-form">
        <span class="eyebrow">Journée ${m.week} · BO${l.best_of} · ${l.best_of === 1 ? "score en rounds" : "score en maps"}</span>
        <div class="score-line"><label for="s1">${esc(a ? a.name : "?")}</label><input id="s1" type="number" min="0" max="99" inputmode="numeric" value="${m.score1 ?? ""}">
        <span>–</span><input id="s2" type="number" min="0" max="99" inputmode="numeric" value="${m.score2 ?? ""}"><label for="s2">${esc(b2 ? b2.name : "?")}</label></div>
        <div class="staff-row"><button class="btn sm solid" type="submit">Enregistrer le score</button>${m.winner_id ? `<button class="link-btn danger-t" type="button" id="score-clear">Effacer le score</button>` : ""}<button class="link-btn" type="button" id="score-cancel">Annuler</button></div>
        <p class="form-err" id="score-err" role="alert"></p></form>`;
      $("#score-editor").scrollIntoView({ behavior: "smooth", block: "nearest" }); $("#s1").focus();
      $("#score-cancel").onclick = () => { $("#score-editor").innerHTML = ""; el.classList.remove("sel"); };
      if ($("#score-clear")) $("#score-clear").onclick = async () => { try { await rpc("admin_report_league_score", { p_match: m.id, p_score1: null, p_score2: null }); toast("Score effacé."); reload(); } catch (x) { $("#score-err").textContent = errMsg(x); } };
      $("#score-form").onsubmit = async e => {
        e.preventDefault(); const s1 = $("#s1").value, s2 = $("#s2").value;
        if (s1 === "" || s2 === "") { $("#score-err").textContent = "Entre les deux scores."; return; }
        try { await rpc("admin_report_league_score", { p_match: m.id, p_score1: +s1, p_score2: +s2 }); toast("Score enregistré, classement mis à jour."); reload(); }
        catch (x) { $("#score-err").textContent = errMsg(x); }
      };
    });
  }

  // ---------- Régie de cast (pilote le HUD OBS) ----------
  const VAL_MAPS = ["Abyss", "Ascent", "Bind", "Breeze", "Corrode", "Fracture", "Haven", "Icebox", "Lotus", "Pearl", "Split", "Sunset"];
  let regieId = "main", regieKeys = null;
  async function viewRegie(app) {
    if (!state.session) return needLogin(app, "Espace réservé au staff.");
    if (!state.isStaff) { app.innerHTML = panel("Accès refusé", `<p class="lead">La régie de cast est réservée au staff.</p>`); return; }
    const R = regieId;
    const [S0, matches] = await Promise.all([rpc("cast_hud", { p_id: R }), rpc("cast_matches")]);
    let S = S0 || {};
    const base = location.origin + location.pathname.replace(/[^/]*$/, "");
    const hudUrl = scene => `${base}hud.html?r=${R}${scene === "versus" ? "&scene=versus" : ""}`;
    const cur = matches.find(m => m.id === S.match_id);
    const optLabel = m => `${m.team1} vs ${m.team2} · ${m.stage}`;
    const groups = [...new Set(matches.map(m => m.title))];

    app.innerHTML = panel("Régie de cast", `
      ${state.isAdmin ? adminTabs("regie") : ""}
      <p class="lead">Choisis le match, puis compte les rounds pendant le cast. Le HUD dans OBS se met à jour tout seul.</p>
      <div class="rg-head">
        <div class="f-group"><span class="eyebrow">Régie</span>
          <button type="button" class="f-chip${R === "main" ? " on" : ""}" data-rg="main">Principale</button><button type="button" class="f-chip${R === "b" ? " on" : ""}" data-rg="b">Régie 2</button></div>
        <div class="rg-links">
          <span class="small-note">Sources navigateur OBS (1920 × 1080) :</span>
          <button class="btn sm" type="button" data-copy="${esc(hudUrl("score"))}">Copier le lien du HUD</button>
          <button class="btn sm" type="button" data-copy="${esc(hudUrl("versus"))}">Copier l'écran entre les maps</button>
          <span class="copied" id="rg-copied" aria-live="polite"></span>
        </div>
      </div>
      <div class="card rg-pick">
        <label for="rg-match">Match à caster</label>
        <div class="rg-pick-row">
          <select id="rg-match">${matches.length ? `<option value="">Choisis un match…</option>` + groups.map(g => `<optgroup label="${esc(g)}">${matches.filter(m => m.title === g).map(m => `<option value="${m.id}" ${cur && cur.id === m.id ? "selected" : ""}>${esc(optLabel(m))}</option>`).join("")}</optgroup>`).join("")
            : `<option value="">Aucun match en attente : lance un bracket ou un calendrier de League</option>`}</select>
          <button class="btn sm solid" id="rg-load" type="button" ${matches.length ? "" : "disabled"}>Mettre ce match à l'antenne</button>
        </div>
        <p class="small-note">Mettre un match à l'antenne remet le score à 0-0. Pour essayer le HUD sans vrai match : <button class="link-btn" id="rg-demo" type="button">lancer un match de démo</button>.</p>
      </div>
      <div id="rg-board"></div>
      ${S.team1 ? `<div class="rg-preview"><span class="eyebrow">Aperçu du HUD (en direct)</span><div class="rg-frame"><iframe src="${esc(hudUrl("score"))}" title="Aperçu du HUD" loading="lazy"></iframe></div></div>` : ""}`, "Cast");

    const board = $("#rg-board");
    const need = () => Math.ceil((S.best_of || 1) / 2);
    let pending = {}, timer = null, saving = false;
    const status = txt => { const el = $("#rg-status"); if (el) el.textContent = txt; };
    async function flush() {
      if (saving) { timer = setTimeout(flush, 150); return; }
      const patch = pending; pending = {}; timer = null; if (!Object.keys(patch).length) return;
      saving = true; status("Envoi…");
      const { error } = await sb.from("cast_state").update(patch).eq("id", R);
      saving = false; status(error ? "Erreur : " + errMsg(error) : "À jour sur le HUD");
    }
    // Les clics rapprochés sont regroupés en une seule écriture
    const save = patch => {
      const db = { ...patch }; delete db.team1; delete db.team2; // noms et logos : affichage seulement, pas des colonnes
      Object.assign(S, patch); Object.assign(pending, db); drawBoard(); clearTimeout(timer); timer = setTimeout(flush, 250);
    };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function finalScore() {
      const m = matches.find(x => x.id === S.match_id); if (!m) return null;
      const [a, b] = S.best_of > 1 ? [S.maps1, S.maps2] : [S.rounds1, S.rounds2];
      return { m, s1: S.team1_id === m.team1_id ? a : b, s2: S.team1_id === m.team1_id ? b : a, a, b };
    }

    function drawBoard() {
      if (!S.team1 || !S.team2) { board.innerHTML = `<p class="small-note">Aucun match à l'antenne pour l'instant.</p>`; return; }
      const bo = S.best_of, over = bo > 1 && (S.maps1 >= need() || S.maps2 >= need());
      const side = n => { const t = S["team" + n]; return `<div class="rg-side s${n}">
          <div class="rg-team">${teamLogo(t, 44)}<b>${esc(t.name)}</b><span class="tag-chip">${esc(t.tag)}</span></div>
          <div class="rg-count"><span class="eyebrow">Rounds</span>
            <div class="rg-step"><button type="button" class="rg-btn" data-d="rounds${n}" data-v="-1" aria-label="Retirer un round à ${esc(t.name)}">−</button><b>${S["rounds" + n]}</b><button type="button" class="rg-btn plus" data-d="rounds${n}" data-v="1" aria-label="Ajouter un round à ${esc(t.name)}">+</button></div></div>
          ${bo > 1 ? `<div class="rg-count"><span class="eyebrow">Maps gagnées</span>
            <div class="rg-step sm"><button type="button" class="rg-btn" data-d="maps${n}" data-v="-1" aria-label="Retirer une map à ${esc(t.name)}">−</button><b>${S["maps" + n]}</b><button type="button" class="rg-btn" data-d="maps${n}" data-v="1" aria-label="Ajouter une map à ${esc(t.name)}">+</button></div>
            <button type="button" class="btn sm" data-mapwin="${n}" ${over ? "disabled" : ""}>Map gagnée par ${esc(t.tag)}</button></div>` : ""}
        </div>`; };
      const fs = finalScore();
      board.innerHTML = `<div class="rg-live">
          <div class="rg-meta">${divChip(S.division)}<b>${esc(S.title || "")}</b><span>${esc(S.stage || "")} · BO${bo}</span><span class="rg-status" id="rg-status" aria-live="polite"></span></div>
          <div class="rg-board">${side(1)}<button type="button" class="rg-swap" id="rg-swap" title="Inverser les côtés (gauche / droite)">⇄<span>Inverser</span></button>${side(2)}</div>
          <div class="rg-opts">
            <label for="rg-map">Map en cours</label>
            <select id="rg-map"><option value="">—</option>${VAL_MAPS.map(m => `<option ${S.map_name === m ? "selected" : ""}>${m}</option>`).join("")}</select>
            <button type="button" class="btn sm" id="rg-vis">${S.visible ? "Masquer le HUD" : "Afficher le HUD"}</button>
            <button type="button" class="link-btn" id="rg-zero">Rounds à 0-0</button>
          </div>
          <p class="small-note">Raccourcis clavier : <kbd>A</kbd> round pour la gauche, <kbd>L</kbd> round pour la droite, <kbd>Z</kbd> annule le dernier round.</p>
        </div>
        <div class="card rg-end">
          <h3>Fin du match</h3>
          ${fs ? `<p>Résultat envoyé au ${S.match_kind === "cup" ? "bracket" : "classement"} : <b>${esc(S.team1.name)} ${fs.a} – ${fs.b} ${esc(S.team2.name)}</b>${bo > 1 ? " (maps)" : " (rounds)"}.</p>
            <button type="button" class="btn solid" id="rg-final" ${fs.a === fs.b || (bo > 1 && !over) ? "disabled" : ""}>Enregistrer le résultat sur le site</button>
            <p class="small-note">${bo > 1 ? (over ? "Série terminée : tu peux enregistrer." : `Disponible quand une équipe a ${need()} maps.`) : fs.a === fs.b ? "Il faut un vainqueur pour enregistrer." : "Vérifie le score des rounds avant d'enregistrer."}</p>`
            : !S.match_id ? `<p class="small-note">Match de démo : rien n'est enregistré sur le site.</p>`
            : `<p class="small-note">Ce match est déjà enregistré sur le site, ou n'est plus en cours.</p>`}
          <p class="form-err" id="rg-err" role="alert"></p>
        </div>`;

      board.querySelectorAll("[data-d]").forEach(b => b.onclick = () => {
        const k = b.dataset.d, max = k.startsWith("maps") ? need() : 99; save({ [k]: clamp(S[k] + +b.dataset.v, 0, max) }); });
      board.querySelectorAll("[data-mapwin]").forEach(b => b.onclick = () => {
        const n = b.dataset.mapwin; save({ ["maps" + n]: clamp(S["maps" + n] + 1, 0, need()), rounds1: 0, rounds2: 0, map_name: null }); });
      $("#rg-swap").onclick = () => save({ team1_id: S.team2_id, team2_id: S.team1_id, team1: S.team2, team2: S.team1,
        rounds1: S.rounds2, rounds2: S.rounds1, maps1: S.maps2, maps2: S.maps1 });
      $("#rg-map").onchange = e => save({ map_name: e.target.value || null });
      $("#rg-vis").onclick = () => save({ visible: !S.visible });
      $("#rg-zero").onclick = () => save({ rounds1: 0, rounds2: 0 });
      if ($("#rg-final")) confirmable($("#rg-final"), "Confirmer : le résultat sera enregistré", async () => {
        const f = finalScore(); $("#rg-err").textContent = "";
        try {
          await rpc(f.m.kind === "cup" ? "admin_report_score" : "admin_report_league_score", { p_match: f.m.id, p_score1: f.s1, p_score2: f.s2 });
          toast("Résultat enregistré sur le site."); viewRegie(app);
        } catch (x) { $("#rg-err").textContent = errMsg(x); }
      });
    }
    drawBoard();
    const fr = $(".rg-frame", app);
    if (fr) { const fit = () => fr.style.setProperty("--k", fr.clientWidth / 1920); fit(); new ResizeObserver(fit).observe(fr); }

    app.querySelectorAll("[data-rg]").forEach(b => b.onclick = () => { regieId = b.dataset.rg; viewRegie(app); });
    app.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => copyText(b.dataset.copy, $("#rg-copied"), null));
    $("#rg-demo").onclick = async () => {
      try { await rpc("admin_cast_demo", { p_cast: R }); toast("Match de démo à l'antenne : compte des rounds pour voir le HUD bouger."); viewRegie(app); }
      catch (x) { toast(errMsg(x), "err"); }
    };
    $("#rg-load").onclick = async () => {
      const m = matches.find(x => x.id === $("#rg-match").value);
      if (!m) return toast("Choisis un match dans la liste.", "err");
      const patch = { match_kind: m.kind, match_id: m.id, team1_id: m.team1_id, team2_id: m.team2_id, maps1: 0, maps2: 0, rounds1: 0, rounds2: 0,
        best_of: m.best_of, map_name: null, title: m.title, stage: m.stage, division: m.division, visible: true };
      const { error } = await sb.from("cast_state").update(patch).eq("id", R);
      if (error) return toast(errMsg(error), "err");
      toast("Match à l'antenne."); viewRegie(app);
    };
    // Raccourcis clavier (actifs seulement sur cette page)
    let lastKey = null;
    if (regieKeys) document.removeEventListener("keydown", regieKeys);
    regieKeys = e => {
      if (!location.hash.startsWith("#/regie")) { document.removeEventListener("keydown", regieKeys); regieKeys = null; return; }
      if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || e.ctrlKey || e.metaKey || e.altKey || !S.team1) return;
      const k = e.key.toLowerCase();
      if (k === "a") { lastKey = "rounds1"; save({ rounds1: clamp(S.rounds1 + 1, 0, 99) }); }
      else if (k === "l") { lastKey = "rounds2"; save({ rounds2: clamp(S.rounds2 + 1, 0, 99) }); }
      else if (k === "z" && lastKey) { save({ [lastKey]: clamp(S[lastKey] - 1, 0, 99) }); lastKey = null; }
    };
    document.addEventListener("keydown", regieKeys);
  }

  // ---------- Staff ----------
  async function viewStaff(app) {
    if (!state.session) return needLogin(app, "Espace réservé aux admins.");
    if (!state.isAdmin) { app.innerHTML = panel("Accès refusé", `<p class="lead">Seuls les admins peuvent gérer le staff.</p>`); return; }
    const ROLE = { admin: "Admin", arbitre: "Arbitre", joueur: "Joueur" };
    const rowHtml = p => `<div class="staff-person" data-u="${p.id}">
        ${avatar(p.avatar_url, p.username, 36)}
        <div class="sp-main"><b>${esc(p.username)}</b><span class="small-note">${esc(p.riot_id || "Pas de Riot ID")}${p.team_name ? " · " + esc(p.team_name) : ""}</span></div>
        <label class="sr" for="role-${p.id}">Rôle de ${esc(p.username)}</label>
        <select id="role-${p.id}">${["joueur", "arbitre", "admin"].map(r => `<option value="${r}" ${(p.staff_role || "joueur") === r ? "selected" : ""}>${ROLE[r]}</option>`).join("")}</select>
        <button class="btn sm" data-save type="button">Enregistrer</button>
      </div>`;
    const staffList = await rpc("admin_list_players", { p_search: "" });
    app.innerHTML = panel("Staff", `
      ${adminTabs("staff")}
      <div class="roles-explain">
        <div><b>Arbitre</b><p class="small-note">Crée et gère les Cups et la League : inscriptions, check-in, brackets, calendriers, scores, annonces Discord.</p></div>
        <div><b>Admin</b><p class="small-note">Tout ce que fait un arbitre, plus la validation des équipes, les rangs fixés à la main et la gestion du staff.</p></div>
      </div>
      <h3 class="t-h">Membres du staff</h3>
      <div class="staff-list" id="staff-list">${staffList.map(rowHtml).join("")}</div>
      <h3 class="t-h">Ajouter quelqu'un</h3>
      <form class="search-row" id="staff-search" role="search"><label class="sr" for="staff-q">Pseudo Discord ou Riot ID</label>
        <input id="staff-q" placeholder="Pseudo Discord ou Riot ID" autocomplete="off"><button class="btn sm solid" type="submit">Chercher</button></form>
      <p class="small-note">Le joueur doit s'être connecté au moins une fois sur le site.</p>
      <div class="staff-list" id="staff-results"></div>`, "Admin");
    const bind = root => root.querySelectorAll("[data-save]").forEach(b => b.onclick = async () => {
      const row = b.closest(".staff-person");
      try { await rpc("admin_set_staff", { p_user: row.dataset.u, p_role: $("select", row).value }); toast("Rôle mis à jour."); if (row.dataset.u === state.session.user.id) { await loadMe(); renderAuth(); } viewStaff(app); }
      catch (x) { toast(errMsg(x), "err"); }
    });
    bind(app);
    $("#staff-search").onsubmit = async e => {
      e.preventDefault(); const q = $("#staff-q").value.trim(); if (q.length < 2) return;
      const res = await rpc("admin_list_players", { p_search: q });
      $("#staff-results").innerHTML = res.length ? res.map(rowHtml).join("") : `<p class="small-note">Aucun joueur trouvé.</p>`;
      bind($("#staff-results"));
    };
  }

  const adminTabs = cur => `<nav class="admin-tabs" aria-label="Administration"><a href="#/admin" class="${cur === "teams" ? "on" : ""}">Équipes</a><a href="#/staff" class="${cur === "staff" ? "on" : ""}">Staff</a><a href="#/regie" class="${cur === "regie" ? "on" : ""}">Régie de cast</a><a href="#/tournois">Compétitions</a></nav>`;

  // ---------- Vue : admin ----------
  async function viewAdmin(app) {
    if (!state.session) return needLogin(app, "Espace réservé au staff.");
    if (!state.isAdmin) { app.innerHTML = panel("Accès refusé", `<p class="lead">Cet espace est réservé au staff du réseau.</p>`); return; }
    const [all, test] = await Promise.all([rpc("list_teams"), rpc("admin_test_summary").catch(() => null)]);
    const teams = all.filter(t => !t.is_test);
    const order = { en_attente: 0, validee: 1, refusee: 2 };
    teams.sort((a, b) => order[a.status] - order[b.status]);
    const nTest = test ? test.equipes + test.tournois + test.saisons : 0;
    app.innerHTML = panel("Validation des équipes", `
      ${adminTabs("teams")}
      <div class="card test-card">
        <div><h3>Mode test</h3>
          <p class="small-note">Pour tout essayer sans vraies équipes : crée une Cup ou une saison de League en cochant « Compétition de test », puis clique sur « Ajouter des équipes de test ». Pour le HUD : Régie de cast puis « lancer un match de démo ». Les joueurs ne voient rien de tout ça.</p>
          <p class="small-note">${nTest ? `Actuellement : ${test.equipes} équipe(s), ${test.tournois} tournoi(s) et ${test.saisons} saison(s) de test.` : "Aucune donnée de test pour l'instant."}</p></div>
        <div class="staff-row"><a class="btn sm" href="#/tournoi/nouveau?test">Créer une Cup de test</a><a class="btn sm" href="#/league/nouveau?test">Créer une League de test</a>
          ${nTest ? `<button class="btn sm danger" id="del-test" type="button">Supprimer les données de test</button>` : ""}</div>
      </div>
      <p class="lead">${teams.filter(t => t.status === "en_attente").length} équipe(s) en attente. La division estimée est calculée sur la moyenne des titulaires.</p>
      <div class="admin-list">${teams.map(t => `
        <div class="admin-row" data-id="${t.id}">
          <div class="ar-main">${teamLogo(t, 40)}<b>${esc(t.name)}</b><span class="tag-chip">${esc(t.tag)}</span>${statusPill(t)}
            <span class="small-note">Capitaine : ${esc(t.captain)} · ${t.members} joueur(s) · estimée : ${t.suggested ? "D" + t.suggested : "—"}</span></div>
          <div class="ar-actions">
            <label class="sr" for="div-${t.id}">Division</label>
            <select id="div-${t.id}">${[1,2,3,4].map(d => `<option value="${d}" ${(t.division || t.suggested) === d ? "selected" : ""}>D${d}</option>`).join("")}</select>
            <button class="btn sm solid" data-review="validee" type="button">Valider</button>
            <button class="btn sm" data-review="refusee" type="button">Refuser</button>
            <button class="link-btn" data-sync type="button" title="Remet les rôles Discord de cette équipe à jour">Synchro Discord</button>
            <button class="link-btn" data-ranks type="button" title="Redétecte le rang de chaque joueur">Actualiser les rangs</button>
          </div>
          <details class="team-row" data-id="${t.id}"><summary>Voir le roster</summary><div class="roster-slot"></div></details>
        </div>`).join("") || `<p class="small-note">Aucune équipe inscrite pour l'instant.</p>`}</div>`, "Staff");
    if ($("#del-test")) confirmable($("#del-test"), "Confirmer : tout le test sera effacé", async () => {
      try { const r = await rpc("admin_delete_test_data"); toast(`Supprimé : ${r.equipes} équipe(s), ${r.tournois} tournoi(s), ${r.saisons} saison(s) de test.`); viewAdmin(app); }
      catch (x) { toast(errMsg(x), "err"); }
    });
    app.querySelectorAll("[data-review]").forEach(b => b.onclick = async () => {
      const row = b.closest(".admin-row"), id = row.dataset.id;
      try { await rpc("admin_review_team", { p_team: id, p_status: b.dataset.review, p_division: +$("select", row).value });
        toast(b.dataset.review === "validee" ? "Équipe validée." : "Équipe refusée."); await discordSync({ team_id: id }, true); viewAdmin(app); }
      catch (x) { toast(errMsg(x), "err"); }
    });
    app.querySelectorAll("[data-ranks]").forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = "Actualisation…";
      const r = await rankSync({ team_id: b.closest(".admin-row").dataset.id });
      if (r.error) toast(r.error, "err");
      else toast(Object.values(r.results).map(x => (x.username || "?") + " : " + (x.ok ? (x.label || "Non classé") : x.message)).join(" · "));
      viewAdmin(app);
    });
    app.querySelectorAll("[data-sync]").forEach(b => b.onclick = async () => {
      b.disabled = true; await discordSync({ team_id: b.closest(".admin-row").dataset.id }, true); b.disabled = false; });
    bindTeamRows(app, true);
  }

  // ---------- Démarrage ----------
  async function start() {
    // Lien d'invitation : ?join=CODE → mémorisé le temps de la connexion
    const q = new URLSearchParams(location.search);
    // Connexion Discord refusée : Supabase revient avec ?error_description=…, on l'explique au lieu de ne rien afficher
    const hq = new URLSearchParams(location.hash.startsWith("#") && location.hash.includes("error") ? location.hash.slice(1) : "");
    const authErr = q.get("error_description") || hq.get("error_description");
    if (authErr) {
      history.replaceState(null, "", location.pathname + "#top");
      const msg = /email/i.test(authErr)
        ? "Connexion impossible : ton compte Discord n'a pas d'adresse e-mail vérifiée. Va dans Discord > Paramètres > Mon compte, ajoute ou vérifie ton e-mail, puis réessaie."
        : "Connexion Discord impossible : " + authErr;
      setTimeout(() => toast(msg, "err", 12000), 300);
    }
    if (q.get("join")) {
      try { sessionStorage.setItem("prizm_join", q.get("join").toUpperCase()); } catch (e) {}
      history.replaceState(null, "", location.pathname + "#/mon-equipe");
    }
    if (!sb) { renderAuth(); route(); return; }
    const { data } = await sb.auth.getSession();
    state.session = data.session; await loadMe(); renderAuth();
    let after = null; try { after = sessionStorage.getItem("prizm_after_login"); sessionStorage.removeItem("prizm_after_login"); } catch (e) {}
    if (after && state.session && location.hash !== after) { location.hash = after; } else route();
    sb.auth.onAuthStateChange(async (ev, session) => {
      if (ev === "SIGNED_IN" && (!state.session || state.session.user.id !== session.user.id)) {
        state.session = session; await loadMe(); renderAuth(); route();
      } else if (ev === "SIGNED_OUT") { if (state.session) { state.session = null; clearMe(); renderAuth(); route(); } }
      else state.session = session;
    });
  }
  start();
})();
