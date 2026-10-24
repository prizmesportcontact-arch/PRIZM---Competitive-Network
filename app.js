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
    renderAuth(); location.hash = "#/reseau"; route();
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
          ${state.isAdmin ? '<a href="#/admin">Admin</a>' : state.isStaff ? '<a href="#/scrims">Modération des scrims</a>' : ""}
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
  const views = { "/confidentialite": viewPrivacy, "/profil": viewProfile, "/mon-equipe": viewMyTeam, "/equipes": viewTeams, "/admin": viewAdmin, "/staff": viewStaff, "/scrims": viewScrims, "/recherche": viewRecherche, "/classement": viewClassement };
  function route() {
    const h = location.hash || "";
    const path = h.startsWith("#/") ? h.slice(1).split("?")[0] : null;
    const home = $("#view-home"), net = $("#view-network"), app = $("#view-app");
    document.querySelectorAll("header.top nav a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === h));
    stopLive();
    // Deux espaces : la page de l'équipe PRIZM, et le Competitive Network (scrims, comptes, équipes…)
    const anchor = h && !h.startsWith("#/") ? document.getElementById(h.slice(1)) : null;
    const inNet = !!path || (anchor && net.contains(anchor));
    document.body.classList.toggle("area-net", inNet);
    document.body.classList.toggle("area-team", !inNet);
    if (path === "/reseau") {
      home.hidden = true; app.hidden = true; net.hidden = false; window.scrollTo(0, 0);
    } else if (path && views[path]) {
      home.hidden = true; net.hidden = true; app.hidden = false; window.scrollTo(0, 0);
      app.innerHTML = `<div class="wrap app-wrap"><p class="eyebrow">Chargement…</p></div>`;
      views[path](app).catch(e => { app.innerHTML = panel("Oups", `<p class="lead">${esc(errMsg(e))}</p>`); });
    } else {
      app.hidden = true; home.hidden = inNet; net.hidden = !inNet;
      if (anchor) anchor.scrollIntoView(); else window.scrollTo(0, 0);
    }
  }
  window.addEventListener("hashchange", route);

  // Temps réel : une seule connexion ouverte à la fois, fermée quand on change de page
  let live = null;
  function stopLive() { if (live && sb) { sb.removeChannel(live); } live = null; }

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
    : `<span class="team-logo team-logo-empty" style="width:${size}px;height:${size}px;font-size:${Math.max(10, Math.round(size * 0.36))}px">${esc((t && t.tag || "?").slice(0, 3))}</span>`;

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
        <p class="lead">PRIZM Competitive Network est un réseau communautaire et bénévole de scrims Valorant. Cette page explique quelles données le site enregistre, pourquoi, et comment les faire supprimer.</p>
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
          <li>Placer ton équipe dans la bonne division et organiser les scrims, la recherche d'équipe et le classement.</li>
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
    const locked = t.locked; // compétition en cours : arrivées et départs bloqués

    app.innerHTML = panel(`${teamLogo(t, 64)}<span>${esc(t.name)}</span> <span class="tag-chip">${esc(t.tag)}</span>`, `
      <div class="team-status">
        ${statusPill(t)}
        <span class="small-note">${t.status === "validee" ? "Ton équipe peut proposer et accepter des scrims." :
          t.status === "refusee" ? "Contacte le staff dans #support sur le Discord." :
          `Division estimée : <b>${t.suggested ? DIV_NAMES[t.suggested] : "à calculer"}</b>. Le staff valide la division finale.`}</span>
      </div>
      ${t.status === "validee" ? `<div class="callout info">Ton rôle <b>D${t.division}</b> est donné automatiquement sur le Discord PRIZM. Tu dois être sur le serveur pour le recevoir${(CFG.links || {}).discord ? ` : <a href="${esc(CFG.links.discord)}" target="_blank" rel="noopener">rejoindre le Discord</a>` : ""}. Arrivé après la validation ? <button class="link-btn" id="sync-me" type="button">Recevoir mon rôle</button></div>` : ""}
      ${tit < 5 && t.status !== "validee" ? `<div class="callout">Il te faut 5 titulaires pour être validé. Pour l'instant : ${tit}/5.</div>` : ""}
      <div id="team-scrims"></div>
      ${locked ? `<p class="lock-line">🔒 Roster bloqué pendant <b>${esc(locked)}</b> : personne ne peut rejoindre ni quitter l'équipe. Besoin d'un changement ? Ouvre un ticket dans #support.</p>` : ""}
      ${rosterTable(roster, isCap, me, false, !!locked)}
      <div class="roster-tools"><button class="link-btn" id="refresh-ranks" type="button">Actualiser les rangs de l'équipe</button><span class="small-note">✓ = rang vérifié · ? = rang non vérifié</span></div>
      <div class="cards3" style="margin-top:32px">
        <div class="card">
          <h3>Inviter des joueurs</h3>
          <p class="small-note">${locked ? "Les invitations reprennent après la compétition." : "7 joueurs max (5 titulaires + 2 remplaçants). Envoie le lien ou le code."}</p>
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
          <p class="small-note">${locked ? "Impossible pendant une compétition." : isCap ? (roster.length > 1 ? "Tu es capitaine : nomme un autre capitaine avant de partir." : "Tu es seul : quitter supprime l'équipe.") : "Tu pourras rejoindre une autre équipe ensuite."}</p>
          <button class="btn danger" id="leave" type="button" ${locked || (isCap && roster.length > 1) ? "disabled" : ""}>${isCap && roster.length === 1 ? "Supprimer l'équipe" : "Quitter l'équipe"}</button>
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
    teamScrimsBox($("#team-scrims"));

    // Arrivées, départs, rôles, validation, logo : la page se met à jour toute seule
    let pending = null;
    const refresh = () => { clearTimeout(pending); pending = setTimeout(() => { if (location.hash.startsWith("#/mon-equipe")) viewMyTeam(app); }, 600); };
    stopLive();
    live = sb.channel("team-" + teamId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "team_members", filter: "team_id=eq." + teamId }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "team_members", filter: "team_id=eq." + teamId }, refresh)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "team_members" }, p => { if (p.old && p.old.team_id === teamId) refresh(); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "teams", filter: "id=eq." + teamId }, refresh)
      .subscribe();
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

  function rosterTable(roster, isCap, me, admin = false, noKick = false) {
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
          ${noKick ? "" : `<button class="link-btn danger-t" data-act="kick" data-u="${r.user_id}" type="button">Retirer</button>`}`}</td>` : ""}
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
        $(".roster-slot", d).innerHTML = rosterTable(r, false, null, admin) + (admin ? `<p class="small-note open-roster">Roster bloqué pendant une compétition ? <button class="link-btn" data-open-roster type="button">Autoriser les changements pendant 24 h</button></p>` : "");
        if (admin) { const ob = $("[data-open-roster]", d); ob.onclick = async () => {
          try { const until = await rpc("admin_open_roster", { p_team: d.dataset.id }); toast("Changements autorisés jusqu'à " + new Date(until).toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" }) + "."); }
          catch (x) { toast(errMsg(x), "err"); } }; }
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


  // ================= Competitive Network : scrims, recherche, classement =================
  const divChip = d => d ? `<span class="div-chip d${d}">D${d}</span>` : "";
  const fmtDate = iso => iso ? new Date(iso).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "Date à venir";
  const fmtShort = iso => new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const toLocalInput = iso => { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const dateTile = iso => {
    const d = new Date(iso);
    return `<div class="date-tile"><b>${d.getDate()}</b><span>${MONTHS[d.getMonth()]}</span><small>${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</small></div>`;
  };
  const discordLink = (id, label) => id ? `<a class="link-btn" href="https://discord.com/users/${esc(id)}" target="_blank" rel="noopener">${label}</a>` : "";
  const chipRow = (key, cur, opts, label) => `<div class="f-group"><span class="eyebrow">${label}</span>${opts.map(([v, l]) =>
    `<button type="button" class="f-chip${cur === v ? " on" : ""}" data-f="${key}" data-v="${v ?? ""}" aria-pressed="${cur === v}">${l}</button>`).join("")}</div>`;
  // Prévient le Discord (le bot poste ou met à jour le message). Si le bot n'est pas prêt, on ne bloque rien.
  const feed = (type, id) => { if (sb) sb.functions.invoke("discord-feed", { body: { type, id } }).catch(() => {}); };

  // Accueil : les 4 prochaines propositions ouvertes
  async function homeScrims() {
    const box = $("#home-scrims"); if (!box || !sb) return;
    try {
      const d = await rpc("list_scrims"), list = d.open.slice(0, 4);
      box.innerHTML = list.length ? `<div class="sc-list">${list.map(s => `<a class="sc-row link-row" href="#/scrims">${dateTile(s.starts_at)}<div class="sc-main"><span class="sc-team">${sideName(s.host)}${divChip(s.division)}</span><span class="small-note">${esc(s.format)}</span></div></a>`).join("")}</div>`
        : `<p class="small-note">Aucune proposition en ce moment. Inscris ton équipe et lance la première !</p>`;
    } catch (e) { box.innerHTML = `<p class="small-note">Les propositions s'affichent ici dès que les scrims sont ouverts.</p>`; }
  }

  // ---------- Scrims ----------
  const SCRIM_FORMATS = ["24 rounds", "2 maps", "BO1", "BO3"];
  const scrimFilter = { div: undefined };
  async function viewScrims(app) {
    if (!sb) { app.innerHTML = panel("Scrims", `<p class="lead">Bientôt disponible.</p>`); return; }
    const data = await rpc("list_scrims");
    const t = state.team, isCap = !!(t && t.is_captain), canPlay = isCap && t.status === "validee";
    if (scrimFilter.div === undefined) scrimFilter.div = t && t.status === "validee" ? t.division : null;
    const render = () => {
      const open = data.open.filter(s => !scrimFilter.div || Math.abs(s.division - scrimFilter.div) <= (scrimFilter.div === (t && t.division) ? 1 : 0));
      app.innerHTML = panel("Scrims", `
        <p class="lead">Propose un créneau ou accepte celui d'une autre équipe. Tu peux jouer contre ta division et les divisions voisines.</p>
        ${canPlay ? `<details class="card post-card"${data.open.some(s => s.host.id === t.id) || data.mine.length ? "" : " open"}><summary><b>Proposer un scrim</b></summary>
          <form class="form scrim-form" id="scrim-form" novalidate>
            <div class="form-grid">
              <div><label for="sc-date">Date et heure</label><input id="sc-date" type="datetime-local" required min="${toLocalInput(new Date(Date.now() + 15 * 60000).toISOString())}"></div>
              <div><label for="sc-format">Format</label><select id="sc-format">${SCRIM_FORMATS.map(f => `<option>${f}</option>`).join("")}</select></div>
            </div>
            <label for="sc-maps">Maps (optionnel)</label><input id="sc-maps" maxlength="60" placeholder="ex : Ascent + Lotus, ou « au choix »">
            <label for="sc-note">Message (optionnel)</label><input id="sc-note" maxlength="200" placeholder="ex : on travaille nos rétakes">
            <div class="ctas"><button class="btn solid" type="submit">Publier la proposition</button></div>
            <p class="form-err" id="sc-err" role="alert"></p>
          </form></details>`
          : state.session ? `<p class="callout">${t ? (isCap ? "Ton équipe doit d'abord être validée par le staff pour scrimer." : `Seul le capitaine de <b>${esc(t.name)}</b> peut proposer ou accepter un scrim.`) : `Il te faut une équipe pour scrimer. <a href="#/mon-equipe">Crée ou rejoins une équipe</a>, ou passe par la <a href="#/recherche">recherche d'équipe</a>.`}</p>`
          : `<p class="callout">Connecte-toi avec Discord pour proposer ou accepter un scrim. <button class="link-btn" id="sc-login" type="button">Connexion</button></p>`}
        ${t && data.mine.length ? `<section class="sc-sec"><h3 class="t-h">Nos scrims</h3><div class="sc-list">${data.mine.map(s => mineRow(s, t, isCap)).join("")}</div></section>` : ""}
        <section class="sc-sec"><h3 class="t-h">Propositions ouvertes</h3>
          <div class="filters">${chipRow("div", scrimFilter.div, [[null, "Toutes"], [1, "D1"], [2, "D2"], [3, "D3"], [4, "D4"]], "Division")}</div>
          ${open.length ? `<div class="sc-list">${open.map(s => openRow(s, t, canPlay)).join("")}</div>`
            : `<p class="small-note">Aucune proposition${scrimFilter.div ? " autour de la D" + scrimFilter.div : ""} pour l'instant. ${canPlay ? "Lance la tienne !" : ""}</p>`}
        </section>
        ${state.isStaff && data.staff && data.staff.length ? `<details class="sc-sec staff-sc"><summary><b>Modération</b> · scrims des 14 derniers jours</summary>
          <div class="sc-list">${data.staff.map(staffRow).join("")}</div></details>` : ""}`, "Scrims");
      bindScrims(app, data, () => viewScrims(app), render);
    };
    render();
  }
  const sideName = x => x ? `${teamLogo(x, 28)}<b>${esc(x.name)}</b>` : `<span class="small-note">En attente d'un adversaire</span>`;
  function openRow(s, t, canPlay) {
    const mine = t && s.host.id === t.id;
    const can = canPlay && !mine && Math.abs(s.division - t.division) <= 1;
    return `<div class="sc-row">${dateTile(s.starts_at)}
      <div class="sc-main"><span class="sc-team">${sideName(s.host)}${divChip(s.division)}</span>
        <span class="small-note">${esc(s.format)}${s.maps ? " · " + esc(s.maps) : ""}${s.note ? " · « " + esc(s.note) + " »" : ""}</span></div>
      <div class="sc-act">${mine ? `<span class="small-note">Ta proposition</span><button class="link-btn danger-t" data-cancel="${s.id}" type="button">Retirer</button>`
        : can ? `<button class="btn sm solid" data-accept="${s.id}" type="button">Accepter</button>` : ""}</div></div>`;
  }
  function mineRow(s, t, isCap) {
    const home = s.host.id === t.id, opp = home ? s.guest : s.host;
    const started = new Date(s.starts_at) <= new Date(), late15 = Date.now() >= new Date(s.starts_at).getTime() + 15 * 60000;
    const ours = home ? s.host_score : s.guest_score, theirs = home ? s.guest_score : s.host_score;
    let st = "", act = "";
    if (s.status === "annule") st = `<span class="pill bad">Annulé${s.cancel_late ? " (tard)" : ""}</span>`;
    else if (s.status === "cale" && !started) {
      st = `<span class="pill ok">Calé</span>`;
      if (isCap) act = `${discordLink(opp && opp.discord_id, "Contacter " + esc(opp ? opp.captain || "le capitaine" : ""))}<button class="link-btn danger-t" data-cancel="${s.id}" type="button">${home ? "Annuler" : "Se désister"}</button>`;
    } else if (s.status === "cale") {
      st = `<span class="pill wait">À déclarer</span>`;
      if (isCap) act = `<button class="btn sm" data-report="${s.id}" type="button">Envoyer le résultat</button>${late15 ? `<button class="link-btn danger-t" data-noshow="${s.id}" type="button">Adversaire absent</button>` : ""}`;
    } else if (s.status === "termine" && s.no_show) st = `<span class="pill bad">${s.no_show === t.id ? "Absence notée pour nous" : "Adversaire absent"}</span>`;
    else if (s.status === "termine") {
      st = `<span class="sc-score${ours > theirs ? " win" : ours < theirs ? " lose" : ""}">${ours} – ${theirs}</span>`;
      if (!s.confirmed && s.reported_by !== t.id) { st += `<span class="small-note">déclaré par l'adversaire</span>`; if (isCap) act = `<button class="btn sm solid" data-confirm="${s.id}" type="button">Confirmer</button><button class="link-btn danger-t" data-refuse="${s.id}" type="button">Pas d'accord</button>`; }
      else if (!s.confirmed) st += `<span class="small-note">en attente de l'adversaire</span>`;
    }
    return `<div class="sc-row" data-s="${s.id}">${dateTile(s.starts_at)}
      <div class="sc-main"><span class="sc-team">vs ${sideName(opp)}</span><span class="small-note">${esc(s.format)}${s.maps ? " · " + esc(s.maps) : ""}</span></div>
      <div class="sc-act">${st}${act}</div><div class="sc-form" hidden></div></div>`;
  }
  function staffRow(s) {
    const res = s.no_show ? `absence de ${esc(s.no_show === s.host.id ? s.host.tag : s.guest && s.guest.tag)}` : s.host_score != null ? `${s.host_score} – ${s.guest_score}${s.confirmed ? "" : " (non confirmé)"}` : s.status === "cale" ? "calé" : s.status;
    return `<div class="sc-row">${dateTile(s.starts_at)}<div class="sc-main"><span class="sc-team">${esc(s.host.tag)} vs ${esc(s.guest ? s.guest.tag : "?")}</span><span class="small-note">${res}</span></div>
      <div class="sc-act"><button class="link-btn" data-sreset="${s.id}" type="button">Remettre à zéro</button><button class="link-btn danger-t" data-sdel="${s.id}" type="button">Supprimer</button></div></div>`;
  }
  function bindScrims(app, data, reload, rerender) {
    const err = $("#sc-err");
    if ($("#sc-login")) $("#sc-login").onclick = login;
    app.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { scrimFilter.div = b.dataset.v ? +b.dataset.v : null; rerender(); });
    if ($("#scrim-form")) $("#scrim-form").onsubmit = async e => {
      e.preventDefault(); err.textContent = "";
      const d = $("#sc-date").value; if (!d) return err.textContent = "Choisis la date et l'heure.";
      try {
        const id = await rpc("post_scrim", { p_starts_at: new Date(d).toISOString(), p_format: $("#sc-format").value, p_maps: $("#sc-maps").value, p_note: $("#sc-note").value });
        feed("scrim", id); toast("Proposition publiée. Elle apparaît aussi sur le Discord."); reload();
      } catch (x) { err.textContent = errMsg(x); }
    };
    app.querySelectorAll("[data-accept]").forEach(b => confirmable(b, "Confirmer ?", async () => {
      try { await rpc("accept_scrim", { p_id: b.dataset.accept }); feed("scrim", b.dataset.accept); toast("Scrim calé ! Contacte l'autre capitaine sur Discord pour le code de partie."); reload(); } catch (x) { toast(errMsg(x), "err"); } }));
    app.querySelectorAll("[data-cancel]").forEach(b => confirmable(b, "Confirmer ?", async () => {
      try { await rpc("cancel_scrim", { p_id: b.dataset.cancel }); feed("scrim", b.dataset.cancel); toast("C'est noté."); reload(); } catch (x) { toast(errMsg(x), "err"); } }));
    app.querySelectorAll("[data-noshow]").forEach(b => confirmable(b, "Confirmer l'absence ?", async () => {
      try { await rpc("report_no_show", { p_id: b.dataset.noshow }); feed("scrim", b.dataset.noshow); toast("Absence enregistrée."); reload(); } catch (x) { toast(errMsg(x), "err"); } }));
    app.querySelectorAll("[data-confirm]").forEach(b => b.onclick = async () => {
      try { await rpc("confirm_scrim", { p_id: b.dataset.confirm, p_accept: true }); feed("scrim", b.dataset.confirm); toast("Résultat confirmé."); reload(); } catch (x) { toast(errMsg(x), "err"); } });
    app.querySelectorAll("[data-refuse]").forEach(b => confirmable(b, "Sûr ?", async () => {
      try { await rpc("confirm_scrim", { p_id: b.dataset.refuse, p_accept: false }); toast("Résultat refusé : il faut le renvoyer. En cas de désaccord, ouvre un ticket dans #support."); reload(); } catch (x) { toast(errMsg(x), "err"); } }));
    app.querySelectorAll("[data-report]").forEach(b => b.onclick = () => {
      const f = $(`.sc-row[data-s="${b.dataset.report}"] .sc-form`, app);
      if (!f.hidden) { f.hidden = true; return; }
      f.hidden = false;
      f.innerHTML = `<form class="sc-report"><div class="score-line"><label for="r1">Nous</label><input id="r1" type="number" min="0" max="99" inputmode="numeric">
          <span>–</span><input id="r2" type="number" min="0" max="99" inputmode="numeric"><label for="r2">Eux</label></div>
        <span class="hint">Rounds gagnés au total sur tout le scrim (ex : 21 – 18 sur 2 maps).</span>
        <div class="staff-row"><button class="btn sm solid" type="submit">Envoyer</button></div><p class="form-err" role="alert"></p></form>`;
      $("form", f).onsubmit = async e => {
        e.preventDefault(); const a = $("#r1", f).value, c = $("#r2", f).value, er = $(".form-err", f);
        if (a === "" || c === "") return er.textContent = "Entre les deux scores.";
        try { await rpc("report_scrim", { p_id: b.dataset.report, p_for: +a, p_against: +c }); feed("scrim", b.dataset.report); toast("Résultat envoyé : l'autre capitaine doit confirmer."); reload(); }
        catch (x) { er.textContent = errMsg(x); }
      };
    });
    app.querySelectorAll("[data-sreset]").forEach(b => confirmable(b, "Confirmer ?", async () => {
      try { await rpc("admin_reset_scrim", { p_id: b.dataset.sreset }); toast("Scrim remis à zéro."); reload(); } catch (x) { toast(errMsg(x), "err"); } }));
    app.querySelectorAll("[data-sdel]").forEach(b => confirmable(b, "Supprimer ?", async () => {
      try { await rpc("admin_delete_scrim", { p_id: b.dataset.sdel }); toast("Scrim supprimé."); reload(); } catch (x) { toast(errMsg(x), "err"); } }));
  }

  // Petit résumé sur « Mon équipe »
  async function teamScrimsBox(box) {
    if (!box || !state.team) return;
    let d; try { d = await rpc("list_scrims"); } catch (e) { return; }
    const t = state.team, next = d.mine.filter(s => s.status === "cale").slice(0, 3);
    const todo = d.mine.filter(s => (s.status === "cale" && new Date(s.starts_at) <= new Date()) || (s.status === "termine" && !s.confirmed && s.reported_by !== t.id)).length;
    box.innerHTML = `<section class="team-scrims"><h3 class="t-h">Nos scrims</h3>
      ${next.length ? `<div class="sc-list">${next.map(s => { const opp = s.host.id === t.id ? s.guest : s.host; return `<a class="sc-row link-row" href="#/scrims">${dateTile(s.starts_at)}<div class="sc-main"><span class="sc-team">vs ${sideName(opp)}</span><span class="small-note">${esc(s.format)}</span></div></a>`; }).join("")}</div>`
        : `<p class="small-note">Aucun scrim calé.</p>`}
      ${todo ? `<p class="callout">${todo} scrim${todo > 1 ? "s" : ""} attend${todo > 1 ? "ent" : ""} un résultat ou une confirmation.</p>` : ""}
      <div class="staff-row"><a class="btn sm${t.is_captain ? " solid" : ""}" href="#/scrims">${t.is_captain ? "Proposer ou trouver un scrim" : "Voir les scrims"}</a>${t.is_captain ? `<a class="link-btn" href="#/recherche">On recrute ?</a>` : ""}</div>
    </section>`;
  }

  // ---------- Recherche d'équipe / de joueurs ----------
  const ROLES = ["Duelliste", "Initiateur", "Contrôleur", "Sentinelle", "Flex"];
  const lfgFilter = { tab: "joueurs", div: null, role: null };
  async function viewRecherche(app) {
    if (!sb) { app.innerHTML = panel("Recherche", `<p class="lead">Bientôt disponible.</p>`); return; }
    const d = await rpc("list_lfg");
    const t = state.team, isCap = !!(t && t.is_captain), p = state.profile;
    const myPost = t ? (isCap ? d.teams.find(x => x.mine) : null) : d.players.find(x => x.mine);
    const formKind = !state.session ? null : !t ? "joueur" : isCap ? "equipe" : null;
    const render = () => {
      const list = (lfgFilter.tab === "joueurs" ? d.players : d.teams)
        .filter(x => (!lfgFilter.div || x.division === lfgFilter.div) && (!lfgFilter.role || x.roles.includes(lfgFilter.role)));
      app.innerHTML = panel("Recherche", `
        <p class="lead">Des joueurs qui cherchent une équipe, et des équipes qui cherchent un joueur. On se contacte directement sur Discord.</p>
        ${formKind ? lfgForm(formKind, myPost, p) : !state.session ? `<p class="callout">Connecte-toi avec Discord pour publier ta recherche. <button class="link-btn" id="lf-login" type="button">Connexion</button></p>`
          : `<p class="small-note">Seul le capitaine de ton équipe peut publier une annonce de recrutement.</p>`}
        <div class="tabs" role="tablist">
          <button type="button" role="tab" class="tab${lfgFilter.tab === "joueurs" ? " on" : ""}" data-tab="joueurs" aria-selected="${lfgFilter.tab === "joueurs"}">Joueurs sans équipe <span class="count">${d.players.length}</span></button>
          <button type="button" role="tab" class="tab${lfgFilter.tab === "equipes" ? " on" : ""}" data-tab="equipes" aria-selected="${lfgFilter.tab === "equipes"}">Équipes qui recrutent <span class="count">${d.teams.length}</span></button>
        </div>
        <div class="filters">${chipRow("div", lfgFilter.div, [[null, "Toutes"], [1, "D1"], [2, "D2"], [3, "D3"], [4, "D4"]], "Division")}${chipRow("role", lfgFilter.role, [[null, "Tous"], ...ROLES.map(r => [r, r])], "Rôle")}</div>
        ${list.length ? `<div class="lfg-list">${list.map(x => lfgFilter.tab === "joueurs" ? playerCard(x) : teamCard(x)).join("")}</div>`
          : `<p class="small-note">Personne pour l'instant${lfgFilter.div || lfgFilter.role ? " avec ces filtres" : ""}.</p>`}`, "Recrutement");
      if ($("#lf-login")) $("#lf-login").onclick = login;
      app.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { lfgFilter.tab = b.dataset.tab; render(); });
      app.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { const k = b.dataset.f; lfgFilter[k] = b.dataset.v ? (k === "div" ? +b.dataset.v : b.dataset.v) : null; render(); });
      app.querySelectorAll("[data-lfdel]").forEach(b => confirmable(b, "Supprimer ?", async () => {
        try { await rpc("admin_delete_lfg", { p_id: b.dataset.lfdel }); toast("Annonce supprimée."); viewRecherche(app); } catch (x) { toast(errMsg(x), "err"); } }));
      if ($("#lfg-form")) {
        $("#lfg-form").onsubmit = async e => {
          e.preventDefault(); const er = $("#lf-err"); er.textContent = "";
          const roles = [...app.querySelectorAll("[name=lf-role]:checked")].map(i => i.value);
          if (!roles.length) return er.textContent = "Choisis au moins un rôle.";
          try {
            const id = await rpc(formKind === "joueur" ? "save_lfg_player" : "save_lfg_team", { p_roles: roles, p_dispo: $("#lf-dispo").value, p_message: $("#lf-msg").value });
            feed("lfg", id); toast("Annonce publiée, aussi sur le Discord."); viewRecherche(app);
          } catch (x) { er.textContent = errMsg(x); }
        };
        if ($("#lf-remove")) confirmable($("#lf-remove"), "Confirmer ?", async () => {
          try { await rpc("delete_lfg", { p_kind: formKind }); toast("Annonce retirée."); viewRecherche(app); } catch (x) { toast(errMsg(x), "err"); } });
      }
    };
    render();
  }
  function lfgForm(kind, post, p) {
    const v = post || { roles: [], dispo: "", message: "" };
    const title = kind === "joueur" ? (post ? "Ton annonce" : "Je cherche une équipe") : (post ? "Annonce de ton équipe" : "Mon équipe recrute");
    const missing = kind === "joueur" && (!p || !p.riot_id || p.rank == null);
    return `<details class="card post-card"${!post && kind === "joueur" ? " open" : ""}><summary><b>${title}</b>${post ? `<span class="small-note"> · publiée ${new Date(post.created_at).toLocaleDateString("fr-FR")}, visible 30 jours</span>` : ""}</summary>
      ${missing ? `<p class="callout">Renseigne d'abord ton Riot ID dans <a href="#/profil">ton profil</a> : ton rang sert à trouver une équipe de ton niveau.</p>` : `
      <form class="form" id="lfg-form" novalidate>
        <fieldset class="role-pick"><legend>${kind === "joueur" ? "Tes rôles" : "Rôles recherchés"}</legend>
          ${ROLES.map(r => `<label class="role-opt"><input type="checkbox" name="lf-role" value="${r}" ${v.roles.includes(r) ? "checked" : ""}> ${r}</label>`).join("")}</fieldset>
        <label for="lf-dispo">Disponibilités</label><input id="lf-dispo" maxlength="80" value="${esc(v.dispo || "")}" placeholder="ex : soirs de semaine, 20h-23h">
        <label for="lf-msg">Message (optionnel)</label><textarea id="lf-msg" rows="3" maxlength="300" placeholder="${kind === "joueur" ? "ex : main Omen, je fais les calls" : "ex : on cherche un smoke chill pour scrimer 3 soirs par semaine"}">${esc(v.message || "")}</textarea>
        <div class="ctas"><button class="btn solid" type="submit">${post ? "Mettre à jour" : "Publier"}</button>${post ? `<button class="link-btn danger-t" id="lf-remove" type="button">Retirer l'annonce</button>` : ""}</div>
        <p class="form-err" id="lf-err" role="alert"></p>
      </form>`}</details>`;
  }
  const roleTags = roles => roles.map(r => `<span class="role-tag">${esc(r)}</span>`).join("");
  const ago = iso => { const d = Math.floor((Date.now() - new Date(iso)) / 86400000); return d <= 0 ? "aujourd'hui" : d === 1 ? "hier" : `il y a ${d} jours`; };
  function playerCard(x) {
    return `<article class="lfg-card">
      <div class="lfg-head">${avatar(x.avatar_url, x.username, 40)}<div><b>${esc(x.username)}</b><span class="small-note">${x.rank != null ? esc(RANKS[x.rank]) + (x.rank_source === "auto" ? " ✓" : "") : "Non classé"} · ${esc(x.riot_id || "")}</span></div>${divChip(x.division)}</div>
      <div class="lfg-roles">${roleTags(x.roles)}</div>
      ${x.dispo ? `<p class="lfg-line"><span>Dispo</span>${esc(x.dispo)}</p>` : ""}${x.message ? `<p class="lfg-msg">${esc(x.message)}</p>` : ""}
      <div class="lfg-foot"><span class="small-note">${ago(x.created_at)}</span>${x.mine ? `<span class="small-note">Ton annonce</span>` : discordLink(x.discord_id, "Contacter sur Discord")}${state.isStaff && !x.mine ? `<button class="link-btn danger-t" data-lfdel="${x.id}" type="button">Supprimer</button>` : ""}</div>
    </article>`;
  }
  function teamCard(x) {
    return `<article class="lfg-card">
      <div class="lfg-head">${teamLogo(x, 40)}<div><b>${esc(x.name)}</b><span class="small-note">${esc(x.tag)} · ${x.members}/7 joueurs${x.status !== "validee" ? " · en attente de validation" : ""}</span></div>${divChip(x.division)}</div>
      <div class="lfg-roles"><span class="small-note">Cherche :</span>${roleTags(x.roles)}</div>
      ${x.dispo ? `<p class="lfg-line"><span>Dispo</span>${esc(x.dispo)}</p>` : ""}${x.message ? `<p class="lfg-msg">${esc(x.message)}</p>` : ""}
      <div class="lfg-foot"><span class="small-note">${ago(x.created_at)}</span>${x.mine ? `<span class="small-note">Ton annonce</span>` : discordLink(x.discord_id, "Contacter " + esc(x.captain || "le capitaine"))}${state.isStaff && !x.mine ? `<button class="link-btn danger-t" data-lfdel="${x.id}" type="button">Supprimer</button>` : ""}</div>
    </article>`;
  }

  // ---------- Classement des scrims ----------
  const rankFilter = { div: undefined };
  async function viewClassement(app) {
    if (!sb) { app.innerHTML = panel("Classement", `<p class="lead">Bientôt disponible.</p>`); return; }
    const rows = await rpc("scrim_leaderboard");
    if (rankFilter.div === undefined) rankFilter.div = state.team && state.team.status === "validee" ? state.team.division : 1;
    const render = () => {
      const list = rows.filter(r => r.division === rankFilter.div);
      app.innerHTML = panel("Classement des scrims", `
        <p class="lead">Les résultats des scrims, division par division. Victoire 3 points, nul 1 point. La fiabilité baisse avec les absences et les annulations de dernière minute.</p>
        <div class="filters">${chipRow("div", rankFilter.div, [[1, "D1"], [2, "D2"], [3, "D3"], [4, "D4"]], "Division")}</div>
        ${list.length ? `<div class="table-scroll"><table class="standings rank-table">
          <thead><tr><th>#</th><th>Équipe</th><th title="Scrims joués">J</th><th title="Victoires">V</th><th title="Nuls">N</th><th title="Défaites">D</th><th title="Différence de rounds">+/-</th><th>Pts</th><th title="Scrims honorés">Fiab.</th></tr></thead>
          <tbody>${list.map((r, i) => `<tr class="${state.team && r.team_id === state.team.id ? "me" : ""}"><td class="pos">${i + 1}</td>
            <td><span class="pl">${teamLogo(r, 26)}<b>${esc(r.name)}</b></span></td><td>${r.played}</td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td>
            <td>${r.rf - r.ra > 0 ? "+" : ""}${r.rf - r.ra}</td><td class="pts">${r.points}</td>
            <td><span class="fiab${r.reliability >= 90 ? " ok" : r.reliability >= 70 ? " mid" : " bad"}" title="${r.no_shows} absence(s), ${r.late_cancels} annulation(s) tardive(s)">${r.reliability} %</span></td></tr>`).join("")}</tbody></table></div>
          <p class="small-note legend">Un résultat compte quand l'adversaire le confirme, ou automatiquement 48 h après s'il ne répond pas.</p>`
          : `<p class="small-note">Aucun scrim joué en D${rankFilter.div} pour l'instant.</p>`}
        <div class="ctas" style="margin-top:24px"><a class="btn" href="#/scrims">Trouver un scrim</a></div>`, "Scrims");
      app.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { rankFilter.div = +b.dataset.v; render(); });
    };
    render();
  }

  // ================= Page de l'équipe PRIZM =================
  // Le roster et le bilan viennent directement du site (l'équipe PRIZM y est inscrite comme les autres)
  async function teamHome() {
    const box = $("#team-roster"); if (!box) return;
    if (!sb) { box.innerHTML = ""; return; }
    try {
      const tag = (CFG.teamTag || "PRZ").toUpperCase();
      const teams = await rpc("list_teams"), t = teams.find(x => x.tag.toUpperCase() === tag);
      if (!t) { box.innerHTML = `<p class="small-note">Le roster arrive bientôt.</p>`; return; }
      const [roster, lb, lfg] = await Promise.all([rpc("team_roster", { p_team: t.id }), rpc("scrim_leaderboard").catch(() => []), rpc("list_lfg").catch(() => null)]);
      const order = r => (r.role === "titulaire" ? 0 : 1);
      roster.sort((a, b) => order(a) - order(b) || (b.is_captain - a.is_captain));
      box.innerHTML = roster.map(r => `<article class="t-player${r.role === "remplacant" ? " sub" : ""}">
          ${r.avatar_url ? `<img src="${esc(r.avatar_url)}" alt="" width="96" height="96" referrerpolicy="no-referrer" loading="lazy">` : `<span class="t-initial">${esc((r.username || "?").slice(0, 1).toUpperCase())}</span>`}
          <b class="t-name${(r.username || "").length > 9 ? " long" : ""}">${esc(r.username)}</b>
          <span class="t-meta">${r.rank != null ? esc(RANKS[r.rank]) : "Non classé"}</span>
          <span class="t-role">${r.is_captain ? "Capitaine" : r.role === "titulaire" ? "Titulaire" : "Remplaçant"}</span>
        </article>`).join("");
      const me = lb.find(r => r.team_id === t.id);
      if (me) {
        const div = lb.filter(r => r.division === me.division), pos = div.findIndex(r => r.team_id === t.id) + 1;
        $("#team-bilan").innerHTML = `<div class="t-stats">
          <div><b>${me.played}</b><span>scrims joués</span></div>
          <div><b>${me.wins}<i>-</i>${me.draws}<i>-</i>${me.losses}</b><span>victoires, nuls, défaites</span></div>
          <div><b>${me.rf - me.ra > 0 ? "+" : ""}${me.rf - me.ra}</b><span>différence de rounds</span></div>
          <div><b>${pos}<sup>${pos === 1 ? "er" : "e"}</sup></b><span>sur ${div.length} en D${me.division}</span></div>
        </div><div class="ctas" style="margin-top:20px"><a class="btn" href="#/classement">Voir le classement</a></div>`;
        $("#bilan").hidden = false;
      }
      const post = lfg && lfg.teams.find(x => x.team_id === t.id);
      if (post) {
        $("#team-recrute").innerHTML = `<div class="t-recruit"><div><span class="eyebrow">On recrute</span><h2>PRIZM recrute${post.roles.length ? " : " + esc(post.roles.join(", ")) : ""}</h2>
          ${post.message ? `<p class="lead">${esc(post.message)}</p>` : ""}${post.dispo ? `<p class="small-note">Dispos : ${esc(post.dispo)}</p>` : ""}</div>
          <div class="ctas">${post.discord_id ? `<a class="btn solid" href="https://discord.com/users/${esc(post.discord_id)}" target="_blank" rel="noopener">Contacter ${esc(post.captain || "le capitaine")}</a>` : ""}<a class="btn" href="#/recherche">Voir l'annonce</a></div></div>`;
        $("#recrute").hidden = false;
      }
    } catch (e) { box.innerHTML = `<p class="small-note">Le roster n'a pas pu être chargé.</p>`; }
  }

  // ---------- Staff ----------
  async function viewStaff(app) {
    if (!state.session) return needLogin(app, "Espace réservé aux admins.");
    if (!state.isAdmin) { app.innerHTML = panel("Accès refusé", `<p class="lead">Seuls les admins peuvent gérer le staff.</p>`); return; }
    const ROLE = { admin: "Admin", arbitre: "Modérateur", joueur: "Joueur" };
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
        <div><b>Modérateur</b><p class="small-note">Gère les scrims (résultats contestés, absences), et la recherche d'équipe.</p></div>
        <div><b>Admin</b><p class="small-note">Tout ce que fait un modérateur, plus la validation des équipes, les rangs fixés à la main et la gestion du staff.</p></div>
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

  const adminTabs = cur => `<nav class="admin-tabs" aria-label="Administration"><a href="#/admin" class="${cur === "teams" ? "on" : ""}">Équipes</a><a href="#/staff" class="${cur === "staff" ? "on" : ""}">Staff</a><a href="#/scrims">Scrims</a></nav>`;

  // ---------- Vue : admin ----------
  async function viewAdmin(app) {
    if (!state.session) return needLogin(app, "Espace réservé au staff.");
    if (!state.isAdmin) { app.innerHTML = panel("Accès refusé", `<p class="lead">Cet espace est réservé au staff du réseau.</p>`); return; }
    const teams = (await rpc("list_teams")).filter(t => !t.is_test);
    const order = { en_attente: 0, validee: 1, refusee: 2 };
    teams.sort((a, b) => order[a.status] - order[b.status]);
    app.innerHTML = panel("Validation des équipes", `
      ${adminTabs("teams")}
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
    homeScrims(); teamHome();
    sb.auth.onAuthStateChange(async (ev, session) => {
      if (ev === "SIGNED_IN" && (!state.session || state.session.user.id !== session.user.id)) {
        state.session = session; await loadMe(); renderAuth(); route();
      } else if (ev === "SIGNED_OUT") { if (state.session) { state.session = null; clearMe(); renderAuth(); route(); } }
      else state.session = session;
    });
  }
  start();
})();
