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
  function toast(msg, kind = "ok") {
    const t = document.createElement("div");
    t.className = "toast " + kind; t.textContent = msg; t.setAttribute("role", "status");
    $("#toasts").appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }
  const errMsg = e => (e && (e.message || e.error_description)) || "Une erreur est survenue. Réessaie.";

  // ---------- Supabase ----------
  let sb = null;
  if (window.supabase && CFG.supabaseUrl && CFG.supabaseKey) {
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } });
  }
  const state = { session: null, profile: null, isAdmin: false };

  async function loadMe() {
    state.profile = null; state.isAdmin = false;
    if (!sb || !state.session) return;
    const { data, error } = await sb.from("profiles").select("id,username,avatar_url,riot_id,rank,rank_source,rank_checked_at,is_admin").eq("id", state.session.user.id).maybeSingle();
    if (error) { if (isSetupError(error)) showSetupBanner(); return; }
    state.profile = data; state.isAdmin = !!(data && data.is_admin);
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
    await sb.auth.signOut(); state.session = null; state.profile = null; state.isAdmin = false;
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
          ${state.isAdmin ? '<a href="#/admin">Admin</a>' : ""}
          <button type="button" id="logout-btn">Déconnexion</button>
        </div>
      </div>`;
    const btn = $("#me-btn"), menu = $("#me-menu");
    btn.onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden)); };
    menu.onclick = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
    document.addEventListener("click", () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); });
    $("#logout-btn").onclick = logout;
  }
  function discordIcon() {
    return `<svg width="18" height="14" viewBox="0 0 71 55" aria-hidden="true" fill="currentColor"><path d="M60.1 4.9A58.5 58.5 0 0 0 45.5.4a40 40 0 0 0-1.9 3.8 54 54 0 0 0-16.2 0A40 40 0 0 0 25.5.4 58.4 58.4 0 0 0 10.9 4.9C1.6 18.7-.9 32.2.3 45.5a58.8 58.8 0 0 0 17.9 9 43 43 0 0 0 3.8-6.2 38 38 0 0 1-6-2.9l1.5-1.1a42 42 0 0 0 36 0l1.5 1.1a38 38 0 0 1-6 2.9 43 43 0 0 0 3.8 6.2 58.6 58.6 0 0 0 17.9-9c1.5-15.4-2.5-28.8-10.6-40.6ZM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2Z"/></svg>`;
  }

  // ---------- Routeur ----------
  const views = { "/confidentialite": viewPrivacy, "/profil": viewProfile, "/mon-equipe": viewMyTeam, "/equipes": viewTeams, "/admin": viewAdmin, "/tournois": viewTournaments };
  function route() {
    const h = location.hash || "";
    const path = h.startsWith("#/") ? h.slice(1).split("?")[0] : null;
    const home = $("#view-home"), app = $("#view-app");
    document.querySelectorAll("nav a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === h || (h.startsWith("#/tournoi") && a.getAttribute("href") === "#/tournois")));
    const tm = path && path.match(/^\/tournoi\/(.+)$/);
    if (path && (views[path] || tm)) {
      home.hidden = true; app.hidden = false; window.scrollTo(0, 0);
      app.innerHTML = `<div class="wrap app-wrap"><p class="eyebrow">Chargement…</p></div>`;
      (tm ? viewTournament(app, tm[1]) : views[path](app)).catch(e => { app.innerHTML = panel("Oups", `<p class="lead">${esc(errMsg(e))}</p>`); });
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
      try { await rpc("delete_my_account"); await sb.auth.signOut(); state.session = null; state.profile = null; renderAuth(); toast("Ton compte a été supprimé."); location.hash = "#top"; }
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
    const teamId = await rpc("my_team_id");
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

    const [teams, roster, code] = await Promise.all([rpc("list_teams"), rpc("team_roster", { p_team: teamId }), rpc("my_invite_code")]);
    const t = teams.find(x => x.id === teamId);
    const me = state.session.user.id;
    const isCap = roster.some(r => r.user_id === me && r.is_captain);
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
      try { await rpc("set_team_logo", { p_url: null }); toast("Logo retiré."); viewMyTeam(app); } catch (x) { toast(errMsg(x), "err"); } });
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
    const ok = teams.filter(t => t.status === "validee");
    const pending = teams.filter(t => t.status === "en_attente").length;
    app.innerHTML = panel("Équipes du réseau", `
      <p class="lead">${ok.length} équipe${ok.length > 1 ? "s" : ""} validée${ok.length > 1 ? "s" : ""}${pending ? ` · ${pending} en attente de validation` : ""}. Clique sur une équipe pour voir ses joueurs.</p>
      <div class="ctas" style="margin:20px 0 40px"><a class="btn solid" href="#/mon-equipe">Inscrire mon équipe</a></div>
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
  const roundName = (r, total) => r === total ? "Finale" : r === total - 1 ? "Demi-finales" : r === total - 2 ? "Quarts de finale" : r === total - 3 ? "Huitièmes" : "Tour " + r;

  async function announce(tid, event) {
    try {
      const { error } = await sb.functions.invoke("tournament-announce", { body: { tournament_id: tid, event } });
      if (error) { let m = null; try { m = (await error.context.json()).error; } catch (e) {} toast(m || "Annonce Discord impossible.", "err"); return; }
      toast("Annonce publiée sur Discord.");
    } catch (e) { toast("Annonce Discord impossible.", "err"); }
  }

  async function viewTournaments(app) {
    if (!sb) { app.innerHTML = panel("Tournois", `<p class="lead">Bientôt disponible.</p>`); return; }
    if (state.session && !state.profile) await loadMe();
    const list = await rpc("list_tournaments");
    const live = list.filter(t => t.status === "en_cours"), next = list.filter(t => ["brouillon", "inscriptions", "checkin"].includes(t.status)), done = list.filter(t => t.status === "termine");
    const card = t => `<a class="t-card" href="#/tournoi/${t.id}">
        <div class="t-card-top">${divChip(t.division)}${tPill(t.status)}</div>
        <b class="t-card-name">${esc(t.name)}</b>
        <span class="small-note">${esc(fmtDate(t.starts_at))}</span>
        <span class="t-card-meta">${t.teams} / ${t.max_teams} équipes · BO${t.best_of}, finale BO${t.final_best_of}</span>
        ${t.status === "termine" && t.winner_name ? `<span class="t-card-win">${teamLogo({ logo_url: t.winner_logo, tag: t.winner_tag }, 28)}<span>🥇 ${esc(t.winner_name)}</span></span>` : ""}
      </a>`;
    const block = (title, arr, empty) => `<section class="div-block"><h3>${title}</h3>${arr.length ? `<div class="t-grid">${arr.map(card).join("")}</div>` : `<p class="small-note">${empty}</p>`}</section>`;
    app.innerHTML = panel("Tournois", `
      <p class="lead">Les PRIZM Cup se jouent en élimination directe, par division. Le capitaine inscrit son équipe, fait le check-in le jour J, et le bracket se met à jour en direct.</p>
      ${state.isAdmin ? `<div class="ctas" style="margin:16px 0 8px"><a class="btn solid" href="#/tournoi/nouveau">Créer un tournoi</a></div>` : ""}
      ${block("En cours", live, "Aucun tournoi en cours.")}
      ${block("À venir", next, "Aucun tournoi annoncé pour l'instant. Suis les annonces sur le Discord.")}
      ${block("Terminés", done, "Pas encore de tournoi terminé.")}`, "Compétition");
  }

  async function viewTournamentForm(app, t) {
    await loadMe();
    if (!state.isAdmin) { app.innerHTML = panel("Accès refusé", `<p class="lead">Réservé au staff.</p>`); return; }
    const v = t || { name: "", division: 2, starts_at: null, max_teams: 8, best_of: 1, final_best_of: 3, description: "" };
    const locked = t && ["en_cours", "termine"].includes(t.status);
    const opt = (vals, cur, lab = x => x) => vals.map(x => `<option value="${x}" ${+cur === x ? "selected" : ""}>${lab(x)}</option>`).join("");
    app.innerHTML = panel(t ? "Modifier le tournoi" : "Nouveau tournoi", `
      <form class="form" id="t-form" novalidate>
        <label for="t-name">Nom</label><input id="t-name" maxlength="60" value="${esc(v.name)}" placeholder="ex : PRIZM Cup #1 · D2" required>
        <label for="t-div">Division</label><select id="t-div" ${locked ? "disabled" : ""}>${opt([1, 2, 3, 4], v.division, d => DIV_NAMES[d])}</select>
        <label for="t-date">Date et heure de début</label><input id="t-date" type="datetime-local" value="${toLocalInput(v.starts_at)}">
        <label for="t-max">Nombre d'équipes maximum</label><select id="t-max" ${locked ? "disabled" : ""}>${opt([4, 8, 16, 32], v.max_teams)}</select>
        <label for="t-bo">Format des matchs</label><select id="t-bo" ${locked ? "disabled" : ""}>${opt([1, 3, 5], v.best_of, x => "BO" + x)}</select>
        <label for="t-fbo">Format de la finale</label><select id="t-fbo" ${locked ? "disabled" : ""}>${opt([1, 3, 5], v.final_best_of, x => "BO" + x)}</select>
        <label for="t-desc">Description (optionnelle)</label><textarea id="t-desc" rows="4" maxlength="1000" placeholder="Récompenses, règles particulières, horaires…">${esc(v.description || "")}</textarea>
        ${locked ? `<p class="small-note">Le bracket est lancé : seuls le nom, la date et la description sont modifiables.</p>` : ""}
        <div class="ctas"><button class="btn solid" type="submit">${t ? "Enregistrer" : "Créer le tournoi"}</button><a class="btn" href="${t ? "#/tournoi/" + t.id : "#/tournois"}">Annuler</a></div>
        <p class="form-err" id="t-err" role="alert"></p>
      </form>`, "Staff");
    $("#t-form").onsubmit = async e => {
      e.preventDefault(); const err = $("#t-err"); err.textContent = "";
      const name = $("#t-name").value.trim(); if (name.length < 3) { err.textContent = "Le nom doit faire au moins 3 caractères."; return; }
      const date = $("#t-date").value;
      try {
        const id = await rpc("admin_save_tournament", { p_id: t ? t.id : null, p_name: name, p_division: +$("#t-div").value, p_starts_at: date ? new Date(date).toISOString() : null,
          p_max_teams: +$("#t-max").value, p_best_of: +$("#t-bo").value, p_final_best_of: +$("#t-fbo").value, p_description: $("#t-desc").value });
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
    if (state.session) await loadMe();
    const d = await rpc("tournament_detail", { p_id: id });
    const t = d.tournament;
    if (!t) { app.innerHTML = panel("Tournoi introuvable", `<p class="lead">Ce tournoi n'existe pas ou n'est pas encore publié.</p><div class="ctas"><a class="btn" href="#/tournois">Voir les tournois</a></div>`); return; }
    // Équipe du visiteur
    let my = null, isCap = false;
    if (state.session) {
      const tid = await rpc("my_team_id");
      if (tid) {
        const [all, roster] = await Promise.all([rpc("list_teams"), rpc("team_roster", { p_team: tid })]);
        my = all.find(x => x.id === tid); isCap = roster.some(r => r.user_id === state.session.user.id && r.is_captain);
      }
    }
    const reg = my ? d.teams.find(x => x.id === my.id) : null;
    const isAdmin = state.isAdmin;

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
      const ev = { inscriptions: "inscriptions", checkin: "checkin", en_cours: "bracket", termine: "vainqueur" }[t.status];
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
      ${action ? `<div class="card t-action">${action}<p class="form-err" id="t-err" role="alert"></p></div>` : ""}
      ${staff}
      ${d.matches.length ? `<h3 class="t-h">Bracket</h3>${bracketHtml(d, isAdmin)}` : ""}
      <h3 class="t-h">Équipes inscrites</h3>${teamsHtml}
      <div class="ctas" style="margin-top:32px"><a class="btn" href="#/tournois">Tous les tournois</a></div>`, `Tournoi · ${DIV_NAMES[t.division]}`);

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

  // ---------- Vue : admin ----------
  async function viewAdmin(app) {
    if (!state.session) return needLogin(app, "Espace réservé au staff.");
    await loadMe();
    if (!state.isAdmin) { app.innerHTML = panel("Accès refusé", `<p class="lead">Cet espace est réservé au staff du réseau.</p>`); return; }
    const teams = await rpc("list_teams");
    const order = { en_attente: 0, validee: 1, refusee: 2 };
    teams.sort((a, b) => order[a.status] - order[b.status]);
    app.innerHTML = panel("Validation des équipes", `
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
      } else if (ev === "SIGNED_OUT") { state.session = null; renderAuth(); }
      else state.session = session;
    });
  }
  start();
})();
