/* PRIZM Competitive Network — connexion Discord, profils, équipes, admin */
  const LOC = () => window.PRIZM_LOCALE || "fr-FR";
(() => {
  const CFG = window.PRIZM_CONFIG || {};
  const RANKS = ["Fer 1","Fer 2","Fer 3","Bronze 1","Bronze 2","Bronze 3","Argent 1","Argent 2","Argent 3",
    "Or 1","Or 2","Or 3","Platine 1","Platine 2","Platine 3","Diamant 1","Diamant 2","Diamant 3",
    "Ascendant 1","Ascendant 2","Ascendant 3","Immortel 1","Immortel 2","Immortel 3","Radiant"];
  const DIV_NAMES = {1:"D1 · Élite",2:"D2 · Haute",3:"D3 · Inter",4:"D4 · Open"};
  // Icônes de rang officielles (hébergées par valorant-api.com). Si l'image ne charge pas, le nom du rang reste affiché.
  const RANK_ICON_SET = "03621f52-342b-cf4e-4f86-9350a49c6d04";
  const rankIcon = (r, size = 22) => r == null ? "" :
    `<img class="rank-ico" src="https://media.valorant-api.com/competitivetiers/${RANK_ICON_SET}/${r + 3}/${size > 40 ? "largeicon" : "smallicon"}.png" alt="" width="${size}" height="${size}" loading="lazy" onerror="this.remove()">`;
  const rankLabel = (r, size = 22) => r == null ? "" : `<span class="rank-lbl">${rankIcon(r, size)}${esc(RANKS[r])}</span>`;
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
          <a href="#/espace">Mon équipe</a>
          <a href="#/profil">Mon profil</a>
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
  const views = { "/reglement": viewRules, "/admin-equipes": viewAdminTeams, "/admin-joueurs": viewAdminPlayers, "/admin-scrims": viewAdminScrims, "/saisons": viewSeasons, "/nos-scrims": app => viewScrims(app, "team"), "/reglages": viewSettings, "/confidentialite": viewPrivacy, "/profil": viewProfile, "/mon-equipe": viewMyTeam, "/equipes": viewTeams, "/admin": viewAdmin, "/staff": viewStaff, "/scrims": viewScrims, "/recherche": viewRecherche, "/classement": viewClassement, "/espace": viewDashboard };
  // Changements pas encore enregistrés (map pool) : on prévient avant de quitter la page
  const unsaved = { pool: false };
  let lastHash = location.hash, guardBack = false;
  window.addEventListener("beforeunload", e => { if (unsaved.pool) { e.preventDefault(); e.returnValue = ""; } });
  function leaveDialog(target) {
    const ov = document.createElement("div");
    ov.className = "leave-ov";
    ov.innerHTML = `<div class="leave-box" role="dialog" aria-modal="true" aria-labelledby="leave-t">
      <h3 id="leave-t">Êtes-vous sûr de partir sans enregistrer ?</h3>
      <p class="small-note">${esc(unsaved.what || "Les changements du map pool")} ne sont pas enregistrés. Si tu pars sans enregistrer, ils seront perdus.</p>
      <div class="ctas"><button class="btn solid sm" data-a="save" type="button">Enregistrer et partir</button>
        <button class="btn danger sm" data-a="go" type="button">Partir sans enregistrer</button>
        <button class="btn sm" data-a="stay" type="button">Rester</button></div></div>`;
    document.body.appendChild(ov);
    $("[data-a=stay]", ov).focus();
    const close = () => ov.remove();
    const go = () => { unsaved.pool = false; unsaved.save = null; unsaved.what = null; live.editing = null; close(); location.hash = target; };
    ov.onclick = async e => {
      const a = e.target.closest("[data-a]"); if (!a && e.target !== ov) return;
      const act = a ? a.dataset.a : "stay";
      if (act === "stay") return close();
      if (act === "go") return go();
      a.disabled = true;
      try { if (unsaved.save) await unsaved.save(); else await rpc("set_map_pool", { p_pool: unsaved.poolValue() }); toast("Enregistré."); go(); }
      catch (x) { toast(errMsg(x), "err"); a.disabled = false; }
    };
  }

  function route() {
    const h = location.hash || "";
    if (unsaved.pool && h !== lastHash) {
      // On revient sur la page en cours sans la recharger, puis on demande
      const target = h; guardBack = true;
      history.replaceState(null, "", lastHash || "#/");
      leaveDialog(target);
      return;
    }
    if (guardBack) { guardBack = false; }
    lastHash = h;
    const path = h.startsWith("#/") ? h.slice(1).split("?")[0] : null;
    // Le Comp Builder vit dans le dossier compo/ (même connexion Discord)
    if (path === "/compo") { location.href = "compo/"; return; }
    const home = $("#view-home"), net = $("#view-network"), app = $("#view-app");
    document.querySelectorAll("header.top nav a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === (TEAM_ROUTES.includes(h) ? "#/espace" : h)));
    stopLive();
    // Le Competitive Network est l'accueil (l'ancienne page de l'équipe PRIZM, #/prizm, renvoie dessus)
    if (path === "/prizm") { location.replace("#/"); return; }
    if (h === "#reglement") { location.replace("#/reglement"); return; }
    const anchor = h && !h.startsWith("#/") ? document.getElementById(h.slice(1)) : null;
    const inTeam = false;
    const inNet = !inTeam;
    document.body.classList.toggle("area-net", inNet);
    document.body.classList.toggle("area-team", !inNet);
    if (path === "/reseau" || path === "/prizm") {
      home.hidden = inNet; app.hidden = true; net.hidden = !inNet; window.scrollTo(0, 0); freshenStatic();
    } else if (path && /^\/(equipe|joueur)\/[^/]+$/.test(path)) {
      // Pages publiques : #/equipe/TAG et #/joueur/<id>
      const [, kind, arg] = path.split("/");
      home.hidden = true; net.hidden = true; app.hidden = false; window.scrollTo(0, 0);
      app.innerHTML = `<div class="wrap app-wrap"><p class="eyebrow">Chargement…</p></div>`;
      (kind === "equipe" ? viewTeamPublic : viewPlayer)(app, decodeURIComponent(arg))
        .catch(e => { app.innerHTML = panel("Oups", `<p class="lead">${esc(errMsg(e))}</p>`); });
    } else if (path && views[path]) {
      home.hidden = true; net.hidden = true; app.hidden = false; window.scrollTo(0, 0);
      app.innerHTML = `<div class="wrap app-wrap"><p class="eyebrow">Chargement…</p></div>`;
      views[path](app).catch(e => { app.innerHTML = panel("Oups", `<p class="lead">${esc(errMsg(e))}</p>`); });
    } else {
      app.hidden = true; home.hidden = inNet; net.hidden = !inNet; freshenStatic();
      if (anchor) anchor.scrollIntoView(); else window.scrollTo(0, 0);
    }
  }
  window.addEventListener("hashchange", route);

  // ---------- Actualisation automatique ----------
  // Une seule connexion temps réel pour tout le site : on écoute la petite table « live_pulse ».
  // Chaque changement en base (équipe, scrim, annonce…) y incrémente un sujet : « teams », « scrims »,
  // « lfg », « team:<id> », « cb:<id> ». La page affichée dit quels sujets l'intéressent et se recharge
  // toute seule, sans jamais effacer ce que tu es en train d'écrire.
  const live = { topics: [], refresh: null, path: null, timer: null, dirty: false, editing: null, channel: null, hiddenAt: 0 };
  const staleStatic = new Set();
  const currentPath = () => { const h = location.hash || ""; return h.startsWith("#/") ? h.slice(1).split("?")[0] : null; };
  function stopLive() { clearTimeout(live.timer); live.topics = []; live.refresh = null; live.dirty = false; live.editing = null; hideLivePill(); }
  // Appelé par chaque vue à la fin de son affichage
  function setLive(path, topics, refresh) {
    if (path !== currentPath()) return; // on a déjà changé de page entre-temps
    live.topics = topics.filter(Boolean); live.refresh = refresh; live.path = path;
  }
  function onPulse(topic) {
    // Pages fixes (accueil PRIZM, accueil du réseau)
    if (topic === "scrims" || topic === "teams" || topic === "lfg") { staleStatic.add("team"); }
    if (topic === "scrims") staleStatic.add("scrims");
    freshenStatic(true);
    // Si le sujet touche mon équipe, on remet à jour le menu (capitaine, équipe quittée…)
    if (state.team && topic === "team:" + state.team.id) loadMe().then(renderAuth);
    if (live.refresh && live.topics.includes(topic)) scheduleRefresh();
  }
  function freshenStatic(debounced) {
    clearTimeout(freshenStatic.t);
    const run = () => {
      if (document.hidden) return;
      if (staleStatic.has("scrims") && !$("#view-network").hidden) { staleStatic.delete("scrims"); homeScrims(); }
      if (staleStatic.has("team") && !$("#view-home").hidden) { staleStatic.delete("team"); teamHome(); }
    };
    if (debounced) freshenStatic.t = setTimeout(run, 800); else run();
  }
  function scheduleRefresh() { clearTimeout(live.timer); live.timer = setTimeout(runRefresh, 700); }
  // Quelqu'un est en train d'écrire ou un formulaire est ouvert : on ne touche à rien
  function busy() {
    if (live.editing && live.editing.isConnected) return true;
    if (document.querySelector("#view-app .armed")) return true;
    const f = $("#scrim-form"); if (f && !f.hidden) return true;
    return false;
  }
  async function runRefresh(force) {
    if (!live.refresh || live.path !== currentPath()) return;
    if (document.hidden) { live.dirty = true; return; }
    if (!force && busy()) { live.dirty = true; showLivePill(); return; }
    live.dirty = false; live.editing = null; hideLivePill();
    const app = $("#view-app"), y = window.scrollY;
    // Garde ouverts les blocs dépliés (rosters, modération…)
    const open = [...app.querySelectorAll("details[open]")].map(d => d.dataset.id || d.className);
    try { await live.refresh(); } catch (e) { return; }
    app.querySelectorAll("details").forEach(d => {
      if (open.includes(d.dataset.id || d.className) && !d.open) d.open = true;
    });
    window.scrollTo(0, y);
  }
  function showLivePill() {
    let pill = $("#live-pill");
    if (!pill) {
      pill = document.createElement("button");
      pill.id = "live-pill"; pill.type = "button"; pill.className = "live-pill";
      pill.innerHTML = `<span aria-hidden="true"></span>Du nouveau · actualiser`;
      pill.onclick = () => runRefresh(true);
      document.body.appendChild(pill);
    }
    pill.hidden = false;
  }
  function hideLivePill() { const p = $("#live-pill"); if (p) p.hidden = true; }
  // On retient le champ en cours de saisie, pour ne pas l'effacer
  document.addEventListener("input", e => { if (e.target.closest && e.target.closest("#view-app")) live.editing = e.target; });
  document.addEventListener("click", e => { const f = e.target.closest && e.target.closest("#view-app form"); if (f && e.target.closest("button:not([type=submit])")) live.editing = f; });
  function startLive() {
    if (!sb || live.channel) return;
    live.channel = sb.channel("pulse")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_pulse" }, p => { const t = (p.new && p.new.topic) || (p.old && p.old.topic); if (t) onPulse(t); })
      .subscribe(status => {
        // Après une coupure (wifi, veille), on rattrape ce qu'on a pu manquer
        if (status === "SUBSCRIBED" && live.wasDown) { live.wasDown = false; staleStatic.add("team"); staleStatic.add("scrims"); freshenStatic(); if (live.refresh) scheduleRefresh(); }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") live.wasDown = true;
      });
  }
  function stopLiveChannel() { if (live.channel && sb) { sb.removeChannel(live.channel); live.channel = null; } }
  // Onglet caché plus de 2 minutes : on coupe la connexion (économise le quota gratuit), puis on rattrape au retour
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { live.hiddenAt = Date.now(); setTimeout(() => { if (document.hidden && Date.now() - live.hiddenAt >= 120000) stopLiveChannel(); }, 120500); return; }
    const away = live.hiddenAt ? Date.now() - live.hiddenAt : 0; live.hiddenAt = 0;
    if (!live.channel) { startLive(); staleStatic.add("team"); staleStatic.add("scrims"); live.dirty = live.dirty || !!live.refresh; }
    freshenStatic();
    if (live.dirty || away > 30000) { if (live.refresh) scheduleRefresh(); }
  });

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

  // Liens vers les pages publiques
  const teamHref = tag => "#/equipe/" + encodeURIComponent(tag || "");
  const playerHref = id => "#/joueur/" + encodeURIComponent(id || "");

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
    const when = p.rank_checked_at ? new Date(p.rank_checked_at).toLocaleDateString(LOC(), { day: "numeric", month: "long" }) : "";
    const src = p.rank_source === "auto" ? `<span class="pill ok">Vérifié</span><span class="small-note">Détecté automatiquement${when ? " le " + when : ""}</span>`
      : p.rank_source === "staff" ? `<span class="pill ok">Fixé par le staff</span>${when ? `<span class="small-note">le ${when}</span>` : ""}`
      : p.rank != null ? `<span class="pill wait">Non vérifié</span><span class="small-note">Clique sur le bouton ci-dessus pour le vérifier.</span>` : "";
    if (p.rank == null) return `<span class="eyebrow">Rang actuel</span><b class="rank-big">${p.riot_id ? "Non classé" : "—"}</b>
      <p class="small-note">${p.riot_id ? "Aucun rang compétitif trouvé pour ce Riot ID. Joue tes matchs de placement, ou demande au staff de fixer ton rang via un ticket dans #support." : "Renseigne ton Riot ID pour détecter ton rang."}</p>`;
    return `<span class="eyebrow">Rang actuel</span><b class="rank-big">${rankIcon(p.rank, 64)}${esc(RANKS[p.rank])}</b>
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
    // Un seul endroit pour les joueurs : le roster du site porte aussi les rôles en jeu et la couleur
    // utilisés par le Comp Builder (fiches cb_players), et les joueurs sans compte (coach, dépannage).
    const [roster, fiches, editTeam, members] = await Promise.all([
      rpc("team_roster", { p_team: teamId }),
      sb.from("cb_players").select("*").eq("team_id", teamId).then(r => r.data || []),
      rpc("my_cb_edit_team").catch(() => null),
      sb.from("team_members").select("user_id, cb_editor").eq("team_id", teamId).then(r => r.data || []),
    ]);
    const canEditRoles = !!editTeam;
    const editors = new Set(members.filter(m => m.cb_editor).map(m => m.user_id));
    const ficheOf = new Map(fiches.filter(f => f.user_id).map(f => [f.user_id, f]));
    const offnet = fiches.filter(f => !f.user_id).sort((a, b) => a.pseudo.localeCompare(b.pseudo));
    const rolesOpt = { ficheOf, canEdit: canEditRoles, me: state.session.user.id, editors, captain: !!t.is_captain };
    const me = state.session.user.id;
    const isCap = !!t.is_captain;
    const inviteLink = location.origin + location.pathname + "?join=" + code + "#/mon-equipe";
    const tit = roster.filter(r => r.role === "titulaire").length;
    const locked = t.locked; // compétition en cours : arrivées et départs bloqués

    app.innerHTML = teamShell("roster", t, "Roster", `
      <div class="team-status">
        ${statusPill(t)}
        <span class="small-note">${t.status === "validee" ? "Ton équipe peut proposer et accepter des scrims." : t.status !== "refusee" ? "En attendant la validation, ton équipe peut déjà faire des scrims hors classement. " : ""}${t.status === "validee" ? "" :
          t.status === "refusee" ? "Contacte le staff dans #support sur le Discord." :
          `Division estimée : <b>${t.suggested ? DIV_NAMES[t.suggested] : "à calculer"}</b>. Le staff valide la division finale.`}</span>
      </div>
      ${t.status === "validee" ? `<div class="callout info">Ton rôle <b>D${t.division}</b> est donné automatiquement sur le Discord PRIZM. Tu dois être sur le serveur pour le recevoir${(CFG.links || {}).discord ? ` : <a href="${esc(CFG.links.discord)}" target="_blank" rel="noopener">rejoindre le Discord</a>` : ""}. Arrivé après la validation ? <button class="link-btn" id="sync-me" type="button">Recevoir mon rôle</button></div>` : ""}
      ${tit < 5 && t.status !== "validee" ? `<div class="callout">Il te faut 5 titulaires pour être validé. Pour l'instant : ${tit}/5.</div>` : ""}
      ${locked ? `<p class="lock-line">🔒 Roster bloqué pendant <b>${esc(locked)}</b> : personne ne peut rejoindre ni quitter l'équipe. Besoin d'un changement ? Ouvre un ticket dans #support.</p>` : ""}
      ${rosterTable(roster, isCap, me, false, !!locked, rolesOpt)}
      <div class="roster-tools"><button class="link-btn" id="refresh-ranks" type="button">Actualiser les rangs de l'équipe</button><span class="small-note">✓ = rang vérifié · ? = rang non vérifié</span></div>
      <div id="role-editor"></div>
      <section class="db-card roster-off">
        <div class="db-head"><h3>Sans compte sur le site</h3>${canEditRoles ? `<button class="btn sm" id="off-add" type="button">+ Ajouter un joueur</button>` : ""}</div>
        <p class="small-note">Coach, joueur de dépannage… Ils n'ont pas rejoint l'équipe sur le site (pas de photo Discord ni de rang), mais on peut les placer dans les compos. Dès qu'un joueur rejoint l'équipe avec le lien d'invitation, il apparaît dans le roster au-dessus.</p>
        ${offnet.length ? `<div class="off-list">${offnet.map(f => `<div class="off-row">
            <span class="role-dot" style="--c:${esc(f.color || "#9aa3af")}"></span><b>${esc(f.pseudo)}</b>${roleChips(f)}
            ${canEditRoles ? `<span class="off-act"><button class="link-btn" data-roles-edit="${f.id}" type="button">Modifier</button><button class="link-btn danger-t" data-off-del="${f.id}" type="button">Supprimer</button></span>` : ""}
          </div>`).join("")}</div>` : `<p class="small-note mute">Aucun.</p>`}
      </section>
      <p class="small-note roster-more">Invitation, logo et départ : <a class="link-btn" href="#/reglages">Réglages</a>.</p>`,
      isCap ? "Titulaires, remplaçants et capitaine. Tu peux changer les rôles et retirer un joueur." : "Les joueurs de l'équipe et leur rang.");

    $("#refresh-ranks").onclick = async () => {
      const b = $("#refresh-ranks"); b.disabled = true; b.textContent = "Actualisation…";
      const r = await rankSync({ team_id: teamId });
      if (r.error) toast(r.error, "err");
      else { const fails = Object.values(r.results).filter(x => !x.ok); toast(fails.length ? fails.map(x => (x.username || "?") + " : " + x.message).join(" · ") : "Rangs actualisés.", fails.length ? "err" : "ok"); }
      viewMyTeam(app);
    };
    if ($("#sync-me")) $("#sync-me").onclick = () => discordSync({ user_ids: [me] }, true);
    bindRosterActions(app, () => viewMyTeam(app));
    bindRoleEditor(app, { teamId, fiches, roster, refresh: () => viewMyTeam(app) });

    // Arrivées, départs, rôles, validation, logo, scrims : la page se met à jour toute seule
    setLive("/mon-equipe", ["team:" + teamId, "scrims", "cb:" + teamId], () => viewMyTeam(app));
  }

  // Rôles en jeu (Comp Builder) : mêmes noms que les agents de Valorant
  const GAME_ROLES = ["Duelliste", "Contrôleur", "Initiateur", "Sentinelle", "Flex"];
  const ROLE_COL = { Duelliste: "#ff6170", Contrôleur: "#9b84ff", Initiateur: "#f2d45c", Sentinelle: "#4ade80", Flex: "#9aa3af" };
  const PLAYER_COLORS = ["#ff4655", "#ff8a4c", "#ffc94c", "#8ce971", "#3ddc97", "#4cd4d9", "#7c8cff", "#c67cff", "#ff7cc5", "#c7cdd6"];
  const roleChips = f => [f.primary_role, f.secondary_role].filter(Boolean)
    .map((r, i) => `<span class="role-chip${i ? " sec" : ""}" style="--c:${ROLE_COL[r] || "#9aa3af"}">${esc(r)}</span>`).join("");

  // Fenêtre d'édition des rôles (membre, joueur sans compte ou nouveau). Rien n'est enregistré sans le bouton.
  function bindRoleEditor(app, { teamId, fiches, roster, refresh }) {
    const box = $("#role-editor", app);
    const clearGuard = () => { unsaved.pool = false; unsaved.save = null; unsaved.what = null; live.editing = null; };
    const open = fiche => {
      const isNew = !fiche, member = fiche && fiche.user_id ? roster.find(r => r.user_id === fiche.user_id) : null;
      const st = { pseudo: fiche ? fiche.pseudo : "", p: fiche ? fiche.primary_role || "" : "", s: fiche ? fiche.secondary_role || "" : "", c: fiche ? fiche.color || PLAYER_COLORS[0] : PLAYER_COLORS[0] };
      const init = JSON.stringify(st);
      const title = isNew ? "Nouveau joueur sans compte" : `Rôles de ${member ? member.username : fiche.pseudo}`;
      box.innerHTML = `<form class="db-card role-form" novalidate>
        <div class="db-head"><h3>${esc(title)}</h3><span class="small-note" id="rf-state">Rien à enregistrer</span></div>
        ${member ? "" : `<label class="rf-field"><span>Pseudo</span><input id="rf-pseudo" maxlength="24" value="${esc(st.pseudo)}" placeholder="ex : Coach Max" required></label>`}
        <div class="rf-row">
          <label class="rf-field"><span>Rôle principal</span><select id="rf-p"><option value="">Aucun</option>${GAME_ROLES.map(r => `<option value="${r}" ${st.p === r ? "selected" : ""}>${r}</option>`).join("")}</select></label>
          <label class="rf-field"><span>Rôle secondaire</span><select id="rf-s"><option value="">Aucun</option>${GAME_ROLES.map(r => `<option value="${r}" ${st.s === r ? "selected" : ""}>${r}</option>`).join("")}</select></label>
        </div>
        <div class="rf-field"><span>Couleur dans les compos</span><div class="rf-colors" role="radiogroup" aria-label="Couleur">${PLAYER_COLORS.map(c => `<button type="button" role="radio" aria-checked="${st.c === c}" aria-label="${c}" class="rf-color${st.c === c ? " on" : ""}" data-c="${c}" style="--c:${c}"></button>`).join("")}</div></div>
        <div class="ctas"><button class="btn solid sm" id="rf-save" type="submit" disabled>Enregistrer</button><button class="btn sm" id="rf-cancel" type="button">Annuler</button></div>
        <p class="form-err" id="rf-err" role="alert"></p>
      </form>`;
      const form = $(".role-form", box), saveBtn = $("#rf-save", box), info = $("#rf-state", box);
      const save = async () => {
        const row = { primary_role: st.p || null, secondary_role: st.s && st.s !== st.p ? st.s : null, color: st.c };
        if (!member) { if (st.pseudo.trim().length < 2) throw new Error("Donne un pseudo (2 caractères minimum)."); row.pseudo = st.pseudo.trim(); }
        const q = isNew ? sb.from("cb_players").insert({ team_id: teamId, ...row }) : sb.from("cb_players").update(row).eq("id", fiche.id);
        const { error } = await q; if (error) throw error;
      };
      const sync = () => {
        const d = JSON.stringify(st) !== init;
        saveBtn.disabled = !d; info.textContent = d ? "Pas encore enregistré" : "Rien à enregistrer"; info.classList.toggle("warn-t", d);
        if (d) { unsaved.pool = true; unsaved.what = "Les rôles du joueur"; unsaved.save = save; live.editing = app; } else clearGuard();
      };
      if ($("#rf-pseudo", box)) $("#rf-pseudo", box).oninput = e => { st.pseudo = e.target.value; sync(); };
      $("#rf-p", box).onchange = e => { st.p = e.target.value; sync(); };
      $("#rf-s", box).onchange = e => { st.s = e.target.value; sync(); };
      box.querySelectorAll(".rf-color").forEach(b => b.onclick = () => {
        st.c = b.dataset.c; box.querySelectorAll(".rf-color").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); }); sync(); });
      $("#rf-cancel", box).onclick = () => { clearGuard(); box.innerHTML = ""; };
      form.onsubmit = async e => {
        e.preventDefault(); saveBtn.disabled = true; $("#rf-err", box).textContent = "";
        try { await save(); clearGuard(); toast(isNew ? "Joueur ajouté." : "Rôles enregistrés."); refresh(); }
        catch (x) { $("#rf-err", box).textContent = errMsg(x); saveBtn.disabled = false; }
      };
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
      ($("#rf-pseudo", box) || $("#rf-p", box)).focus({ preventScroll: true });
    };
    const ask = fn => { if (unsaved.pool && !confirm("Les changements en cours ne sont pas enregistrés. Les abandonner ?")) return; clearGuard(); fn(); };
    app.querySelectorAll("[data-roles-edit]").forEach(b => b.onclick = () => ask(() => open(fiches.find(f => f.id === b.dataset.rolesEdit))));
    const add = $("#off-add", app); if (add) add.onclick = () => ask(() => open(null));
    app.querySelectorAll("[data-off-del]").forEach(b => confirmable(b, "Confirmer ?", async () => {
      const id = b.dataset.offDel;
      try {
        // Retiré aussi des compos où il était placé
        const { data: comps } = await sb.from("cb_compositions").select("id, slots").eq("team_id", teamId);
        await Promise.all((comps || []).filter(c => (c.slots || []).some(x => x.playerId === id))
          .map(c => sb.from("cb_compositions").update({ slots: c.slots.map(x => x.playerId === id ? { ...x, playerId: null } : x) }).eq("id", c.id)));
        const { error } = await sb.from("cb_players").delete().eq("id", id); if (error) throw error;
        toast("Joueur supprimé."); refresh();
      } catch (x) { toast(errMsg(x), "err"); }
    }));
  }

  // ---------- Règlement ----------
  async function viewRules(app) {
    const R = [
      ["Roster", "5 titulaires et jusqu'à 2 remplaçants. Un joueur ne joue que pour une équipe à la fois."],
      ["Comptes", "Chaque joueur déclare son Riot ID. Le smurf et le partage de compte entraînent l'exclusion."],
      ["Validation", "Le staff valide la division d'une équipe quand elle a 5 titulaires. Avant ça, l'équipe peut déjà scrimer : ses scrims sont hors classement."],
      ["Ponctualité", "En retard ? Préviens avec « On sera en retard » (5 à 30 min) : l'adversaire est prévenu sur Discord. Sans prévenir, 15 minutes après l'heure prévue, l'adversaire peut déclarer une absence (le délai est allongé du retard annoncé)."],
      ["Annulation", "Annule au moins 2 h avant. En dessous, c'est une annulation tardive : elle fait baisser ta fiabilité."],
      ["Résultats", "Un capitaine envoie le score de chaque map, l'autre confirme. En BO3, gagne l'équipe qui remporte le plus de maps. Sans réponse sous 48 h, le résultat est validé."],
      ["Classement", "Victoire 3 points, nul 1 point, puis la différence de rounds. Seuls les scrims entre deux équipes validées comptent. La fiabilité indique la part de scrims honorés."],
      ["Esprit scrim", "On joue pour progresser : pas de troll, pas de rage-quit, on va au bout du format prévu."],
      ["Comportement", "Toxicité, insultes ou triche : avertissement, puis exclusion du réseau."],
      ["Litiges", "Un ticket dans #support sur le Discord. La décision du staff est définitive."],
    ];
    app.innerHTML = panel("Règlement", `<p class="lead">L'essentiel à connaître avant ton premier scrim. Le règlement est aussi épinglé sur le Discord.</p>
      <div class="rules rules-page">${R.map(([t, d], i) => `<div class="rule"><span class="ref">§${i + 1}</span><div><b>${t}</b><p>${d}</p></div></div>`).join("")}</div>`, "Competitive Network");
  }

  function statusPill(t) {
    if (t.status === "validee") return `<span class="pill ok">Validée · ${DIV_NAMES[t.division]}</span>`;
    if (t.status === "refusee") return `<span class="pill bad">Refusée</span>`;
    return `<span class="pill wait">En attente de validation</span>`;
  }

  const rankCell = r => {
    const label = r.rank != null ? rankLabel(r.rank) : "—";
    return label + rankMark(r);
  };
  const rankMark = r => {
    return r.rank_source === "auto" ? `<span class="rank-ok" title="Rang vérifié automatiquement">✓</span>`
      : r.rank_source === "staff" ? `<span class="rank-ok" title="Rang fixé par le staff">✓</span>`
      : r.rank != null ? `<span class="rank-unv" title="Rang non vérifié">?</span>` : "";
  };

  function rosterTable(roster, isCap, me, admin = false, noKick = false, ro = null) {
    const rolesCell = r => {
      const f = ro.ficheOf.get(r.user_id);
      if (!f) return `<td><span class="mute">—</span></td>`;
      const can = ro.canEdit || r.user_id === ro.me;
      return `<td><span class="role-cell"><span class="role-dot" style="--c:${esc(f.color || "#9aa3af")}" title="Couleur dans les compos"></span>${roleChips(f) || `<span class="mute">Aucun</span>`}${can ? `<button class="role-edit" data-roles-edit="${f.id}" type="button" title="Modifier les rôles et la couleur" aria-label="Modifier les rôles de ${esc(r.username)}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/></svg></button>` : ""}</span></td>`;
    };
    return `<div class="table-scroll"><table class="roster">
      <thead><tr><th>Joueur</th><th>Riot ID</th><th>Rang</th>${ro ? "<th>Rôles en jeu</th>" : ""}${isCap ? "<th><span class='sr'>Actions</span></th>" : ""}</tr></thead>
      <tbody>${roster.map(r => `<tr>
        <td><span class="pl">${avatar(r.avatar_url, r.username, 32)}<span class="pl-txt"><a class="pl-link" href="${playerHref(r.user_id)}"><b>${esc(r.username)}</b></a><small class="pl-sub">${r.is_captain ? '<span class="cap">Capitaine</span>' : ""}${r.role === "titulaire" ? "Titulaire" : "Remplaçant"}${ro && !r.is_captain && ro.editors.has(r.user_id) ? ` · <span class="ed-tag" title="Peut modifier les compos et les strats">Éditeur</span>` : ""}</small></span></span></td>
        <td class="mono">${esc(r.riot_id || "—")}</td>
        <td>${admin ? `<span class="admin-rank"><select data-rank-for="${r.user_id}" aria-label="Rang de ${esc(r.username)}"><option value="">Non classé</option>${RANKS.map((n, i) => `<option value="${i}" ${r.rank === i ? "selected" : ""}>${n}</option>`).join("")}</select><button class="link-btn" data-rank-save="${r.user_id}" type="button">Fixer</button></span> ${rankMark(r)}` : rankCell(r)}</td>
        ${ro ? rolesCell(r) : ""}
        ${isCap ? `<td class="act">${r.user_id === me ? "" : `<details class="act-menu"><summary>Gérer</summary><div class="act-pop">${ro ? `<button class="link-btn" data-act="editor" data-u="${r.user_id}" data-on="${ro.editors.has(r.user_id) ? "0" : "1"}" type="button" title="Peut modifier les compos et les strats">${ro.editors.has(r.user_id) ? "Retirer éditeur" : "Nommer éditeur"}</button>` : ""}
          <button class="link-btn" data-act="role" data-u="${r.user_id}" data-r="${r.role === "titulaire" ? "remplacant" : "titulaire"}" type="button">${r.role === "titulaire" ? "Passer remplaçant" : "Passer titulaire"}</button>
          <button class="link-btn" data-act="cap" data-u="${r.user_id}" type="button">Nommer capitaine</button>
          ${noKick ? "" : `<button class="link-btn danger-t" data-act="kick" data-u="${r.user_id}" type="button">Retirer de l'équipe</button>`}</div></details>`}</td>` : ""}
      </tr>`).join("")}</tbody></table></div>`;
  }

  function bindRosterActions(root, refresh) {
    // Menus « Gérer » : posés au-dessus de la page (le tableau défile, il les couperait)
    root.querySelectorAll(".act-menu").forEach(d => d.addEventListener("toggle", () => {
      if (!d.open) return;
      root.querySelectorAll(".act-menu[open]").forEach(o => { if (o !== d) o.open = false; });
      const pop = $(".act-pop", d), r = $("summary", d).getBoundingClientRect();
      pop.style.position = "fixed"; pop.style.right = "auto";
      pop.style.left = Math.max(8, Math.min(r.right - 220, innerWidth - 228)) + "px";
      const below = r.bottom + 6, h = pop.offsetHeight || 160;
      pop.style.top = (below + h > innerHeight - 8 ? Math.max(8, r.top - 6 - h) : below) + "px";
    }));
    if (!document.body.dataset.actClose) {
      document.body.dataset.actClose = "1";
      document.addEventListener("click", e => { document.querySelectorAll(".act-menu[open]").forEach(o => { if (!o.contains(e.target)) o.open = false; }); });
      addEventListener("scroll", () => document.querySelectorAll(".act-menu[open]").forEach(o => o.open = false), { passive: true });
    }
    root.querySelectorAll("[data-act]").forEach(b => {
      const u = b.dataset.u;
      if (b.dataset.act === "editor") b.onclick = async () => { try { await rpc("cb_set_editor", { p_user: u, p_on: b.dataset.on === "1" }); toast(b.dataset.on === "1" ? "Il peut maintenant modifier les compos et les strats." : "Il passe en lecture seule dans les compos."); refresh(); } catch (x) { toast(errMsg(x), "err"); } };
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
          ${list.length ? `<div class="team-list">${list.map(teamRow).join("")}</div>` : emptyState(`Pas encore d'équipe en ${DIV_NAMES[d]}`, "Les équipes apparaissent ici une fois validées par le staff.")}</section>`;
      }).join("")}`, "Classement par division");
    bindTeamRows(app);
    setLive("/equipes", ["teams"], () => viewTeams(app));
  }
  const teamRow = t => `<details class="team-row" data-id="${t.id}" data-tag="${esc(t.tag)}"><summary>${teamLogo(t, 36)}<b>${esc(t.name)}</b><span class="tag-chip">${esc(t.tag)}</span><span class="small-note">${t.members} joueur${t.members > 1 ? "s" : ""}</span></summary><div class="roster-slot"><p class="small-note">Chargement…</p></div></details>`;
  function bindTeamRows(root, admin = false) {
    const load = async d => {
      try {
        const r = await rpc("team_roster", { p_team: d.dataset.id });
        $(".roster-slot", d).innerHTML = rosterTable(r, false, null, admin) + `<p class="small-note"><a class="link-btn" href="${teamHref(d.dataset.tag)}">Voir la page de l'équipe →</a></p>` + (admin ? `<p class="small-note open-roster">Roster bloqué pendant une compétition ? <button class="link-btn" data-open-roster type="button">Autoriser les changements pendant 24 h</button></p>` : "");
        if (admin) { const ob = $("[data-open-roster]", d); ob.onclick = async () => {
          try { const until = await rpc("admin_open_roster", { p_team: d.dataset.id }); toast("Changements autorisés jusqu'à " + new Date(until).toLocaleString(LOC(), { weekday: "long", hour: "2-digit", minute: "2-digit" }) + "."); }
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
  const fmtDate = iso => iso ? new Date(iso).toLocaleString(LOC(), { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "Date à venir";
  const fmtShort = iso => new Date(iso).toLocaleString(LOC(), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const toLocalInput = iso => { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const dateTile = iso => {
    const d = new Date(iso);
    return `<div class="date-tile"><b>${d.getDate()}</b><span>${MONTHS[d.getMonth()]}</span><small>${d.toLocaleTimeString(LOC(), { hour: "2-digit", minute: "2-digit" })}</small></div>`;
  };
  const discordLink = (id, label) => id ? `<a class="link-btn" href="https://discord.com/users/${esc(id)}" target="_blank" rel="noopener">${label}</a>` : "";
  const chipRow = (key, cur, opts, label) => `<div class="f-group"><span class="eyebrow">${label}</span>${opts.map(([v, l]) =>
    `<button type="button" class="f-chip${cur === v ? " on" : ""}" data-f="${key}" data-v="${v ?? ""}" aria-pressed="${cur === v}">${l}</button>`).join("")}</div>`;
  // Prévient le Discord (le bot poste ou met à jour le message). Si le bot n'est pas prêt, on ne bloque rien.
  const feed = (type, id, quiet = false) => { if (sb) sb.functions.invoke("discord-feed", { body: { type, id, quiet } }).catch(() => {}); };

  // Accueil : les 4 prochaines propositions ouvertes
  async function homeScrims() {
    const box = $("#home-scrims"); if (!box || !sb) return;
    try {
      const d = await rpc("list_scrims"), list = d.open.slice(0, 4);
      box.innerHTML = list.length ? `<div class="sc-list">${list.map(s => `<a class="sc-row link-row" href="#/scrims">${dateTile(s.starts_at)}<div class="sc-main"><span class="sc-team">${sideName(s.host)}${divChip(s.division)}</span><span class="small-note">${esc(s.format)}</span></div></a>`).join("")}</div>`
        : emptyState("Aucune proposition en ce moment", "Lance la première : une équipe de ton niveau pourra l'accepter en un clic.", nextStepCta());
    } catch (e) { box.innerHTML = `<p class="small-note">Les propositions s'affichent ici dès que les scrims sont ouverts.</p>`; }
  }

  // ---------- Scrims ----------
  const sideName = x => x ? `${teamLogo(x, 28)}<b>${esc(x.name)}</b>` : `<span class="small-note">En attente d'un adversaire</span>`;
  const SCRIM_FORMATS = ["24 rounds", "2 maps", "BO1", "BO3"];
  // Filtre des propositions : "near" = ma division et les voisines, "all" = tout, 1 à 4 = une seule division
  const scrimFilter = { div: undefined };
  let scrimCtx = { reco: () => [] };
  const recoLine = other => { const r = scrimCtx.reco(other); return r.length ? `<span class="scx-reco" title="Maps que les deux équipes jouent, sans ban">Maps conseillées : <b>${r.map(esc).join(", ")}</b></span>` : ""; };
  const DAY = 86400000;
  // « Aujourd'hui », « Demain », « Hier » ou « sam. 26 oct. »
  const dayLabel = iso => {
    const d = new Date(iso), a = new Date(); a.setHours(0, 0, 0, 0);
    const b = new Date(d); b.setHours(0, 0, 0, 0);
    const n = Math.round((b - a) / DAY);
    if (n === 0) return "Aujourd'hui"; if (n === 1) return "Demain"; if (n === -1) return "Hier";
    const s = d.toLocaleDateString(LOC(), { weekday: "short", day: "numeric", month: "short" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const hourLabel = iso => new Date(iso).toLocaleTimeString(LOC(), { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
  const when = iso => `<div class="scx-when"><span>${dayLabel(iso)}</span><b>${hourLabel(iso)}</b></div>`;
  const tags = s => [s.format, s.maps].filter(Boolean).map(x => `<span class="scx-tag">${esc(x)}</span>`).join("")
    + (s.ranked === false ? `<span class="scx-tag unranked" title="Une des deux équipes n'est pas encore validée : ce scrim ne compte pas au classement">Hors classement</span>` : "");
  // Page ou bloc vide : dire quoi faire, avec le bon bouton selon la situation
  const emptyState = (title, text, cta = "") => `<div class="empty-state"><b>${title}</b><p>${text}</p>${cta ? `<div class="ctas">${cta}</div>` : ""}</div>`;
  const nextStepCta = () => !state.session ? `<a class="btn solid sm" href="#/mon-equipe">Inscrire mon équipe</a>`
    : !state.team ? `<a class="btn solid sm" href="#/mon-equipe">Créer ou rejoindre une équipe</a>`
    : state.team.is_captain ? `<a class="btn solid sm" href="#/scrims">Proposer un scrim</a>` : "";
  // Division de jeu : celle validée par le staff, sinon la division estimée d'après les rangs
  const playDiv = t => t ? (t.status === "validee" && t.division ? t.division : t.suggested || 4) : null;
  // Retard : annonçable de 2 h avant à 30 min après l'heure prévue
  const lateWindow = s => { const st = new Date(s.starts_at).getTime(), n = Date.now(); return n >= st - 2 * 3600000 && n <= st + 30 * 60000; };
  const lateInfo = (s, t) => !s.late_team ? "" : s.late_team === t.id
    ? `<p class="scx-late mine">🕒 Vous avez prévenu : environ ${s.late_minutes} min de retard.</p>`
    : `<p class="scx-late">🕒 L'adversaire annonce environ ${s.late_minutes} min de retard.</p>`;
  const lateBtn = s => `<span class="scx-latebox"><button class="link-btn" data-late="${s.id}" type="button">On sera en retard</button>
    <span class="scx-latepick" hidden>${[5, 10, 15, 20, 30].map(m => `<button type="button" class="scx-latemin" data-latemin="${m}" data-for="${s.id}">${m} min</button>`).join("")}</span></span>`;
  const opponent = x => x ? `<a class="scx-team pl-link" href="${teamHref(x.tag)}">${teamLogo(x, 32)}<b>${esc(x.name)}</b>${divChip(x.division)}</a>` : `<span class="scx-team"><b class="mute">Adversaire à trouver</b></span>`;

  // ---------- Scores ----------
  // Résultat d'un scrim vu par une équipe : 1 victoire, 0 nul, -1 défaite.
  // Avec le score de chaque map, c'est le nombre de maps gagnées qui compte ; sinon le total de rounds.
  const outcome = r => r.mw != null && r.ml != null ? Math.sign(r.mw - r.ml) : Math.sign(r.us - r.them);
  const multiMap = r => r.maps && r.maps.length > 1;
  const scoreText = (r, plain) => r.no_show ? "absence" : multiMap(r) ? `${r.mw} – ${r.ml}${plain ? " maps" : `<small class="t-unit"> maps</small>`}` : `${r.us} – ${r.them}`;
  const mapsDetail = r => r.maps && r.maps.length ? r.maps.map(m => `${m.map} ${m.us}-${m.them}`).join(" · ") : "";
  const mapsTitle = r => mapsDetail(r) ? ` title="${esc(mapsDetail(r))}"` : "";
  // Vue d'un scrim (list_scrims) du côté d'une équipe
  function sideOf(s, teamId) {
    const home = s.host.id === teamId;
    const maps = (s.map_scores || []).map(m => ({ map: m.map, us: home ? m.h : m.g, them: home ? m.g : m.h }));
    return { us: home ? s.host_score : s.guest_score, them: home ? s.guest_score : s.host_score, maps: maps.length ? maps : null,
      mw: maps.length ? maps.filter(m => m.us > m.them).length : null, ml: maps.length ? maps.filter(m => m.us < m.them).length : null };
  }
  // Bilan par map d'une équipe (scrims avec le score de chaque map)
  function mapStats(list) {
    if (!list || !list.length) return `<p class="small-note">Pas encore de résultat map par map.</p>`;
    const rate = m => m.played ? m.wins / m.played : 0;
    const ranked = list.filter(m => m.played >= 2);
    const best = ranked.length > 1 ? [...ranked].sort((a, b) => rate(b) - rate(a) || b.diff - a.diff)[0] : null;
    const worst = ranked.length > 1 ? [...ranked].sort((a, b) => rate(a) - rate(b) || a.diff - b.diff)[0] : null;
    return `<div class="map-stats">${list.map(m => `<div class="ms-row${best && m.map === best.map ? " best" : ""}${worst && m.map === worst.map && worst !== best ? " worst" : ""}">
        <span class="ms-map">${esc(m.map)}</span><span class="ms-rec"><b>${m.wins}</b>V <b>${m.losses}</b>D</span>
        <span class="ms-bar" title="${Math.round(rate(m) * 100)} % de victoires"><i style="width:${Math.round(rate(m) * 100)}%"></i></span>
        <span class="ms-diff">${m.diff > 0 ? "+" : ""}${m.diff}</span></div>`).join("")}</div>
      ${best && worst && best !== worst ? `<p class="small-note">Plus forte : <b>${esc(best.map)}</b> · plus faible : <b>${esc(worst.map)}</b> (sur 2 maps jouées ou plus).</p>` : ""}`;
  }
  const mapChips = r => r.maps && r.maps.length ? `<span class="map-scores">${r.maps.map(m => `<span class="${m.us > m.them ? "w" : m.us < m.them ? "l" : "d"}">${esc(m.map)} <b>${m.us}-${m.them}</b></span>`).join("")}</span>` : "";

  // ---------- Map pool ----------
  // Liste des maps du jeu (API Valorant, gardée pour la session) ; liste de secours si l'API ne répond pas
  const MAP_FALLBACK = ["Abyss", "Ascent", "Bind", "Breeze", "Corrode", "Fracture", "Haven", "Icebox", "Lotus", "Pearl", "Split", "Sunset"];
  const POOL_LEVELS = [["forte", "Forte"], ["jouable", "Jouable"], ["ban", "Ban"]];
  const POOL_SCORE = { forte: 2, jouable: 1 };
  let mapListP = null, rotCache = null;
  // Pool compétitif du moment (7 maps du classé), mis à jour chaque jour par la base
  async function rotation() {
    if (rotCache && Date.now() - rotCache.at < 60000) return rotCache.maps;
    if (!sb) return null;
    const { data } = await sb.from("map_rotation").select("maps").eq("id", 1).maybeSingle();
    rotCache = { at: Date.now(), maps: data && data.maps && data.maps.length ? data.maps : null };
    return rotCache.maps;
  }
  // Maps du map pool : seulement celles du pool compétitif (toutes si la rotation est inconnue)
  async function mapList() {
    const [all, rot] = await Promise.all([allMaps(), rotation().catch(() => null)]);
    if (!rot) return all;
    return rot.map(n => all.find(m => m.name.toLowerCase() === n.toLowerCase()) || { name: n, img: null })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  function allMaps() {
    if (mapListP) return mapListP;
    try { const c = JSON.parse(sessionStorage.getItem("prizm_maps2") || "null"); if (c && c.length) return (mapListP = Promise.resolve(c)); } catch (e) {}
    mapListP = fetch("https://valorant-api.com/v1/maps").then(r => r.json()).then(j => {
      const seen = new Set(), out = [];
      for (const m of j.data || []) {
        if (!m.displayName || !m.tacticalDescription || /range|tutorial|npe/i.test(m.mapUrl || "")) continue;
        const k = m.displayName.trim().toLowerCase(); if (seen.has(k)) continue; seen.add(k);
        out.push({ name: m.displayName.trim(), img: m.listViewIcon || null, uuid: m.uuid });
      }
      out.sort((a, b) => a.name.localeCompare(b.name));
      if (!out.length) throw new Error("vide");
      try { sessionStorage.setItem("prizm_maps2", JSON.stringify(out)); } catch (e) {}
      return out;
    }).catch(() => MAP_FALLBACK.map(name => ({ name, img: null })));
    return mapListP;
  }
  // Tous les map pools (une petite ligne par équipe) : { team_id: { Ascent: "forte", ... } }
  async function loadPools() {
    if (!sb) return {};
    const { data, error } = await sb.from("team_map_pools").select("team_id,pool");
    if (error) return {};
    return Object.fromEntries((data || []).map(r => [r.team_id, r.pool || {}]));
  }
  // Maps conseillées entre deux équipes : aucune des deux ne la bannit, et les deux la jouent au moins
  function poolMatch(a, b, maps) {
    a = a || {}; b = b || {};
    return maps.map(m => m.name)
      .filter(n => a[n] !== "ban" && b[n] !== "ban" && POOL_SCORE[a[n]] && POOL_SCORE[b[n]])
      .sort((x, y) => (POOL_SCORE[b[y]] + POOL_SCORE[a[y]]) - (POOL_SCORE[b[x]] + POOL_SCORE[a[x]]) || x.localeCompare(y));
  }
  const hasPool = p => p && Object.keys(p).length > 0;
  // Affichage en lecture : Fortes / Jouables / Bans
  function poolView(pool, maps, hi = []) {
    if (!hasPool(pool)) return `<p class="small-note">Map pool pas encore renseigné.</p>`;
    const group = (lvl, label) => {
      const list = maps.filter(m => pool[m.name] === lvl);
      return list.length ? `<div class="pool-group"><span class="pool-lbl ${lvl}">${label}</span><div class="pool-chips">${list.map(m =>
        `<span class="pool-chip ${lvl}${hi.includes(m.name) ? " hi" : ""}">${esc(m.name)}</span>`).join("")}</div></div>` : "";
    };
    return `<div class="pool-view">${group("forte", "Fortes")}${group("jouable", "Jouables")}${group("ban", "Bans")}</div>`;
  }
  // Maps citées dans les derniers scrims d'une équipe (le champ « maps » est du texte libre)
  function mapsSeen(texts, maps) {
    const count = {};
    for (const t of texts || []) for (const m of maps) if (new RegExp(`\\b${m.name}\\b`, "i").test(t)) count[m.name] = (count[m.name] || 0) + 1;
    return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }

  // ---------- Fiche adversaire ----------
  function closeBrief() { const o = $("#brief-ov"); if (o) { o.remove(); document.body.classList.remove("no-scroll"); } }
  async function openBrief(teamId) {
    closeBrief();
    const ov = document.createElement("div");
    ov.id = "brief-ov"; ov.className = "brief-ov";
    ov.innerHTML = `<aside class="brief" role="dialog" aria-modal="true" aria-label="Fiche adversaire"><p class="eyebrow">Chargement…</p></aside>`;
    document.body.appendChild(ov); document.body.classList.add("no-scroll");
    ov.onclick = e => { if (e.target === ov || e.target.closest("[data-close]")) closeBrief(); };
    let d, maps;
    try { [d, maps] = await Promise.all([rpc("opponent_brief", { p_team: teamId }), mapList()]); }
    catch (e) { $(".brief", ov).innerHTML = `<p class="lead">${esc(errMsg(e))}</p><button class="btn" data-close type="button">Fermer</button>`; return; }
    if (!$("#brief-ov")) return;
    if (!d) { $(".brief", ov).innerHTML = `<p class="lead">Équipe introuvable.</p><button class="btn" data-close type="button">Fermer</button>`; return; }
    const t = d.team, st = d.standing, recent = d.recent || [], h2h = d.h2h || [], roster = d.roster || [];
    const mineIsMe = state.team && state.team.id === t.id;
    const common = hasPool(d.my_pool) && hasPool(d.pool) ? poolMatch(d.my_pool, d.pool, maps) : [];
    const myBans = maps.filter(m => (d.my_pool || {})[m.name] === "ban").map(m => m.name);
    const theirBans = maps.filter(m => (d.pool || {})[m.name] === "ban").map(m => m.name);
    const seen = mapsSeen(d.maps_played, maps);
    const res = r => r.no_show ? "ABS" : outcome(r) > 0 ? "V" : outcome(r) < 0 ? "D" : "N";
    const cls = r => r.no_show ? "ff" : outcome(r) > 0 ? "w" : outcome(r) < 0 ? "l" : "d";
    const hw = h2h.filter(r => !r.no_show && outcome(r) > 0).length, hl = h2h.filter(r => !r.no_show && outcome(r) < 0).length;
    const order = r => (r.is_captain ? 0 : r.role === "titulaire" ? 1 : 2);
    roster.sort((a, b) => order(a) - order(b));
    const avgRank = (() => { const r = roster.filter(x => x.role === "titulaire" && x.rank != null).map(x => x.rank); return r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length) : null; })();

    $(".brief", ov).innerHTML = `
      <div class="brief-head">
        <span class="eyebrow">Fiche adversaire</span>
        <button class="brief-x" data-close type="button" aria-label="Fermer">×</button>
        <div class="brief-id">${teamLogo(t, 56)}<div><h3>${esc(t.name)} <span class="tag-chip">${esc(t.tag)}</span></h3>
          <span class="small-note">${t.division ? DIV_NAMES[t.division] : "Division à venir"}${d.captain ? ` · capitaine ${esc(d.captain)}` : ""}</span></div></div>
      </div>

      ${st ? `<div class="brief-stats">
          <div><b>${st.pos}<sup>${st.pos === 1 ? "er" : "e"}</sup></b><span>sur ${st.of} en D${t.division}</span></div>
          <div><b>${st.wins}-${st.draws}-${st.losses}</b><span>V · N · D</span></div>
          <div><b>${st.diff > 0 ? "+" : ""}${st.diff}</b><span>rounds${st.mw + st.ml ? ` · maps ${st.mw}-${st.ml}` : ""}</span></div>
          <div class="${st.reliability < 80 ? "warn" : ""}"><b>${st.reliability}<small>%</small></b><span>fiabilité</span></div>
        </div>
        ${st.no_shows || st.late_cancels ? `<p class="callout brief-warn">${[st.no_shows && `${st.no_shows} absence${st.no_shows > 1 ? "s" : ""}`, st.late_cancels && `${st.late_cancels} annulation${st.late_cancels > 1 ? "s" : ""} tardive${st.late_cancels > 1 ? "s" : ""}`].filter(Boolean).join(" et ")} sur le réseau.</p>` : ""}`
        : `<p class="small-note">Pas encore de scrim confirmé sur le réseau.</p>`}

      <div class="brief-sec"><h4>Forme</h4>
        ${recent.length ? `<div class="brief-form">${recent.slice(0, 5).map(r => `<span class="t-res ${cls(r)}" title="${esc(r.opp)} · ${shortDate(r.starts_at)}${r.no_show ? "" : ` · ${scoreText(r, true)}${mapsDetail(r) ? ` (${mapsDetail(r)})` : ""}`}">${res(r)}</span>`).join("")}<span class="small-note">du plus récent au plus ancien</span></div>
          <div class="t-lines">${recent.slice(0, 3).map(r => `<div class="t-line"><span class="t-res ${cls(r)}">${res(r)}</span>${oppLink(r)}<span class="small-note">${shortDate(r.starts_at)}</span><span class="t-score"${mapsTitle(r)}>${scoreText(r)}</span></div>${mapChips(r)}`).join("")}</div>`
          : `<p class="small-note">Aucun résultat pour l'instant.</p>`}
      </div>

      <div class="brief-sec"><h4>Maps</h4>
        ${common.length ? `<div class="brief-reco"><span class="eyebrow">Conseillées pour ce scrim</span><div class="pool-chips">${common.slice(0, 5).map(n => `<span class="pool-chip hi">${esc(n)}</span>`).join("")}</div></div>`
          : !mineIsMe && state.team && !hasPool(d.my_pool) ? `<p class="small-note">Renseigne le map pool de ton équipe dans <a href="#/reglages">Réglages</a> pour voir les maps conseillées.</p>` : ""}
        ${poolView(d.pool, maps)}
        ${!mineIsMe && (myBans.length || theirBans.length) && hasPool(d.my_pool) ? `<p class="small-note">À éviter : ${esc([...new Set([...myBans, ...theirBans])].join(", "))}.</p>` : ""}
        <p class="eyebrow brief-sub">Leurs résultats par map</p>${mapStats(d.map_stats)}
        ${seen.length ? `<p class="small-note brief-seen">Vues dans leurs derniers scrims : ${seen.map(([n, c]) => `<b>${esc(n)}</b> ×${c}`).join(", ")}</p>` : ""}
      </div>

      ${!mineIsMe && state.team ? `<div class="brief-sec"><h4>Face à vous</h4>
        ${h2h.length ? `<p class="brief-h2h"><b>${hw}</b> victoire${hw > 1 ? "s" : ""} · <b>${hl}</b> défaite${hl > 1 ? "s" : ""} en ${h2h.length} scrim${h2h.length > 1 ? "s" : ""}</p>
          <div class="t-lines">${h2h.slice(0, 3).map(r => `<div class="t-line"><span class="t-res ${cls(r)}">${res(r)}</span><span class="small-note">${shortDate(r.starts_at)} · ${esc(r.format)}</span><span></span><span class="t-score"${mapsTitle(r)}>${scoreText(r)}</span></div>${mapChips(r)}`).join("")}</div>`
          : `<p class="small-note">Premier scrim entre vos deux équipes.</p>`}
      </div>` : ""}

      <div class="brief-sec"><h4>Roster${avgRank != null ? ` <span class="small-note">· titulaires en moyenne ${esc(RANKS[avgRank])}</span>` : ""}</h4>
        <div class="brief-roster">${roster.map(r => `<a class="brief-pl${r.role === "remplacant" ? " sub" : ""}" href="${playerHref(r.user_id)}">${avatar(r.avatar_url, r.username, 30)}<b>${esc(r.username)}</b><span class="small-note">${r.rank != null ? rankLabel(r.rank, 16) : "Non classé"}</span>${r.is_captain ? `<span class="pub-role">Cap.</span>` : ""}</a>`).join("") || `<p class="small-note">Aucun joueur.</p>`}</div>
      </div>

      <div class="ctas brief-ctas">${d.contact && !mineIsMe && state.session ? `<a class="btn solid sm" href="https://discord.com/users/${esc(d.contact)}" target="_blank" rel="noopener">Contacter ${esc(d.captain || "le capitaine")}</a>` : ""}<a class="btn sm" href="${teamHref(t.tag)}">Page de l'équipe</a></div>`;
    ov.querySelectorAll("a[href^='#']").forEach(a => a.addEventListener("click", closeBrief));
    $(".brief-x", ov).focus();
  }
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeBrief(); });
  window.addEventListener("hashchange", closeBrief);
  document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-brief]"); if (b) { e.preventDefault(); openBrief(b.dataset.brief); } });
  const briefBtn = (id, label = "Fiche adversaire") => id ? `<button class="link-btn brief-btn" data-brief="${id}" type="button">${label}</button>` : "";
  const scSection = (title, sub, body, cls = "") => `<section class="scx-sec ${cls}"><div class="scx-sec-head"><h3>${title}</h3>${sub ? `<span class="small-note">${sub}</span>` : ""}</div>${body}</section>`;

  // Deux pages : « Scrims » (public : trouver et proposer) et « Nos scrims » (mode team : à faire, calés, résultats)
  async function viewScrims(app, mode = "public") {
    if (!sb) { app.innerHTML = panel("Scrims", `<p class="lead">Bientôt disponible.</p>`); return; }
    const [data, pools, maps] = await Promise.all([rpc("list_scrims"), loadPools(), mapList()]);
    // Une équipe pas encore validée peut déjà jouer, hors classement (seule une équipe refusée ne peut pas)
    const t = state.team, isCap = !!(t && t.is_captain), canPlay = isCap && t.status !== "refusee", myDiv = playDiv(t);
    if (mode === "team" && !t) { location.hash = state.session ? "#/mon-equipe" : "#/scrims"; return; }
    const myPool = t ? pools[t.id] : null;
    // Maps conseillées face à une équipe (si les deux map pools sont remplis)
    const reco = other => other && hasPool(myPool) && hasPool(pools[other.id]) ? poolMatch(myPool, pools[other.id], maps).slice(0, 3) : [];
    scrimCtx = { reco, t };
    if (scrimFilter.div === undefined) scrimFilter.div = canPlay ? "near" : "all";
    if (scrimFilter.div === "near" && !canPlay) scrimFilter.div = "all";

    // On range les scrims de l'équipe : à faire, calés, résultats
    const now = Date.now(), todo = [], upcoming = [], past = [];
    if (t) for (const s of data.mine || []) {
      const started = new Date(s.starts_at).getTime() <= now;
      if (s.status === "cale" && !started) upcoming.push(s);
      else if (s.status === "cale") todo.push(s);
      else if (s.status === "termine" && !s.no_show && !s.confirmed && s.reported_by !== t.id) todo.push(s);
      else if (s.status === "termine" || s.status === "annule") past.push(s);
    }
    upcoming.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    past.sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
    const myOpen = t ? data.open.filter(s => s.host.id === t.id) : [];
    const othersOpen = data.open.filter(s => !t || s.host.id !== t.id);

    const render = () => {
      const f = scrimFilter.div;
      const shown = othersOpen.filter(s => f === "all" ? true : f === "near" ? Math.abs(s.division - myDiv) <= 1 : s.division === f);
      const filterBtns = [
        ...(canPlay ? [["near", `Mon niveau <small>D${Math.max(1, myDiv - 1)} à D${Math.min(4, myDiv + 1)}</small>`]] : []),
        ["all", "Toutes"], [1, "D1"], [2, "D2"], [3, "D3"], [4, "D4"]];
      const count = v => v === "all" ? othersOpen.length : v === "near" ? othersOpen.filter(s => Math.abs(s.division - myDiv) <= 1).length : othersOpen.filter(s => s.division === v).length;

      const head = `<div class="scx-top">
          <p class="lead">Propose un créneau ou accepte celui d'une autre équipe. Tu peux scrimer contre ta division et les divisions juste au-dessus et en dessous.</p>
          ${canPlay ? `<button class="btn solid" id="sc-open" type="button" aria-expanded="false" aria-controls="scrim-form">+ Proposer un scrim</button>` : ""}
        </div>
        ${canPlay ? `<form class="form scx-propose" id="scrim-form" novalidate hidden>
            <div class="scx-propose-head"><b>Nouvelle proposition</b><span class="small-note">Elle s'affiche ici et sur le Discord de ta division.</span></div>
            ${t.status !== "validee" ? `<p class="callout info">Ton équipe n'est pas encore validée : tes scrims se jouent hors classement, dans ta division estimée (D${myDiv}). Ils comptent au classement dès la validation par le staff.</p>` : ""}
            <div class="form-grid">
              <div><label for="sc-date">Date et heure</label><input id="sc-date" type="datetime-local" required min="${toLocalInput(new Date(Date.now() + 15 * 60000).toISOString())}"></div>
              <div><label for="sc-format">Format</label><select id="sc-format">${SCRIM_FORMATS.map(x => `<option>${x}</option>`).join("")}</select></div>
            </div>
            <label for="sc-maps">Maps <span class="hint">(optionnel)</span></label><input id="sc-maps" maxlength="60" placeholder="ex : Ascent + Lotus, ou « au choix »">
            <div class="pool-pick" aria-label="Ajouter une map">${hasPool(myPool)
              ? maps.filter(m => myPool[m.name] && myPool[m.name] !== "ban").sort((a, b) => POOL_SCORE[myPool[b.name]] - POOL_SCORE[myPool[a.name]] || a.name.localeCompare(b.name))
                  .map(m => `<button type="button" class="pool-chip ${myPool[m.name]}" data-addmap="${esc(m.name)}">+ ${esc(m.name)}</button>`).join("")
              : `<span class="small-note">Astuce : remplis votre <a href="#/reglages">map pool</a> pour ajouter tes maps en un clic.</span>`}</div>
            <label for="sc-note">Message <span class="hint">(optionnel)</span></label><input id="sc-note" maxlength="200" placeholder="ex : on travaille nos rétakes">
            <div class="ctas"><button class="btn solid" type="submit">Publier</button><button class="link-btn" id="sc-close" type="button">Annuler</button></div>
            <p class="form-err" id="sc-err" role="alert"></p>
          </form>`
        : state.session ? `<p class="callout">${t ? (isCap ? "Ton équipe a été refusée : contacte le staff dans #support pour en savoir plus." : `Seul le capitaine de <b>${esc(t.name)}</b> peut proposer ou accepter un scrim.`) : `Il te faut une équipe pour scrimer. <a href="#/mon-equipe">Crée ou rejoins une équipe</a>, ou passe par la <a href="#/recherche">recherche d'équipe</a>.`}</p>`
        : `<p class="callout">Connecte-toi avec Discord pour proposer ou accepter un scrim. <button class="link-btn" id="sc-login" type="button">Connexion</button></p>`}`;

      const todoHtml = todo.length ? scSection("À faire", `${todo.length} action${todo.length > 1 ? "s" : ""} en attente`,
        `<div class="scx-list">${todo.map(s => todoCard(s, t, isCap)).join("")}</div>`, "scx-todo") : "";

      const upHtml = t ? scSection("Scrims calés", upcoming.length ? "" : "",
        upcoming.length ? `<div class="scx-list">${upcoming.map(s => upcomingCard(s, t, isCap)).join("")}</div>`
          : emptyState("Aucun scrim calé", canPlay ? "Accepte une proposition ou publie la tienne." : "Le capitaine cale les scrims de l'équipe.", canPlay ? `<a class="btn solid sm" href="#/scrims">Trouver un scrim</a>` : "")) : "";

      const mineOpenHtml = myOpen.length ? scSection("Tes propositions", "En attente d'une équipe",
        `<div class="scx-list">${myOpen.map(s => `<div class="scx-card">${when(s.starts_at)}
          <div class="scx-main"><span class="scx-team"><b class="mute">En attente d'un adversaire</b></span><div class="scx-tags">${tags(s)}${s.note ? `<span class="scx-note">« ${esc(s.note)} »</span>` : ""}</div></div>
          <div class="scx-act">${isCap ? `<button class="link-btn danger-t" data-cancel="${s.id}" type="button">Retirer</button>` : ""}</div></div>`).join("")}</div>`) : "";

      const openHtml = scSection("Trouver un scrim", `${othersOpen.length} proposition${othersOpen.length > 1 ? "s" : ""} ouverte${othersOpen.length > 1 ? "s" : ""}`,
        `<div class="scx-filter" role="group" aria-label="Filtrer par division">${filterBtns.map(([v, l]) =>
          `<button type="button" class="scx-fbtn${f === v ? " on" : ""}" data-f="${v}" aria-pressed="${f === v}">${l}<i>${count(v)}</i></button>`).join("")}</div>
        ${shown.length ? `<div class="scx-list">${shown.map(s => openCard(s, t, isCap, canPlay)).join("")}</div>`
          : emptyState(`Aucune proposition ${f === "near" ? "à ton niveau" : f === "all" ? "" : "en D" + f} pour l'instant`.replace("  ", " "),
              canPlay ? "Lance la tienne avec « Proposer un scrim » : elle apparaît aussi sur le Discord." : "Reviens plus tard, ou inscris ton équipe pour proposer un créneau.",
              canPlay ? `<button class="btn solid sm" type="button" onclick="document.getElementById('sc-open').click();window.scrollTo({top:0,behavior:'smooth'})">Proposer un scrim</button>` : nextStepCta())}`);

      const pastHtml = past.length ? scSection("Résultats", "",
        `<div class="scx-results">${past.slice(0, 10).map(s => resultRow(s, t)).join("")}</div>`) : "";

      const staffHtml = state.isStaff && data.staff && data.staff.length ? `<details class="scx-sec staff-sc"><summary><b>Modération</b> · scrims des 14 derniers jours</summary>
          <div class="sc-list">${data.staff.map(staffRow).join("")}</div></details>` : "";

      if (mode === "team") {
        const findBtn = canPlay ? `<div class="tm-actions"><a class="btn solid sm" href="#/scrims">+ Proposer ou trouver un scrim</a></div>` : "";
        const emptyAll = !todoHtml && !upcoming.length && !myOpen.length && !past.length;
        app.innerHTML = teamShell("scrims", t, "Nos scrims", findBtn + (emptyAll ? emptyState("Pas encore de scrim", canPlay ? "Propose un créneau ou accepte celui d'une autre équipe : tout ce qui concerne vos scrims s'affichera ici." : "Le capitaine cale les scrims depuis la page Scrims.", canPlay ? `<a class="btn solid sm" href="#/scrims">Trouver un scrim</a>` : "") : todoHtml + upHtml + mineOpenHtml + pastHtml),
          "Les scrims de ton équipe : ce qui attend une action, ce qui est calé, et les derniers résultats.");
      } else {
        const todoNote = t && todo.length ? `<a class="callout scx-todo-note" href="#/nos-scrims"><b>${todo.length} scrim${todo.length > 1 ? "s" : ""} de ton équipe attend${todo.length > 1 ? "ent" : ""} une action</b> (score à envoyer ou à confirmer) → Nos scrims</a>` : "";
        app.innerHTML = panel("Scrims", head + todoNote + mineOpenHtml + openHtml + staffHtml, "Competitive Network");
      }
      bindScrims(app, data, () => viewScrims(app, mode), render);
    };
    scrimCtx.myDiv = myDiv;
    render();
    setLive(mode === "team" ? "/nos-scrims" : "/scrims", ["scrims", t && "team:" + t.id], () => viewScrims(app, mode));
  }

  // Scrim qui demande une action (résultat à envoyer ou à confirmer)
  function todoCard(s, t, isCap) {
    const home = s.host.id === t.id, opp = home ? s.guest : s.host;
    let msg = "", act = "";
    if (s.status === "cale") {
      msg = "Le scrim est passé : envoie le score." + lateInfo(s, t);
      // Absence déclarable 15 min après l'heure, plus le retard annoncé par l'adversaire
      const extra = s.late_team && s.late_team !== t.id ? s.late_minutes : 0;
      const late15 = Date.now() >= new Date(s.starts_at).getTime() + (15 + extra) * 60000;
      if (isCap) act = `<button class="btn sm solid" data-report="${s.id}" type="button">Envoyer le résultat</button>${late15 ? `<button class="link-btn danger-t" data-noshow="${s.id}" type="button">L'adversaire n'est pas venu</button>` : ""}${lateWindow(s) ? lateBtn(s) : ""}`;
    } else {
      const v = sideOf(s, t.id), o = outcome(v);
      msg = `L'adversaire a déclaré <b class="scx-score">${scoreText(v)}</b> (${o > 0 ? "victoire" : o < 0 ? "défaite" : "nul"} pour vous). C'est bon ?${mapChips(v)}`;
      if (isCap) act = `<button class="btn sm solid" data-confirm="${s.id}" type="button">Confirmer</button><button class="link-btn danger-t" data-refuse="${s.id}" type="button">Pas d'accord</button>`;
    }
    if (!isCap) act = `<span class="small-note">Le capitaine s'en occupe</span>`;
    return `<div class="scx-card sc-row" data-s="${s.id}">${when(s.starts_at)}
      <div class="scx-main"><span class="scx-vs">contre</span>${opponent(opp)}<p class="scx-msg">${msg}</p>${opp ? briefBtn(opp.id) : ""}</div>
      <div class="scx-act">${act}</div><div class="sc-form" hidden></div></div>`;
  }
  function upcomingCard(s, t, isCap) {
    const home = s.host.id === t.id, opp = home ? s.guest : s.host;
    return `<div class="scx-card">${when(s.starts_at)}
      <div class="scx-main"><span class="scx-vs">contre</span>${opponent(opp)}<div class="scx-tags">${tags(s)}${recoLine(opp)}</div>${lateInfo(s, t)}${opp ? briefBtn(opp.id) : ""}</div>
      <div class="scx-act">${isCap ? `${opp && opp.discord_id ? `<a class="btn sm" href="https://discord.com/users/${esc(opp.discord_id)}" target="_blank" rel="noopener">Contacter ${esc(opp.captain || "le capitaine")}</a>` : ""}${lateWindow(s) ? lateBtn(s) : ""}
        <button class="link-btn danger-t" data-cancel="${s.id}" type="button">${home ? "Annuler" : "Se désister"}</button>` : `<span class="scx-status ok">Calé</span>`}</div></div>`;
  }
  function openCard(s, t, isCap, canPlay) {
    const near = t && Math.abs(s.division - playDiv(t)) <= 1;
    const why = !state.session ? "Connecte-toi pour accepter" : !t ? "Il te faut une équipe" : !isCap ? "Réservé au capitaine"
      : t.status === "refusee" ? "Équipe refusée" : !near ? "Hors de ton niveau" : "";
    return `<div class="scx-card${why ? " off" : ""}">${when(s.starts_at)}
      <div class="scx-main">${opponent({ ...s.host, division: s.division })}<div class="scx-tags">${tags(s)}${s.note ? `<span class="scx-note">« ${esc(s.note)} »</span>` : ""}${t ? recoLine(s.host) : ""}</div>${briefBtn(s.host.id, "Voir l'adversaire")}</div>
      <div class="scx-act">${canPlay && near ? `<button class="btn sm solid" data-accept="${s.id}" type="button">Accepter</button>` : `<span class="small-note">${why}</span>`}</div></div>`;
  }
  function resultRow(s, t) {
    const home = s.host.id === t.id, opp = home ? s.guest : s.host;
    let badge, score = "", note = "";
    if (s.status === "annule") { badge = `<span class="scx-res x">ANN</span>`; note = s.cancel_late ? "Annulé tard" : "Annulé"; }
    else if (s.no_show) { const us = s.no_show === t.id; badge = `<span class="scx-res ${us ? "l" : "w"}">${us ? "ABS" : "V"}</span>`; note = us ? "Absence notée pour nous" : "Adversaire absent"; }
    else {
      const v = sideOf(s, t.id), o = outcome(v);
      const r = o > 0 ? "w" : o < 0 ? "l" : "d";
      badge = `<span class="scx-res ${r}">${r === "w" ? "V" : r === "l" ? "D" : "N"}</span>`;
      score = `<b class="scx-score"${mapsTitle(v)}>${scoreText(v)}</b>`;
      if (!s.confirmed) note = "En attente de confirmation";
    }
    if (s.ranked === false) note = note ? note + " · hors classement" : "Hors classement";
    return `<div class="scx-rrow">${badge}<span class="scx-rdate">${dayLabel(s.starts_at)}</span>
      <span class="scx-ropp">${opp ? `${teamLogo(opp, 24)}<b>${esc(opp.name)}</b>` : "—"}</span>${score}<span class="small-note">${note}</span></div>`;
  }
  function staffRow(s) {
    const res = s.no_show ? `absence de ${esc(s.no_show === s.host.id ? s.host.tag : s.guest && s.guest.tag)}` : s.host_score != null ? `${s.host_score} – ${s.guest_score}${s.map_scores ? ` (${esc(s.map_scores.map(m => `${m.map} ${m.h}-${m.g}`).join(", "))})` : ""}${s.confirmed ? "" : " (non confirmé)"}` : s.status === "cale" ? "calé" : s.status;
    return `<div class="sc-row">${dateTile(s.starts_at)}<div class="sc-main"><span class="sc-team">${esc(s.host.tag)} vs ${esc(s.guest ? s.guest.tag : "?")}</span><span class="small-note">${res}</span></div>
      <div class="sc-act"><button class="link-btn" data-sreset="${s.id}" type="button">Remettre à zéro</button><button class="link-btn danger-t" data-sdel="${s.id}" type="button">Supprimer</button></div></div>`;
  }
  function bindScrims(app, data, reload, rerender) {
    const err = $("#sc-err");
    if ($("#sc-login")) $("#sc-login").onclick = login;
    const form = $("#scrim-form"), openBtn = $("#sc-open");
    if (openBtn) openBtn.onclick = () => { form.hidden = !form.hidden; openBtn.setAttribute("aria-expanded", String(!form.hidden)); if (!form.hidden) $("#sc-date").focus(); };
    if ($("#sc-close")) $("#sc-close").onclick = () => { form.hidden = true; openBtn.setAttribute("aria-expanded", "false"); };
    app.querySelectorAll("[data-addmap]").forEach(b => b.onclick = () => {
      const inp = $("#sc-maps"), cur = inp.value.split("+").map(x => x.trim()).filter(Boolean);
      if (cur.some(x => x.toLowerCase() === b.dataset.addmap.toLowerCase())) return;
      const v = [...cur, b.dataset.addmap].join(" + ");
      if (v.length <= 60) { inp.value = v; b.classList.add("on"); }
    });
    app.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { const v = b.dataset.f; scrimFilter.div = /^\d$/.test(v) ? +v : v; rerender(); });
    if (form) form.onsubmit = async e => {
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
    app.querySelectorAll("[data-late]").forEach(b => b.onclick = () => { const p = b.nextElementSibling; p.hidden = !p.hidden; });
    app.querySelectorAll("[data-latemin]").forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await rpc("scrim_late", { p_id: b.dataset.for, p_minutes: +b.dataset.latemin }); feed("scrim", b.dataset.for, true); toast(`Retard annoncé (${b.dataset.latemin} min) : l'autre capitaine est prévenu sur Discord.`); reload(); }
      catch (x) { toast(errMsg(x), "err"); b.disabled = false; }
    });
    app.querySelectorAll("[data-noshow]").forEach(b => confirmable(b, "Confirmer l'absence ?", async () => {
      try { await rpc("report_no_show", { p_id: b.dataset.noshow }); feed("scrim", b.dataset.noshow); toast("Absence enregistrée."); reload(); } catch (x) { toast(errMsg(x), "err"); } }));
    app.querySelectorAll("[data-confirm]").forEach(b => b.onclick = async () => {
      try { await rpc("confirm_scrim", { p_id: b.dataset.confirm, p_accept: true }); feed("scrim", b.dataset.confirm); toast("Résultat confirmé."); reload(); } catch (x) { toast(errMsg(x), "err"); } });
    app.querySelectorAll("[data-refuse]").forEach(b => confirmable(b, "Sûr ?", async () => {
      try { await rpc("confirm_scrim", { p_id: b.dataset.refuse, p_accept: false }); toast("Résultat refusé : il faut le renvoyer. En cas de désaccord, ouvre un ticket dans #support."); reload(); } catch (x) { toast(errMsg(x), "err"); } }));
    app.querySelectorAll("[data-report]").forEach(b => b.onclick = () => openReport(b.dataset.report));
    // Résultat map par map : une ligne par map jouée (le nombre de lignes suit le format du scrim)
    async function openReport(id) {
      const f = $(`.sc-row[data-s="${id}"] .sc-form`, app);
      if (!f.hidden) { f.hidden = true; return; }
      const s = data.mine.find(x => x.id === id); if (!s) return;
      const maps = await mapList();
      const named = maps.filter(m => new RegExp(`\\b${m.name}\\b`, "i").test(s.maps || "")).map(m => m.name);
      const bo = /bo\s*(\d)/i.exec(s.format || ""); const count = Math.max(1, Math.min(5, bo ? (+bo[1] === 3 ? 2 : +bo[1]) : 1, 5), named.length);
      const rows = Array.from({ length: Math.min(count, 5) }, (_, i) => named[i] || "");
      const opts = sel => `<option value="">Map…</option>${maps.map(m => `<option${m.name === sel ? " selected" : ""}>${esc(m.name)}</option>`).join("")}`;
      const rowHtml = (m, i) => `<div class="rep-row"><span class="rep-n">${i + 1}</span><select class="rep-map" aria-label="Map ${i + 1}">${opts(m)}</select>
          <input class="rep-us" type="number" min="0" max="99" inputmode="numeric" aria-label="Nos rounds" placeholder="Nous">
          <span>–</span><input class="rep-them" type="number" min="0" max="99" inputmode="numeric" aria-label="Leurs rounds" placeholder="Eux">
          <button class="link-btn danger-t rep-del" type="button" aria-label="Retirer cette map">×</button></div>`;
      f.hidden = false;
      f.innerHTML = `<form class="sc-report"><span class="hint">Rounds de chaque map jouée (nous – eux). En BO3, le vainqueur est celui qui gagne le plus de maps.</span>
        <div class="rep-rows">${rows.map(rowHtml).join("")}</div>
        <div class="rep-foot"><button class="link-btn rep-add" type="button">+ Ajouter une map</button><span class="rep-sum small-note"></span>
          <button class="btn sm solid" type="submit">Envoyer</button></div><p class="form-err" role="alert"></p></form>`;
      const list = $(".rep-rows", f), er = $(".form-err", f);
      const read = () => [...list.querySelectorAll(".rep-row")].map(r => ({ map: $(".rep-map", r).value, us: $(".rep-us", r).value, them: $(".rep-them", r).value }));
      const renum = () => {
        [...list.children].forEach((r, i) => { $(".rep-n", r).textContent = i + 1; });
        $(".rep-add", f).hidden = list.children.length >= 5;
        list.querySelectorAll(".rep-del").forEach(x => { x.hidden = list.children.length <= 1; });
        const v = read().filter(x => x.us !== "" && x.them !== "");
        const us = v.reduce((a, x) => a + +x.us, 0), them = v.reduce((a, x) => a + +x.them, 0);
        const mw = v.filter(x => +x.us > +x.them).length, ml = v.filter(x => +x.us < +x.them).length;
        $(".rep-sum", f).textContent = v.length ? (read().length > 1 ? `Maps ${mw} – ${ml} · rounds ${us} – ${them}` : `${us} – ${them}`) : "";
      };
      list.oninput = renum;
      list.onclick = e => { const d = e.target.closest(".rep-del"); if (d && list.children.length > 1) { d.closest(".rep-row").remove(); renum(); } };
      $(".rep-add", f).onclick = () => { if (list.children.length < 5) { list.insertAdjacentHTML("beforeend", rowHtml("", list.children.length)); renum(); $(".rep-map", list.lastElementChild).focus(); } };
      renum();
      (rows[0] ? $(".rep-us", list) : $(".rep-map", list)).focus();
      $("form", f).onsubmit = async e => {
        e.preventDefault(); er.textContent = "";
        const v = read();
        if (v.some(x => !x.map)) return er.textContent = "Choisis la map de chaque ligne.";
        if (new Set(v.map(x => x.map)).size !== v.length) return er.textContent = "Une map est en double.";
        if (v.some(x => x.us === "" || x.them === "")) return er.textContent = "Entre les deux scores de chaque map.";
        try { await rpc("report_scrim_maps", { p_id: id, p_maps: v.map(x => ({ map: x.map, for: +x.us, against: +x.them })) }); feed("scrim", id); toast("Résultat envoyé : l'autre capitaine doit confirmer."); reload(); }
        catch (x) { er.textContent = errMsg(x); }
      };
    }
    app.querySelectorAll("[data-sreset]").forEach(b => confirmable(b, "Confirmer ?", async () => {
      try { await rpc("admin_reset_scrim", { p_id: b.dataset.sreset }); toast("Scrim remis à zéro."); reload(); } catch (x) { toast(errMsg(x), "err"); } }));
    app.querySelectorAll("[data-sdel]").forEach(b => confirmable(b, "Supprimer ?", async () => {
      try { await rpc("admin_delete_scrim", { p_id: b.dataset.sdel }); toast("Scrim supprimé."); reload(); } catch (x) { toast(errMsg(x), "err"); } }));
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
          : lfgFilter.div || lfgFilter.role ? emptyState("Personne avec ces filtres", "Essaie une autre division ou un autre rôle.")
          : emptyState(lfgFilter.tab === "joueurs" ? "Aucun joueur ne cherche d'équipe pour l'instant" : "Aucune équipe ne recrute pour l'instant",
              "Publie ton annonce : elle apparaît ici et sur le Discord.")}`, "Recrutement");
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
    setLive("/recherche", ["lfg"], () => viewRecherche(app));
  }
  function lfgForm(kind, post, p) {
    const v = post || { roles: [], dispo: "", message: "" };
    const title = kind === "joueur" ? (post ? "Ton annonce" : "Je cherche une équipe") : (post ? "Annonce de ton équipe" : "Mon équipe recrute");
    const missing = kind === "joueur" && (!p || !p.riot_id || p.rank == null);
    return `<details class="card post-card"${!post && kind === "joueur" ? " open" : ""}><summary><b>${title}</b>${post ? `<span class="small-note"> · publiée ${new Date(post.created_at).toLocaleDateString(LOC())}, visible 30 jours</span>` : ""}</summary>
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
      <div class="lfg-head">${avatar(x.avatar_url, x.username, 40)}<div><a class="pl-link" href="${playerHref(x.user_id)}"><b>${esc(x.username)}</b></a><span class="small-note">${x.rank != null ? rankLabel(x.rank, 18) + (x.rank_source === "auto" ? " ✓" : "") : "Non classé"} · ${esc(x.riot_id || "")}</span></div>${divChip(x.division)}</div>
      <div class="lfg-roles">${roleTags(x.roles)}</div>
      ${x.dispo ? `<p class="lfg-line"><span>Dispo</span>${esc(x.dispo)}</p>` : ""}${x.message ? `<p class="lfg-msg">${esc(x.message)}</p>` : ""}
      <div class="lfg-foot"><span class="small-note">${ago(x.created_at)}</span>${x.mine ? `<span class="small-note">Ton annonce</span>` : discordLink(x.discord_id, "Contacter sur Discord")}${state.isStaff && !x.mine ? `<button class="link-btn danger-t" data-lfdel="${x.id}" type="button">Supprimer</button>` : ""}</div>
    </article>`;
  }
  function teamCard(x) {
    return `<article class="lfg-card">
      <div class="lfg-head">${teamLogo(x, 40)}<div><a class="pl-link" href="${teamHref(x.tag)}"><b>${esc(x.name)}</b></a><span class="small-note">${esc(x.tag)} · ${x.members}/7 joueurs${x.status !== "validee" ? " · en attente de validation" : ""}</span></div>${divChip(x.division)}</div>
      <div class="lfg-roles"><span class="small-note">Cherche :</span>${roleTags(x.roles)}</div>
      ${x.dispo ? `<p class="lfg-line"><span>Dispo</span>${esc(x.dispo)}</p>` : ""}${x.message ? `<p class="lfg-msg">${esc(x.message)}</p>` : ""}
      <div class="lfg-foot"><span class="small-note">${ago(x.created_at)}</span>${x.mine ? `<span class="small-note">Ton annonce</span>` : discordLink(x.discord_id, "Contacter " + esc(x.captain || "le capitaine"))}${state.isStaff && !x.mine ? `<button class="link-btn danger-t" data-lfdel="${x.id}" type="button">Supprimer</button>` : ""}</div>
    </article>`;
  }

  // ---------- Saisons ----------
  // Le classement repart de zéro à chaque saison ; les saisons terminées gardent leur classement figé.
  let seasonsCache = null;
  async function loadSeasons(force) {
    if (!sb) return [];
    if (seasonsCache && !force && Date.now() - seasonsCache.at < 60000) return seasonsCache.list;
    const { data } = await sb.from("seasons").select("id,name,starts_at,ends_at").order("id", { ascending: false });
    seasonsCache = { at: Date.now(), list: data || [] };
    return seasonsCache.list;
  }
  const currentSeason = list => (list || []).find(x => !x.ends_at) || null;
  const monthYear = iso => new Date(iso).toLocaleDateString(LOC(), { month: "short", year: "numeric" });
  // Nom de la saison en cours sur l'accueil
  async function paintSeason() {
    const cur = currentSeason(await loadSeasons().catch(() => []));
    if (cur) document.querySelectorAll("[data-season]").forEach(el => { el.textContent = cur.name; });
  }

  // ---------- Classement des scrims ----------
  const rankFilter = { div: undefined, season: undefined };
  async function viewClassement(app) {
    if (!sb) { app.innerHTML = panel("Classement", `<p class="lead">Bientôt disponible.</p>`); return; }
    const seasons = await loadSeasons(true);
    const cur = currentSeason(seasons);
    if (rankFilter.season === undefined || !seasons.some(x => x.id === rankFilter.season)) rankFilter.season = cur ? cur.id : null;
    const sel = seasons.find(x => x.id === rankFilter.season) || null;
    const archived = sel && sel.ends_at;
    let rows;
    if (archived) {
      const { data } = await sb.from("season_standings").select("*").eq("season_id", sel.id).order("division").order("pos");
      rows = data || [];
    } else rows = await rpc("scrim_leaderboard");
    if (rankFilter.div === undefined) rankFilter.div = state.team && state.team.status === "validee" ? state.team.division : 1;
    const seasonChips = seasons.length > 1 || cur ? `<div class="season-tabs" role="group" aria-label="Saison">${seasons.map(x =>
        `<button type="button" class="season-tab${x.id === rankFilter.season ? " on" : ""}" data-season-id="${x.id}" aria-pressed="${x.id === rankFilter.season}">
          <b>${esc(x.name)}</b><small>${x.ends_at ? `${monthYear(x.starts_at)} – ${monthYear(x.ends_at)}` : `en cours · depuis ${new Date(x.starts_at).toLocaleDateString(LOC(), { day: "numeric", month: "short" })}`}</small></button>`).join("")}</div>` : "";
    const render = () => {
      const list = rows.filter(r => r.division === rankFilter.div);
      app.innerHTML = panel("Classement des scrims", `
        ${seasonChips}
        ${archived ? `<p class="callout season-note"><b>${esc(sel.name)} est terminée.</b> Voici son classement final, figé le ${new Date(sel.ends_at).toLocaleDateString(LOC(), { day: "numeric", month: "long", year: "numeric" })}.</p>` : ""}
        <p class="lead">Les résultats des scrims, division par division${cur && !archived ? `, pour la <b>${esc(cur.name)}</b>` : ""}. Victoire 3 points, nul 1 point. Quand le score de chaque map est envoyé, c'est le nombre de maps gagnées qui désigne le vainqueur. La fiabilité baisse avec les absences et les annulations de dernière minute.</p>
        <div class="filters">${chipRow("div", rankFilter.div, [[1, "D1"], [2, "D2"], [3, "D3"], [4, "D4"]], "Division")}</div>
        ${list.length ? `<div class="table-scroll"><table class="standings rank-table">
          <thead><tr><th>#</th><th>Équipe</th><th title="Scrims joués">J</th><th title="Victoires">V</th><th title="Nuls">N</th><th title="Défaites">D</th><th title="Maps gagnées – perdues (scrims avec le score de chaque map)">Maps</th><th title="Différence de rounds">+/-</th><th>Pts</th><th title="Scrims honorés">Fiab.</th></tr></thead>
          <tbody>${list.map((r, i) => `<tr class="${state.team && r.team_id === state.team.id ? "me" : ""}"><td class="pos">${i + 1}</td>
            <td><a class="pl pl-link" href="${teamHref(r.tag)}">${teamLogo(r, 26)}<b>${esc(r.name)}</b></a></td><td>${r.played}</td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td>
            <td class="mute">${r.mw + r.ml ? `${r.mw}-${r.ml}` : "–"}</td><td>${r.rf - r.ra > 0 ? "+" : ""}${r.rf - r.ra}</td><td class="pts">${r.points}</td>
            <td><span class="fiab${r.reliability >= 90 ? " ok" : r.reliability >= 70 ? " mid" : " bad"}" title="${r.no_shows} absence(s), ${r.late_cancels} annulation(s) tardive(s)">${r.reliability} %</span></td></tr>`).join("")}</tbody></table></div>
          <p class="small-note legend">Un résultat compte quand l'adversaire le confirme, ou automatiquement 48 h après s'il ne répond pas.</p>`
          : archived ? emptyState(`Aucun scrim joué en D${rankFilter.div} pendant cette saison`, "Choisis une autre division ou une autre saison.")
          : emptyState(`Pas encore de scrim classé en D${rankFilter.div}`, "Le classement se remplit à chaque scrim confirmé entre deux équipes validées.", nextStepCta())}
        <div class="ctas" style="margin-top:24px"><a class="btn" href="#/scrims">Trouver un scrim</a></div>`, "Scrims");
      app.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { rankFilter.div = +b.dataset.v; render(); });
      app.querySelectorAll("[data-season-id]").forEach(b => b.onclick = () => { rankFilter.season = +b.dataset.seasonId; viewClassement(app); });
    };
    render();
    setLive("/classement", ["scrims", "teams"], () => viewClassement(app));
  }


  // ================= Pages publiques : équipe et joueur =================
  const resBadge = r => r.no_show ? `<span class="t-res ff">ABS</span>` : `<span class="t-res ${outcome(r) > 0 ? "w" : outcome(r) < 0 ? "l" : "d"}">${outcome(r) > 0 ? "V" : outcome(r) < 0 ? "D" : "N"}</span>`;
  const oppLink = r => `<a class="t-opp pl-link" href="${teamHref(r.opp_tag)}">${teamLogo({ logo_url: r.opp_logo, tag: r.opp_tag }, 26)}<b>${esc(r.opp)}</b></a>`;
  const shortDate = iso => new Date(iso).toLocaleDateString(LOC(), { day: "numeric", month: "short" });
  const memberSince = iso => new Date(iso).toLocaleDateString(LOC(), { month: "long", year: "numeric" });

  async function viewTeamPublic(app, tag) {
    const [d, maps] = await Promise.all([rpc("team_public", { p_tag: tag }), mapList()]);
    if (!d) { app.innerHTML = panel("Équipe introuvable", `<p class="lead">Aucune équipe avec le tag « ${esc(tag)} ».</p><div class="ctas" style="margin-top:24px"><a class="btn" href="#/equipes">Voir les équipes</a></div>`); return; }
    const t = d.team, st = d.standing, sc = d.scrims || { results: [], next: [] }, roster = d.roster || [];
    const order = r => (r.is_captain ? 0 : r.role === "titulaire" ? 1 : 2);
    roster.sort((a, b) => order(a) - order(b));
    const mine = state.team && state.team.id === t.id;
    const canChallenge = state.team && state.team.is_captain && state.team.status === "validee" && !mine;
    app.innerHTML = panel(`${teamLogo(t, 72)}<span>${esc(t.name)}</span> <span class="tag-chip">${esc(t.tag)}</span>`, `
      <div class="team-status">${statusPill(t)}<span class="small-note">Sur le réseau depuis ${memberSince(t.created_at)} · ${roster.length} joueur${roster.length > 1 ? "s" : ""}</span></div>
      ${st ? `<div class="t-stats pub-stats">
          <div><b>${st.pos}<sup>${st.pos === 1 ? "er" : "e"}</sup></b><span>sur ${st.of} en D${t.division}</span></div>
          <div><b>${st.wins}<i>-</i>${st.draws}<i>-</i>${st.losses}</b><span>victoires, nuls, défaites</span></div>
          <div><b>${st.diff > 0 ? "+" : ""}${st.diff}</b><span>différence de rounds</span></div>
          <div><b>${st.reliability}<small>%</small></b><span>fiabilité${st.no_shows ? ` · ${st.no_shows} absence${st.no_shows > 1 ? "s" : ""}` : ""}</span></div>
        </div>` : `<p class="small-note pub-gap">Pas encore de scrim confirmé : le bilan apparaîtra après le premier.</p>`}
      ${d.recruit ? `<div class="callout info pub-gap"><b>L'équipe recrute</b>${d.recruit.roles && d.recruit.roles.length ? " : " + esc(d.recruit.roles.join(", ")) : ""}.${d.recruit.dispo ? ` Dispos : ${esc(d.recruit.dispo)}.` : ""}${d.recruit.message ? `<br>${esc(d.recruit.message)}` : ""}${d.contact && !mine ? ` <a href="https://discord.com/users/${esc(d.contact)}" target="_blank" rel="noopener">Contacter le capitaine</a>` : ""}</div>` : ""}
      <h3 class="t-h">Roster</h3>
      <div class="pub-roster">${roster.map(r => `<a class="pub-player${r.role === "remplacant" ? " sub" : ""}" href="${playerHref(r.user_id)}">
          ${avatar(r.avatar_url, r.username, 56)}
          <b>${esc(r.username)}</b>
          <span class="small-note">${r.rank != null ? rankLabel(r.rank, 18) : "Non classé"}${rankMark(r)}</span>
          <span class="pub-role">${r.is_captain ? "Capitaine" : r.role === "titulaire" ? "Titulaire" : "Remplaçant"}</span>
        </a>`).join("") || `<p class="small-note">Aucun joueur.</p>`}</div>
      <h3 class="t-h">Map pool</h3>${poolView(await teamPool(t.id), maps)}
      <h3 class="t-h">Résultats par map</h3>${mapStats(d.map_stats)}
      <div class="t-cols">
        <div><h3 class="t-h">Derniers résultats</h3>${sc.results.length ? `<div class="t-lines">${sc.results.map(r => `<div class="t-line">${resBadge(r)}${oppLink(r)}<span class="small-note">${shortDate(r.starts_at)} · ${esc(r.format)}</span><span class="t-score"${mapsTitle(r)}>${scoreText(r)}</span></div>${mapChips(r)}`).join("")}</div>` : `<p class="small-note">Aucun résultat pour l'instant.</p>`}</div>
        <div><h3 class="t-h">Prochains scrims</h3>${sc.next.length ? `<div class="t-lines">${sc.next.map(r => `<div class="t-line"><span class="t-res next">${shortDate(r.starts_at)}</span>${oppLink(r)}<span class="small-note">${hourLabel(r.starts_at)} · ${esc(r.format)}</span><span></span></div>`).join("")}</div>` : `<p class="small-note">Aucun scrim calé.</p>`}</div>
      </div>
      <div class="ctas" style="margin-top:32px">${canChallenge ? `<a class="btn solid" href="#/scrims">Défier en scrim</a>${briefBtn(t.id, "Fiche adversaire")}` : ""}${mine ? `<a class="btn" href="#/espace">Tableau de bord de l'équipe</a>` : ""}<a class="btn" href="#/equipes">Toutes les équipes</a></div>`, "Équipe");
    setLive(location.hash.slice(1), ["teams", "scrims", "lfg", "team:" + t.id], () => viewTeamPublic(app, tag));
  }

  async function viewPlayer(app, id) {
    const d = /^[0-9a-f-]{36}$/i.test(id) ? await rpc("player_public", { p_user: id }) : null;
    if (!d) { app.innerHTML = panel("Joueur introuvable", `<p class="lead">Ce profil n'existe pas ou a été supprimé.</p>`); return; }
    const p = d.profile, t = d.team, me = state.session && state.session.user.id === p.id;
    app.innerHTML = panel(`${avatar(p.avatar_url, p.username, 72)}<span>${esc(p.username)}</span>${p.staff ? ` <span class="tag-chip">Staff</span>` : ""}`, `
      <div class="pub-grid">
        <div class="card">
          <span class="eyebrow">Rang</span>
          <div class="pub-rank">${p.rank != null ? rankLabel(p.rank, 48) : "<b>Non classé</b>"}${rankMark(p)}</div>
          <p class="small-note">${p.rank_source === "auto" ? "Vérifié automatiquement depuis le compte Riot." : p.rank_source === "staff" ? "Fixé par le staff." : p.rank != null ? "Déclaré par le joueur, pas encore vérifié." : ""}</p>
          ${p.riot_id ? `<p class="mono">${esc(p.riot_id)}</p>` : ""}
        </div>
        <div class="card">
          <span class="eyebrow">Équipe</span>
          ${t ? `<a class="pub-team pl-link" href="${teamHref(t.tag)}">${teamLogo(t, 48)}<span><b>${esc(t.name)}</b><span class="small-note">${t.is_captain ? "Capitaine" : t.role === "titulaire" ? "Titulaire" : "Remplaçant"}${t.status === "validee" && t.division ? " · " + DIV_NAMES[t.division] : ""}</span></span></a>`
               : `<p class="small-note">Sans équipe pour l'instant.</p>`}
        </div>
      </div>
      ${d.lfg ? `<div class="callout info pub-gap"><b>Cherche une équipe</b>${d.lfg.roles && d.lfg.roles.length ? " : " + esc(d.lfg.roles.join(", ")) : ""}.${d.lfg.dispo ? ` Dispos : ${esc(d.lfg.dispo)}.` : ""}${d.lfg.message ? `<br>${esc(d.lfg.message)}` : ""}${d.contact && !me ? ` <a href="https://discord.com/users/${esc(d.contact)}" target="_blank" rel="noopener">Contacter sur Discord</a>` : ""}</div>` : ""}
      <p class="small-note pub-gap">Sur le réseau depuis ${memberSince(p.created_at)}.</p>
      ${me ? `<div class="ctas" style="margin-top:20px"><a class="btn" href="#/profil">Modifier mon profil</a></div>` : ""}`, "Joueur");
    setLive(location.hash.slice(1), ["teams", "lfg"], () => viewPlayer(app, id));
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
      box.innerHTML = roster.map(r => `<a class="t-player${r.role === "remplacant" ? " sub" : ""}" href="${playerHref(r.user_id)}">
          ${r.avatar_url ? `<img src="${esc(r.avatar_url)}" alt="" width="96" height="96" referrerpolicy="no-referrer" loading="lazy">` : `<span class="t-initial">${esc((r.username || "?").slice(0, 1).toUpperCase())}</span>`}
          <b class="t-name${(r.username || "").length > 9 ? " long" : ""}">${esc(r.username)}</b>
          <span class="t-meta">${r.rank != null ? rankLabel(r.rank, 20) : "Non classé"}</span>
          <span class="t-role">${r.is_captain ? "Capitaine" : r.role === "titulaire" ? "Titulaire" : "Remplaçant"}</span>
        </a>`).join("");
      // Bilan : chiffres du classement + derniers résultats + prochains scrims (toujours affiché)
      const rec = await rpc("team_recent_scrims", { p_team: t.id }).catch(() => ({ results: [], next: [] }));
      const me = lb.find(r => r.team_id === t.id) || { played: 0, wins: 0, draws: 0, losses: 0, rf: 0, ra: 0, reliability: 100, division: t.division };
      const div = lb.filter(r => r.division === me.division), pos = div.findIndex(r => r.team_id === t.id) + 1;
      const diff = me.rf - me.ra;
      const res = r => r.no_show ? `<span class="t-res ff">ABS</span>` : `<span class="t-res ${outcome(r) > 0 ? "w" : outcome(r) < 0 ? "l" : "d"}">${outcome(r) > 0 ? "V" : outcome(r) < 0 ? "D" : "N"}</span>`;
      const line = (r, past) => `<div class="t-line">${past ? res(r) : `<span class="t-res next">${new Date(r.starts_at).toLocaleDateString(LOC(), { day: "numeric", month: "short" })}</span>`}
          <span class="t-opp">${teamLogo({ logo_url: r.opp_logo, tag: r.opp_tag }, 28)}<b>${esc(r.opp)}</b></span>
          <span class="small-note">${past ? new Date(r.starts_at).toLocaleDateString(LOC(), { day: "numeric", month: "short" }) + " · " : new Date(r.starts_at).toLocaleTimeString(LOC(), { hour: "2-digit", minute: "2-digit" }) + " · "}${esc(r.format)}</span>
          ${past ? `<span class="t-score"${mapsTitle(r)}>${scoreText(r)}</span>` : `<span></span>`}</div>`;
      $("#team-bilan").innerHTML = `<div class="t-stats">
          <div><b>${me.played}</b><span>scrims joués</span></div>
          <div><b>${me.wins}<i>-</i>${me.draws}<i>-</i>${me.losses}</b><span>victoires, nuls, défaites</span></div>
          <div><b>${diff > 0 ? "+" : ""}${diff}</b><span>différence de rounds</span></div>
          <div><b>${pos ? pos + `<sup>${pos === 1 ? "er" : "e"}</sup>` : "–"}</b><span>${pos ? `sur ${div.length} en D${me.division}` : `classement D${me.division || "?"}`}</span></div>
        </div>
        <div class="t-cols">
          <div><h3 class="t-h">Derniers résultats</h3>${rec.results.length ? `<div class="t-lines">${rec.results.map(r => line(r, true)).join("")}</div>`
            : `<p class="small-note">Pas encore de scrim joué cette saison. Le bilan se remplit après chaque scrim confirmé.</p>`}</div>
          <div><h3 class="t-h">Prochains scrims</h3>${rec.next.length ? `<div class="t-lines">${rec.next.map(r => line(r, false)).join("")}</div>`
            : `<p class="small-note">Aucun scrim calé pour l'instant.</p>`}
            <div class="ctas" style="margin-top:18px"><a class="btn" href="#/classement">Classement</a><a class="btn" href="#/scrims">Nous défier en scrim</a></div></div>
        </div>`;
      const post = lfg && lfg.teams.find(x => x.team_id === t.id);
      if (post) {
        $("#team-recrute").innerHTML = `<div class="t-recruit"><div><span class="eyebrow">On recrute</span><h2>PRIZM recrute${post.roles.length ? " : " + esc(post.roles.join(", ")) : ""}</h2>
          ${post.message ? `<p class="lead">${esc(post.message)}</p>` : ""}${post.dispo ? `<p class="small-note">Dispos : ${esc(post.dispo)}</p>` : ""}</div>
          <div class="ctas">${post.discord_id ? `<a class="btn solid" href="https://discord.com/users/${esc(post.discord_id)}" target="_blank" rel="noopener">Contacter ${esc(post.captain || "le capitaine")}</a>` : ""}<a class="btn" href="#/recherche">Voir l'annonce</a></div></div>`;
        $("#recrute").hidden = false;
      }
    } catch (e) { box.innerHTML = `<p class="small-note">Le roster n'a pas pu être chargé.</p>`; }
  }

  // ================= Espace équipe : le tableau de bord =================
  const CB_STATUS = [["validated", "Prêtes", "ok"], ["testing", "En test", "warn"], ["needs_work", "À revoir", "bad"], ["todo", "Brouillons", "mute"]];

  // ================= Mon équipe : un seul endroit, un menu sur le côté =================
  const TM_ICONS = {
    espace: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
    scrims: "M4 5h16v16H4zM4 10h16M9 3v4M15 3v4",
    compos: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8",
    strats: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
    roster: "M4 6h16v12H4zM8 10h3M8 14h8M15 10h1",
    reglages: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  };
  const TEAM_NAV = [
    ["espace", "#/espace", "Tableau de bord"],
    ["scrims", "#/nos-scrims", "Nos scrims"],
    ["compos", "compo/", "Compos"],
    ["strats", "compo/#/strats", "Strats"],
    ["roster", "#/mon-equipe", "Roster"],
    ["reglages", "#/reglages", "Réglages"],
  ];
  const TEAM_ROUTES = ["#/espace", "#/nos-scrims", "#/mon-equipe", "#/reglages"];
  const tmIcon = k => TM_ICONS[k] ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${TM_ICONS[k]}"/></svg>` : "";
  function teamSide(active, t) {
    const sub = t.status === "validee" ? DIV_NAMES[t.division] : t.status === "refusee" ? "Refusée" : "En attente de validation";
    return `<aside class="tm-side">
        <a class="tm-id" href="${teamHref(t.tag)}" title="Page publique de l'équipe">${teamLogo(t, 40)}<span><b>${esc(t.name)}</b><small class="${t.status === "validee" ? "ok" : t.status === "refusee" ? "bad" : "wait"}">${esc(sub)}</small></span></a>
        <nav class="tm-nav" aria-label="Mon équipe">${TEAM_NAV.map(([k, href, label, isSub]) =>
          `<a class="tm-link${isSub ? " sub" : ""}${k === active ? " on" : ""}" href="${href}"${k === active ? ` aria-current="page"` : ""}>${tmIcon(k)}<span>${label}</span></a>`).join("")}</nav>
      </aside>`;
  }
  // Page de l'équipe : menu à gauche, contenu à droite
  const teamShell = (active, t, title, inner, lead = "") =>
    `<div class="wrap app-wrap tm">${teamSide(active, t)}<div class="tm-main">
      <div class="tm-head"><h2 class="tm-title">${title}</h2>${lead ? `<p class="tm-lead">${lead}</p>` : ""}</div>${inner}</div></div>`;

  const CB_LABEL = { validated: ["Prête", "ok"], testing: ["En test", "warn"], needs_work: ["À revoir", "bad"], todo: ["Brouillon", "mute"] };
  const POOL_LABEL = { forte: "Forte", jouable: "Jouable", ban: "Ban" };
  // « dans 2 j », « dans 3 h », « en cours »
  function countdown(iso) {
    const ms = new Date(iso) - Date.now();
    if (ms <= 0) return "c'est l'heure";
    const h = Math.round(ms / 3600000);
    return h < 1 ? `dans ${Math.max(1, Math.round(ms / 60000))} min` : h < 36 ? `dans ${h} h` : `dans ${Math.round(h / 24)} j`;
  }
  const mapsIn = (text, maps) => maps.filter(m => new RegExp(`\\b${m.name}\\b`, "i").test(text || ""));

  async function viewDashboard(app) {
    if (!state.session) return needLogin(app, "Ton espace équipe rassemble tes scrims, ton classement, les compos et le roster de ton équipe.");
    await loadMe();
    const t = state.team;
    if (!t) {
      app.innerHTML = panel("Mon équipe", `
        <p class="lead">Ici tu retrouveras tout ce qui concerne ton équipe : scrims, classement, compos, strats et roster. Il te faut d'abord une équipe.</p>
        <div class="ctas" style="margin-top:24px"><a class="btn solid" href="#/mon-equipe">Créer ou rejoindre une équipe</a><a class="btn" href="#/recherche">Chercher une équipe</a></div>`, "Mon équipe");
      setLive("/espace", [], () => viewDashboard(app));
      return;
    }
    const [d, data, pools, maps, seasons] = await Promise.all([rpc("team_dashboard"), rpc("list_scrims"), loadPools(), mapList(), loadSeasons().catch(() => [])]);
    const season = currentSeason(seasons);
    const isCap = !!t.is_captain, myPool = pools[t.id] || {};
    scrimCtx = { reco: other => other && hasPool(myPool) && hasPoolOf(pools, other.id) ? poolMatch(myPool, pools[other.id], maps).slice(0, 3) : [], t };
    const cb = (d && d.cb) || {}, st = d && d.standing, sc = (d && d.scrims) || { results: [] };
    const cbMaps = (d && d.cb_maps) || {}, mapStats = Object.fromEntries(((d && d.map_stats) || []).map(m => [m.map, m]));

    // Scrims de l'équipe : à faire et calés
    const now = Date.now(), todo = [], upcoming = [];
    for (const s of data.mine || []) {
      const started = new Date(s.starts_at).getTime() <= now;
      if (s.status === "cale" && !started) upcoming.push(s);
      else if (s.status === "cale") todo.push(s);
      else if (s.status === "termine" && !s.no_show && !s.confirmed && s.reported_by !== t.id) todo.push(s);
    }
    upcoming.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const next = upcoming[0];

    // À faire : d'abord les scrims, puis ce qui manque à l'équipe
    const extra = [];
    if (t.status === "en_attente") extra.push(`<a class="db-todo-line" href="#/mon-equipe"><b>!</b><span>L'équipe attend la validation du staff (il faut 5 titulaires). En attendant, tu peux déjà faire des scrims hors classement.</span><em>Voir le roster →</em></a>`);
    if (t.status === "refusee") extra.push(`<a class="db-todo-line" href="#/mon-equipe"><b>!</b><span>Équipe refusée : contacte le staff dans #support.</span></a>`);
    if (isCap && !hasPool(myPool)) extra.push(`<a class="db-todo-line" href="#/reglages"><b>+</b><span>Renseigne votre map pool : il sert à conseiller les maps face à chaque adversaire.</span><em>Réglages →</em></a>`);
    if (isCap && t.status !== "refusee" && !next && !d.open_posts) extra.push(`<a class="db-todo-line" href="#/scrims"><b>+</b><span>Aucun scrim calé : propose un créneau ou accepte une proposition.</span><em>Trouver un scrim →</em></a>`);
    const todoHtml = todo.length || extra.length ? `<section class="db-todo">
        <div class="db-head"><h3>À faire</h3><span class="small-note">${todo.length + extra.length} chose${todo.length + extra.length > 1 ? "s" : ""}</span></div>
        ${todo.length ? `<div class="scx-list">${todo.map(s => todoCard(s, t, isCap)).join("")}</div>` : ""}
        ${extra.join("")}</section>` : "";

    // Prochain scrim
    let nextHtml;
    if (next) {
      const opp = next.host.id === t.id ? next.guest : next.host;
      const reco = scrimCtx.reco(opp), named = mapsIn(next.maps, maps);
      const prepMaps = (named.length ? named : maps.filter(m => reco.includes(m.name)));
      nextHtml = `<section class="db-card db-next">
          <div class="db-head"><h3>Prochain scrim</h3><a class="link-btn" href="#/nos-scrims">Tous nos scrims</a></div>
          <div class="db-next-when"><b>${dayLabel(next.starts_at)}</b><span>${hourLabel(next.starts_at)}</span><em>${countdown(next.starts_at)}</em></div>
          <a class="db-next-vs pl-link" href="${teamHref(opp.tag)}">${teamLogo(opp, 52)}<span><small>contre</small><b>${esc(opp.name)}</b>${divChip(opp.division)}</span></a>
          <div class="scx-tags">${tags(next)}${reco.length && !named.length ? `<span class="scx-reco">Maps conseillées : <b>${reco.map(esc).join(", ")}</b></span>` : ""}</div>${lateInfo(next, t)}
          ${prepMaps.length ? `<div class="db-prep">${prepMaps.map(m => { const c = cbMaps[m.uuid], lab = c && c.status ? CB_LABEL[c.status] : null;
              return `<a class="db-prep-map" href="compo/#/editor/${esc(m.uuid || "")}"${m.img ? ` style="--img:url('${esc(m.img)}')"` : ""}><b>${esc(m.name)}</b><span class="${lab ? lab[1] : "mute"}">${lab ? "Compo " + lab[0].toLowerCase() : "Pas de compo"}${c && c.strats ? ` · ${c.strats} strat${c.strats > 1 ? "s" : ""}` : ""}</span></a>`; }).join("")}</div>` : ""}
          <div class="ctas db-next-ctas">${isCap && lateWindow(next) ? lateBtn(next) : ""}${briefBtn(opp.id, "Fiche adversaire")}${opp.discord_id && isCap ? `<a class="btn sm" href="https://discord.com/users/${esc(opp.discord_id)}" target="_blank" rel="noopener">Contacter ${esc(opp.captain || "le capitaine")}</a>` : ""}</div>
        </section>`;
    } else {
      nextHtml = `<section class="db-card db-next empty">
          <div class="db-head"><h3>Prochain scrim</h3><a class="link-btn" href="#/nos-scrims">Tous nos scrims</a></div>
          <p class="db-empty">Aucun scrim calé.${d.open_posts ? ` ${d.open_posts} proposition${d.open_posts > 1 ? "s" : ""} en attente d'adversaire.` : ""}</p>
          ${isCap && t.status !== "refusee" ? `<a class="btn solid sm" href="#/scrims">Trouver un scrim</a>` : !isCap ? `<p class="small-note">Le capitaine cale les scrims.</p>` : ""}
        </section>`;
    }

    // Bilan : classement + forme
    const recent = sc.results || [];
    const bilanHtml = `<section class="db-card db-bilan">
        <div class="db-head"><h3>Bilan${season ? ` <small class="db-season">${esc(season.name)}</small>` : ""}</h3><a class="link-btn" href="#/classement">Classement</a></div>
        ${st ? `<div class="db-stats">
            <div><b>${st.pos}<sup>${st.pos === 1 ? "er" : "e"}</sup></b><span>sur ${st.of} en D${t.division}</span></div>
            <div><b>${st.points}</b><span>points</span></div>
            <div><b>${st.wins}-${st.draws}-${st.losses}</b><span>V · N · D</span></div>
            <div><b>${st.reliability}<small>%</small></b><span>fiabilité</span></div>
          </div>` : `<p class="db-empty">Pas encore au classement : il apparaît après le premier scrim confirmé.</p>`}
        ${recent.length ? `<div class="db-form"><span class="eyebrow">Forme</span>${recent.slice(0, 5).map(r => `<span class="t-res ${r.no_show ? "ff" : outcome(r) > 0 ? "w" : outcome(r) < 0 ? "l" : "d"}" title="${esc(r.opp)} · ${shortDate(r.starts_at)}${r.no_show ? "" : " · " + scoreText(r, true)}">${r.no_show ? "ABS" : outcome(r) > 0 ? "V" : outcome(r) < 0 ? "D" : "N"}</span>`).join("")}</div>
          <div class="t-lines">${recent.slice(0, 3).map(r => `<div class="t-line">${resBadge(r)}<a class="t-opp pl-link" href="${teamHref(r.opp_tag)}"><b>${esc(r.opp)}</b></a><span class="small-note">${shortDate(r.starts_at)}</span><span class="t-score"${mapsTitle(r)}>${scoreText(r)}</span></div>`).join("")}</div>` : ""}
      </section>`;

    // Préparation des maps du pool compétitif
    const order = m => ({ forte: 0, jouable: 1 }[myPool[m.name]] ?? (myPool[m.name] === "ban" ? 3 : 2));
    const rows = [...maps].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
    const ready = rows.filter(m => (cbMaps[m.uuid] || {}).status === "validated").length;
    const prepHtml = `<section class="db-card db-maps">
        <div class="db-head"><h3>Préparation des maps</h3><span class="small-note">${ready}/${rows.length} maps avec une compo prête · <a class="link-btn" href="compo/">Ouvrir les compos</a></span></div>
        <div class="table-scroll"><table class="db-table">
          <thead><tr><th>Map</th><th>Pool</th><th>Compo</th><th>Strats</th><th title="Scrims avec le score de chaque map">Bilan</th></tr></thead>
          <tbody>${rows.map(m => { const c = cbMaps[m.uuid] || {}, lab = c.status ? CB_LABEL[c.status] : null, ms = mapStats[m.name], pl = myPool[m.name];
            const go = m.uuid ? `compo/#/editor/${esc(m.uuid)}` : "compo/";
            return `<tr class="${pl === "ban" ? "is-ban" : ""}">
              <td><a class="db-map" href="${go}"${m.img ? ` style="--img:url('${esc(m.img)}')"` : ""}><b>${esc(m.name)}</b></a></td>
              <td>${pl ? `<span class="pool-chip ${pl}">${POOL_LABEL[pl]}</span>` : `<span class="mute">—</span>`}</td>
              <td>${lab ? `<a class="db-status ${lab[1]}" href="${go}">${lab[0]}</a>${c.comps > 1 ? `<small class="mute"> +${c.comps - 1}</small>` : ""}` : `<a class="db-add" href="${go}">Créer</a>`}</td>
              <td>${c.strats ? `<a class="db-num" href="${go}">${c.strats}</a>` : `<span class="mute">0</span>`}</td>
              <td>${ms ? `<span class="db-rec"><b>${ms.wins}</b>V <b>${ms.losses}</b>D <i class="${ms.diff > 0 ? "up" : ms.diff < 0 ? "down" : ""}">${ms.diff > 0 ? "+" : ""}${ms.diff}</i></span>` : `<span class="mute">—</span>`}</td></tr>`; }).join("")}</tbody>
        </table></div>
        ${!hasPool(myPool) ? `<p class="small-note">Le map pool n'est pas renseigné${isCap ? ` : <a class="link-btn" href="#/reglages">le remplir dans Réglages</a>` : " : le capitaine peut le remplir"}.</p>` : ""}
      </section>`;

    app.innerHTML = teamShell("espace", t, "Tableau de bord", `${todoHtml}<div class="db-grid">${nextHtml}${bilanHtml}</div>${prepHtml}`,
      `${t.is_captain ? "Tu es capitaine" : cb.editor ? "Tu es éditeur des compos" : "Joueur de l'équipe"} · tout se met à jour en direct.`);
    bindScrims(app, data, () => viewDashboard(app), () => viewDashboard(app));
    setLive("/espace", ["scrims", "team:" + t.id, "cb:" + t.id], () => viewDashboard(app));
  }
  const hasPoolOf = (pools, id) => hasPool(pools[id]);

  // ---------- Réglages de l'équipe : map pool, invitation, logo, départ ----------
  async function viewSettings(app) {
    if (!state.session) return needLogin(app, "Les réglages de ton équipe : map pool, invitation, logo.");
    await loadMe();
    const t = state.team;
    if (!t) { location.hash = "#/mon-equipe"; return; }
    const [roster, pool, maps] = await Promise.all([rpc("team_roster", { p_team: t.id }), teamPool(t.id), mapList()]);
    const isCap = !!t.is_captain, me = state.session.user.id, locked = t.locked, code = t.invite_code;
    const inviteLink = location.origin + location.pathname + "?join=" + code + "#/mon-equipe";
    app.innerHTML = teamShell("reglages", t, "Réglages", `
      <section class="db-card set-pool">
        <div class="db-head"><h3>Map pool</h3>${isCap ? `<div class="set-pool-save"><span class="small-note" id="pool-state">Tout est enregistré</span><button class="btn sm solid" id="pool-save" type="button" disabled>Enregistrer</button></div>` : `<span class="small-note">Fixé par le capitaine</span>`}</div>
        <p class="small-note">Les ${maps.length} maps du pool compétitif actuel (mis à jour automatiquement à chaque acte). Sert à conseiller les maps face à chaque adversaire et à trier les maps quand vous proposez un scrim. Visible sur la page publique de l'équipe.</p>
        ${isCap ? `<div class="pool-edit">${maps.map(m => `<div class="pool-row" data-map="${esc(m.name)}">
            <span class="pool-name"${m.img ? ` style="--img:url('${esc(m.img)}')"` : ""}>${esc(m.name)}</span>
            <div class="pool-seg" role="group" aria-label="${esc(m.name)}">${POOL_LEVELS.map(([v, l]) => `<button type="button" class="${v}${pool[m.name] === v ? " on" : ""}" data-lvl="${v}" aria-pressed="${pool[m.name] === v}">${l}</button>`).join("")}</div>
          </div>`).join("")}</div>` : poolView(pool, maps)}
      </section>
      <div class="cards3 set-cards">
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
          <p class="small-note">${locked ? "Impossible pendant une compétition." : isCap ? (roster.length > 1 ? "Tu es capitaine : nomme un autre capitaine (page Roster) avant de partir." : "Tu es seul : quitter supprime l'équipe.") : "Tu pourras rejoindre une autre équipe ensuite."}</p>
          <button class="btn danger" id="leave" type="button" ${locked || (isCap && roster.length > 1) ? "disabled" : ""}>${isCap && roster.length === 1 ? "Supprimer l'équipe" : "Quitter l'équipe"}</button>
        </div>
      </div>`, "Ce qui ne change pas souvent. Le map pool ne s'enregistre que quand tu cliques sur « Enregistrer ».");

    const reload = () => viewSettings(app);
    if (isCap) bindPoolEditor(app, pool);
    if ($("#logo-file")) $("#logo-file").onchange = async e => {
      const f = e.target.files[0]; if (!f) return; $("#logo-err").textContent = "Envoi en cours…";
      try { await uploadTeamLogo(t.id, f); toast("Logo enregistré."); reload(); }
      catch (x) { $("#logo-err").textContent = errMsg(x); }
    };
    if ($("#logo-remove")) confirmable($("#logo-remove"), "Confirmer ?", async () => {
      try { await rpc("set_team_logo", { p_url: null }); await cleanLogos(t.id, null); toast("Logo retiré."); reload(); } catch (x) { toast(errMsg(x), "err"); } });
    $("#copy-inv").onclick = () => copyText(inviteLink, $("#inv-copied"), null);
    if ($("#regen")) confirmable($("#regen"), "Confirmer : l'ancien code ne marchera plus", async () => {
      try { await rpc("regenerate_invite"); toast("Nouveau code généré."); await loadMe(); reload(); } catch (x) { toast(errMsg(x), "err"); } });
    confirmable($("#leave"), "Clique encore pour confirmer", async () => {
      try { await rpc("leave_team"); discordSync({ user_ids: [me] }); toast("Tu as quitté l'équipe."); location.hash = "#/mon-equipe"; } catch (x) { toast(errMsg(x), "err"); } });
    setLive("/reglages", ["team:" + t.id], reload);
  }

  async function teamPool(id) {
    if (!sb) return {};
    const { data } = await sb.from("team_map_pools").select("pool").eq("team_id", id).maybeSingle();
    return (data && data.pool) || {};
  }
  // Éditeur du map pool : un clic classe la map, re-cliquer la retire ; rien n'est enregistré avant « Enregistrer »
  function bindPoolEditor(app, pool) {
    const saved = JSON.stringify(pool || {});
    pool = { ...pool };
    const info = $("#pool-state", app), btn = $("#pool-save", app);
    const dirty = () => JSON.stringify(Object.fromEntries(Object.entries(pool).sort())) !== JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(saved)).sort()));
    const refresh = () => {
      const d = dirty();
      btn.disabled = !d; info.textContent = d ? "Modifications non enregistrées" : "Tout est enregistré";
      info.classList.toggle("warn-t", d); live.editing = d ? app : null; unsaved.pool = d; unsaved.poolValue = () => pool;
    };
    app.querySelectorAll(".pool-row").forEach(row => row.querySelectorAll("[data-lvl]").forEach(b => b.onclick = () => {
      const m = row.dataset.map, v = b.dataset.lvl;
      if (pool[m] === v) delete pool[m]; else pool[m] = v;
      row.querySelectorAll("[data-lvl]").forEach(x => { const on = pool[m] === x.dataset.lvl; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); });
      refresh();
    }));
    btn.onclick = async () => {
      btn.disabled = true; info.textContent = "Enregistrement…";
      try { await rpc("set_map_pool", { p_pool: pool }); unsaved.pool = false; live.editing = null; toast("Map pool enregistré."); viewSettings(app); }
      catch (x) { info.textContent = errMsg(x); btn.disabled = false; }
    };
  }


  // ---------- Staff ----------
  // ================= Panneau admin : tout voir, tout gérer =================
  const AD_ICONS = {
    overview: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
    teams: "M12 3 4 6v6c0 4.5 3.4 8.4 8 9 4.6-.6 8-4.5 8-9V6z",
    players: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8",
    scrims: "M4 5h16v16H4zM4 10h16M9 3v4M15 3v4",
    seasons: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3a3 3 0 0 1-3 4M7 5H4a3 3 0 0 0 3 4",
  };
  const ADMIN_NAV = [["overview", "#/admin", "Vue d'ensemble"], ["teams", "#/admin-equipes", "Équipes"], ["players", "#/admin-joueurs", "Joueurs"], ["scrims", "#/admin-scrims", "Scrims"], ["seasons", "#/saisons", "Saisons"]];
  const ADMIN_ROUTES = ["#/admin", "#/admin-equipes", "#/admin-joueurs", "#/admin-scrims", "#/saisons", "#/staff"];
  const adIcon = k => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${AD_ICONS[k]}"/></svg>`;
  const adminShell = (active, title, inner, lead = "", badges = {}) =>
    `<div class="wrap app-wrap tm ad">
      <aside class="tm-side">
        <div class="tm-id ad-id"><span class="ad-badge">ADMIN</span><span><b>Panneau admin</b><small class="ok">Competitive Network</small></span></div>
        <nav class="tm-nav" aria-label="Administration">${ADMIN_NAV.map(([k, href, label]) =>
          `<a class="tm-link${k === active ? " on" : ""}" href="${href}"${k === active ? ` aria-current="page"` : ""}>${adIcon(k)}<span>${label}</span>${badges[k] ? `<em class="ad-count">${badges[k]}</em>` : ""}</a>`).join("")}</nav>
      </aside>
      <div class="tm-main"><div class="tm-head"><h2 class="tm-title">${title}</h2>${lead ? `<p class="tm-lead">${lead}</p>` : ""}</div>${inner}</div></div>`;
  const adminGate = app => {
    if (!state.session) { needLogin(app, "Espace réservé au staff."); return false; }
    if (!state.isAdmin) { app.innerHTML = panel("Accès refusé", `<p class="lead">Cet espace est réservé aux admins du réseau.</p>`); return false; }
    return true;
  };
  const discordCell = id => id
    ? `<span class="ad-discord"><a class="link-btn" href="https://discord.com/users/${esc(id)}" target="_blank" rel="noopener">Profil Discord</a><button class="ad-copy" type="button" data-copy="${esc(id)}" title="Copier l'identifiant Discord">${esc(id)}</button></span>`
    : `<span class="mute">—</span>`;
  const bindCopy = root => root.querySelectorAll("[data-copy]").forEach(b => b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast("Identifiant Discord copié."); } catch (e) { toast("Copie impossible.", "err"); }
  });
  const fullDate = iso => new Date(iso).toLocaleDateString(LOC(), { day: "numeric", month: "short", year: "numeric" });
  const norm = v => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const adFilter = { teams: { q: "", st: "all" }, players: { q: "", f: "all", sort: "new" }, scrims: { f: "todo" } };
  const STAFF_LABEL = { admin: "Admin", arbitre: "Modérateur" };

  // ---------- Vue d'ensemble ----------
  async function viewAdmin(app) {
    if (!adminGate(app)) return;
    const o = await rpc("admin_overview");
    const tm = o.teams || {}, pend = o.pending_teams || [], stuck = o.stuck_scrims || [];
    const tile = (n, label, sub, href, tone = "") => `<a class="ad-tile ${tone}" href="${href}"><b>${n}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ""}</a>`;
    app.innerHTML = adminShell("overview", "Vue d'ensemble", `
      <div class="ad-tiles">
        ${tile(o.players, "joueurs inscrits", o.players_week ? `+${o.players_week} cette semaine` : "", "#/admin-joueurs")}
        ${tile(tm.validee || 0, "équipes validées", "", "#/admin-equipes")}
        ${tile(tm.en_attente || 0, "équipes en attente", tm.en_attente ? "à valider" : "", "#/admin-equipes", tm.en_attente ? "warn" : "")}
        ${tile(o.players_free, "joueurs sans équipe", "", "#/admin-joueurs")}
        ${tile(o.scrims_week, "scrims cette semaine", "7 jours avant et après", "#/admin-scrims")}
        ${tile(o.scrims_open, "propositions ouvertes", "", "#/admin-scrims")}
      </div>
      <div class="db-grid">
        <section class="db-card">
          <div class="db-head"><h3>À traiter</h3><span class="small-note">${pend.length + stuck.length || "Rien"} ${pend.length + stuck.length ? "point" + (pend.length + stuck.length > 1 ? "s" : "") : "à faire"}</span></div>
          ${pend.length ? `<p class="eyebrow">Équipes à valider</p><div class="t-lines">${pend.map(t => `<a class="t-line ad-line" href="#/admin-equipes" data-goteam="${esc(t.id)}">${teamLogo(t, 28)}<span class="t-opp"><b>${esc(t.name)}</b><small class="mute"> ${esc(t.tag)}</small></span>
              <span class="small-note">${t.titulaires}/5 titulaires · estimée ${t.suggested ? "D" + t.suggested : "—"}</span><span class="small-note">${ago(t.created_at)}</span></a>`).join("")}</div>` : ""}
          ${stuck.length ? `<p class="eyebrow">Scrims bloqués</p><div class="t-lines">${stuck.map(s => `<a class="t-line ad-line" href="#/admin-scrims"><span class="t-res ${s.status === "cale" ? "ff" : "d"}">${s.status === "cale" ? "SANS SCORE" : "48 H"}</span><span class="t-opp"><b>${esc(s.host)} vs ${esc(s.guest || "?")}</b></span>
              <span class="small-note">${shortDate(s.starts_at)}</span><span class="small-note">${s.status === "cale" ? "aucun résultat envoyé" : "validation auto bientôt"}</span></a>`).join("")}</div>` : ""}
          ${!pend.length && !stuck.length ? `<p class="db-empty">Tout est à jour ✓</p>` : ""}
        </section>
        <section class="db-card">
          <div class="db-head"><h3>Derniers inscrits</h3><a class="link-btn" href="#/admin-joueurs">Tous les joueurs</a></div>
          <div class="t-lines">${(o.recent_players || []).map(p => `<a class="t-line ad-line" href="${playerHref(p.id)}">${avatar(p.avatar_url, p.username, 28)}<span class="t-opp"><b>${esc(p.username)}</b></span>
            <span class="small-note">${p.team_tag ? esc(p.team_tag) : "sans équipe"}</span><span class="small-note">${ago(p.created_at)}</span></a>`).join("") || `<p class="db-empty">Personne pour l'instant.</p>`}</div>
        </section>
      </div>`, "Ce qui se passe sur le réseau, et ce qui attend une action du staff.", { teams: tm.en_attente || 0 });
    app.querySelectorAll("[data-goteam]").forEach(a => a.addEventListener("click", () => { adFilter.teams.st = "en_attente"; }));
    setLive("/admin", ["teams", "scrims"], () => viewAdmin(app));
  }

  // ---------- Équipes ----------
  async function viewAdminTeams(app) {
    if (!adminGate(app)) return;
    const teams = await rpc("admin_teams");
    const counts = { all: teams.filter(t => !t.is_test).length, en_attente: 0, validee: 0, refusee: 0, test: teams.filter(t => t.is_test).length };
    teams.forEach(t => { if (!t.is_test) counts[t.status] = (counts[t.status] || 0) + 1; });
    const F = adFilter.teams;
    const render = () => {
      const q = norm(F.q);
      const list = teams.filter(t => (F.st === "all" ? !t.is_test : F.st === "test" ? t.is_test : t.status === F.st && !t.is_test)
        && (!q || norm(`${t.name} ${t.tag} ${t.captain} ${t.captain_discord}`).includes(q)));
      const chips = [["all", "Toutes"], ["en_attente", "En attente"], ["validee", "Validées"], ["refusee", "Refusées"], ["test", "Test"]]
        .map(([v, l]) => `<button type="button" class="scx-fbtn${F.st === v ? " on" : ""}" data-st="${v}">${l}<i>${counts[v] || 0}</i></button>`).join("");
      $("#ad-body", app).innerHTML = `
        <div class="ad-bar"><input class="ad-search" id="ad-q" type="search" placeholder="Chercher une équipe, un tag, un capitaine…" value="${esc(F.q)}" aria-label="Chercher une équipe"><div class="scx-filter">${chips}</div></div>
        <p class="small-note">${list.length} équipe${list.length > 1 ? "s" : ""}</p>
        <div class="table-scroll"><table class="ad-table">
          <thead><tr><th>Équipe</th><th>Statut</th><th>Division</th><th>Joueurs</th><th>Capitaine</th><th>Scrims</th><th>Créée</th><th></th></tr></thead>
          <tbody>${list.map(t => `<tr data-id="${t.id}">
            <td><a class="ad-team pl-link" href="${teamHref(t.tag)}">${teamLogo(t, 32)}<span><b>${esc(t.name)}</b><small>${esc(t.tag)}</small></span></a></td>
            <td>${statusPill(t)}</td>
            <td>${t.division ? `<b>D${t.division}</b>` : "—"}<small class="mute">estimée ${t.suggested ? "D" + t.suggested : "—"}</small></td>
            <td><b>${t.titulaires}</b>/5<small class="mute">${t.members} au total</small></td>
            <td><span class="ad-cap"><b>${esc(t.captain || "—")}</b>${t.captain_discord ? `<a class="link-btn" href="https://discord.com/users/${esc(t.captain_discord)}" target="_blank" rel="noopener">Discord</a>` : ""}</span></td>
            <td>${t.scrims}${t.last_scrim ? `<small class="mute">dernier le ${shortDate(t.last_scrim)}</small>` : ""}</td>
            <td><small class="mute">${fullDate(t.created_at)}</small></td>
            <td><button class="btn sm" type="button" data-manage="${t.id}" aria-expanded="false">Gérer</button></td></tr>
            <tr class="ad-detail" data-detail="${t.id}" hidden><td colspan="8"><div class="ad-manage">
              <div class="ad-actions">
                <label class="sr" for="div-${t.id}">Division</label>
                <select id="div-${t.id}">${[1, 2, 3, 4].map(d => `<option value="${d}" ${(t.division || t.suggested) === d ? "selected" : ""}>D${d} · ${esc(DIV_NAMES[d].split(" · ")[1] || "")}</option>`).join("")}</select>
                <button class="btn sm solid" data-review="validee" type="button">${t.status === "validee" ? "Changer la division" : "Valider l'équipe"}</button>
                ${t.status !== "refusee" ? `<button class="btn sm" data-review="refusee" type="button">Refuser</button>` : ""}
                <button class="link-btn" data-sync type="button">Synchro des rôles Discord</button>
                <button class="link-btn" data-ranks type="button">Actualiser les rangs</button>
                <button class="link-btn danger-t" data-del type="button">Supprimer l'équipe</button>
              </div>
              <details class="team-row" data-id="${t.id}" data-tag="${esc(t.tag)}" open><summary>Roster</summary><div class="roster-slot"><p class="small-note">Chargement…</p></div></details>
            </div></td></tr>`).join("") || `<tr><td colspan="8"><p class="db-empty">Aucune équipe ici.</p></td></tr>`}</tbody>
        </table></div>`;
      const qi = $("#ad-q", app); qi.oninput = () => { F.q = qi.value; const pos = qi.selectionStart; render(); const n = $("#ad-q", app); n.focus(); n.setSelectionRange(pos, pos); };
      app.querySelectorAll("[data-st]").forEach(b => b.onclick = () => { F.st = b.dataset.st; render(); });
      app.querySelectorAll("[data-manage]").forEach(b => b.onclick = () => {
        const d = $(`[data-detail="${b.dataset.manage}"]`, app), open = d.hidden;
        d.hidden = !open; b.setAttribute("aria-expanded", String(open)); b.textContent = open ? "Fermer" : "Gérer";
        if (open && !d.dataset.bound) { d.dataset.bound = "1"; bindTeamRows(d, true); const det = $("details.team-row", d); det.open = false; det.open = true; }
      });
      app.querySelectorAll("[data-review]").forEach(b => b.onclick = async () => {
        const id = b.closest(".ad-detail").dataset.detail;
        try { await rpc("admin_review_team", { p_team: id, p_status: b.dataset.review, p_division: +$(`#div-${id}`, app).value });
          toast(b.dataset.review === "validee" ? "Équipe validée." : "Équipe refusée."); await discordSync({ team_id: id }, true); viewAdminTeams(app); }
        catch (x) { toast(errMsg(x), "err"); }
      });
      app.querySelectorAll("[data-sync]").forEach(b => b.onclick = async () => { b.disabled = true; await discordSync({ team_id: b.closest(".ad-detail").dataset.detail }, true); b.disabled = false; });
      app.querySelectorAll("[data-ranks]").forEach(b => b.onclick = async () => {
        b.disabled = true; b.textContent = "Actualisation…";
        const r = await rankSync({ team_id: b.closest(".ad-detail").dataset.detail });
        if (r.error) toast(r.error, "err");
        else toast(Object.values(r.results).map(x => (x.username || "?") + " : " + (x.ok ? (x.label || "Non classé") : x.message)).join(" · "));
        viewAdminTeams(app);
      });
      app.querySelectorAll("[data-del]").forEach(b => confirmable(b, "Sûr ? Tout est supprimé (roster, compos, strats, scrims proposés). Clique encore", async () => {
        const id = b.closest(".ad-detail").dataset.detail;
        try { await rpc("admin_delete_team", { p_team: id }); await cleanLogos(id, null).catch(() => {}); toast("Équipe supprimée."); viewAdminTeams(app); }
        catch (x) { toast(errMsg(x), "err"); }
      }));
    };
    app.innerHTML = adminShell("teams", "Équipes", `<div id="ad-body"></div>`, "Toutes les équipes inscrites. « Gérer » ouvre la validation, la division, les rôles Discord et le roster.", { teams: counts.en_attente });
    render();
    setLive("/admin-equipes", ["teams"], () => viewAdminTeams(app));
  }

  // ---------- Joueurs ----------
  async function viewAdminPlayers(app) {
    if (!adminGate(app)) return;
    const players = await rpc("admin_players");
    const F = adFilter.players;
    const tests = {
      all: () => true,
      free: p => !p.team_id,
      cap: p => p.is_captain,
      staff: p => !!p.staff_role,
      unv: p => p.rank == null || !["auto", "staff"].includes(p.rank_source),
      noriot: p => !p.riot_id,
    };
    const counts = Object.fromEntries(Object.keys(tests).map(k => [k, players.filter(tests[k]).length]));
    const render = () => {
      const q = norm(F.q);
      let list = players.filter(tests[F.f] || tests.all).filter(p => !q || norm(`${p.username} ${p.riot_id} ${p.discord_id} ${p.team_name} ${p.team_tag}`).includes(q));
      if (F.sort === "name") list = [...list].sort((a, b) => norm(a.username).localeCompare(norm(b.username)));
      if (F.sort === "rank") list = [...list].sort((a, b) => (b.rank ?? -1) - (a.rank ?? -1));
      const chips = [["all", "Tous"], ["free", "Sans équipe"], ["cap", "Capitaines"], ["staff", "Staff"], ["unv", "Rang non vérifié"], ["noriot", "Sans Riot ID"]]
        .map(([v, l]) => `<button type="button" class="scx-fbtn${F.f === v ? " on" : ""}" data-pf="${v}">${l}<i>${counts[v]}</i></button>`).join("");
      $("#ad-body", app).innerHTML = `
        <div class="ad-bar"><input class="ad-search" id="ad-q" type="search" placeholder="Pseudo, Riot ID, identifiant Discord, équipe…" value="${esc(F.q)}" aria-label="Chercher un joueur">
          <label class="ad-sort">Trier <select id="ad-sort"><option value="new"${F.sort === "new" ? " selected" : ""}>Inscription récente</option><option value="name"${F.sort === "name" ? " selected" : ""}>Pseudo (A→Z)</option><option value="rank"${F.sort === "rank" ? " selected" : ""}>Rang</option></select></label>
          <div class="scx-filter">${chips}</div></div>
        <p class="small-note">${list.length} joueur${list.length > 1 ? "s" : ""}</p>
        <div class="table-scroll"><table class="ad-table">
          <thead><tr><th>Joueur</th><th>Discord</th><th>Riot ID</th><th>Rang</th><th>Équipe</th><th>Inscrit</th><th></th></tr></thead>
          <tbody>${list.map(p => `<tr data-u="${p.id}">
            <td><a class="ad-player pl-link" href="${playerHref(p.id)}">${avatar(p.avatar_url, p.username, 32)}<span><b>${esc(p.username || "?")}</b>${p.staff_role ? `<small class="ad-staff ${p.staff_role}">${STAFF_LABEL[p.staff_role] || p.staff_role}</small>` : ""}</span></a></td>
            <td>${discordCell(p.discord_id)}</td>
            <td>${p.riot_id ? `<span class="mono">${esc(p.riot_id)}</span>` : `<span class="mute">—</span>`}</td>
            <td>${p.rank != null ? rankLabel(p.rank, 18) + rankMark(p) : `<span class="mute">Non classé</span>`}</td>
            <td>${p.team_id ? `<a class="pl-link" href="${teamHref(p.team_tag)}"><b>${esc(p.team_tag)}</b></a><small class="mute"> ${p.is_captain ? "capitaine" : p.team_role === "remplacant" ? "remplaçant" : "titulaire"}</small>` : `<span class="mute">Sans équipe</span>`}</td>
            <td><small class="mute">${fullDate(p.created_at)}</small></td>
            <td><button class="btn sm" type="button" data-pmanage="${p.id}" aria-expanded="false">Gérer</button></td></tr>
            <tr class="ad-detail" data-pdetail="${p.id}" hidden><td colspan="7"><div class="ad-actions">
              <label>Rang fixé par le staff <select data-rank-for="${p.id}"><option value="">Automatique / non classé</option>${RANKS.map((r, i) => `<option value="${i}"${p.rank === i ? " selected" : ""}>${r}</option>`).join("")}</select></label>
              <button class="btn sm" type="button" data-prank="${p.id}">Enregistrer le rang</button>
              <label>Rôle <select data-role-for="${p.id}">${["joueur", "arbitre", "admin"].map(r => `<option value="${r}"${(p.staff_role || "joueur") === r ? " selected" : ""}>${r === "joueur" ? "Joueur" : STAFF_LABEL[r]}</option>`).join("")}</select></label>
              <button class="btn sm" type="button" data-prole="${p.id}">Enregistrer le rôle</button>
              <button class="link-btn" type="button" data-psync="${p.id}">Synchro Discord</button>
            </div><p class="small-note">Modérateur : gère les scrims et la recherche d'équipe. Admin : tout, y compris la validation des équipes et ce panneau.</p></td></tr>`).join("") || `<tr><td colspan="7"><p class="db-empty">Aucun joueur ici.</p></td></tr>`}</tbody>
        </table></div>`;
      bindCopy(app);
      const qi = $("#ad-q", app); qi.oninput = () => { F.q = qi.value; const pos = qi.selectionStart; render(); const n = $("#ad-q", app); n.focus(); n.setSelectionRange(pos, pos); };
      $("#ad-sort", app).onchange = e => { F.sort = e.target.value; render(); };
      app.querySelectorAll("[data-pf]").forEach(b => b.onclick = () => { F.f = b.dataset.pf; render(); });
      app.querySelectorAll("[data-pmanage]").forEach(b => b.onclick = () => {
        const d = $(`[data-pdetail="${b.dataset.pmanage}"]`, app), open = d.hidden;
        d.hidden = !open; b.setAttribute("aria-expanded", String(open)); b.textContent = open ? "Fermer" : "Gérer";
      });
      app.querySelectorAll("[data-prank]").forEach(b => b.onclick = async () => {
        const u = b.dataset.prank, v = $(`[data-rank-for="${u}"]`, app).value;
        try { await rpc("admin_set_rank", { p_user: u, p_rank: v === "" ? null : +v }); toast("Rang enregistré."); viewAdminPlayers(app); } catch (x) { toast(errMsg(x), "err"); }
      });
      app.querySelectorAll("[data-prole]").forEach(b => b.onclick = async () => {
        const u = b.dataset.prole;
        try { await rpc("admin_set_staff", { p_user: u, p_role: $(`[data-role-for="${u}"]`, app).value }); toast("Rôle enregistré."); if (u === state.session.user.id) { await loadMe(); renderAuth(); } viewAdminPlayers(app); }
        catch (x) { toast(errMsg(x), "err"); }
      });
      app.querySelectorAll("[data-psync]").forEach(b => b.onclick = async () => { b.disabled = true; await discordSync({ user_ids: [b.dataset.psync] }, true); b.disabled = false; });
    };
    app.innerHTML = adminShell("players", "Joueurs", `<div id="ad-body"></div>`, "Tous les comptes inscrits, avec leur Discord, leur Riot ID, leur rang et leur équipe. « Gérer » pour fixer un rang ou nommer quelqu'un au staff.");
    render();
    setLive("/admin-joueurs", ["teams"], () => viewAdminPlayers(app));
  }

  // ---------- Scrims ----------
  async function viewAdminScrims(app) {
    if (!adminGate(app)) return;
    const scrims = await rpc("admin_scrims");
    const now = Date.now(), F = adFilter.scrims;
    const kind = s => s.status === "ouvert" ? "open" : s.status === "annule" ? "cancel" : s.status === "cale" ? (new Date(s.starts_at) < now ? "todo" : "next")
      : s.status === "termine" && !s.confirmed && !s.no_show ? "todo" : "done";
    const counts = { all: scrims.length }; scrims.forEach(s => { const k = kind(s); counts[k] = (counts[k] || 0) + 1; });
    const LBL = { open: ["Ouvert", "next"], next: ["Calé", "next"], todo: ["À régler", "ff"], done: ["Terminé", "w"], cancel: ["Annulé", "d"] };
    const render = () => {
      const list = scrims.filter(s => F.f === "all" || kind(s) === F.f);
      const chips = [["todo", "À régler"], ["next", "À venir"], ["open", "Propositions"], ["done", "Terminés"], ["cancel", "Annulés"], ["all", "Tous"]]
        .map(([v, l]) => `<button type="button" class="scx-fbtn${F.f === v ? " on" : ""}" data-sf="${v}">${l}<i>${counts[v] || 0}</i></button>`).join("");
      $("#ad-body", app).innerHTML = `<div class="ad-bar"><div class="scx-filter">${chips}</div></div>
        <div class="table-scroll"><table class="ad-table">
          <thead><tr><th>Date</th><th>Équipes</th><th>Format</th><th>Statut</th><th>Score</th><th></th></tr></thead>
          <tbody>${list.map(s => { const k = kind(s), l = LBL[k]; return `<tr data-s="${s.id}">
            <td><b>${shortDate(s.starts_at)}</b><small class="mute"> ${hourLabel(s.starts_at)}</small></td>
            <td><b>${esc(s.host_tag)}</b> <span class="mute">vs</span> <b>${esc(s.guest_tag || "?")}</b><small class="mute"> · D${s.division}</small></td>
            <td>${esc(s.format)}${s.maps ? `<small class="mute"> · ${esc(s.maps)}</small>` : ""}</td>
            <td><span class="t-res ${l[1]}">${l[0]}</span>${s.cancel_late ? `<small class="mute"> tardif</small>` : ""}${s.no_show ? `<small class="mute"> absence ${esc(s.no_show === s.host_id ? s.host_tag : s.guest_tag)}</small>` : ""}</td>
            <td>${s.host_score != null ? `<b class="mono">${s.host_score} – ${s.guest_score}</b>${s.map_scores ? `<small class="mute"> ${esc(s.map_scores.map(m => `${m.map} ${m.h}-${m.g}`).join(" · "))}</small>` : ""}${s.status === "termine" && !s.confirmed ? `<small class="mute"> non confirmé</small>` : ""}` : `<span class="mute">—</span>`}</td>
            <td class="ad-row-act">${s.status === "cale" || s.status === "termine" ? `<button class="link-btn" data-sreset="${s.id}" type="button">Remettre à zéro</button>` : ""}<button class="link-btn danger-t" data-sdel="${s.id}" type="button">Supprimer</button></td></tr>`; }).join("")
            || `<tr><td colspan="6"><p class="db-empty">Aucun scrim ici.</p></td></tr>`}</tbody>
        </table></div>`;
      app.querySelectorAll("[data-sf]").forEach(b => b.onclick = () => { F.f = b.dataset.sf; render(); });
      app.querySelectorAll("[data-sreset]").forEach(b => confirmable(b, "Confirmer ?", async () => {
        try { await rpc("admin_reset_scrim", { p_id: b.dataset.sreset }); toast("Scrim remis à zéro."); viewAdminScrims(app); } catch (x) { toast(errMsg(x), "err"); } }));
      app.querySelectorAll("[data-sdel]").forEach(b => confirmable(b, "Supprimer ?", async () => {
        try { await rpc("admin_delete_scrim", { p_id: b.dataset.sdel }); toast("Scrim supprimé."); viewAdminScrims(app); } catch (x) { toast(errMsg(x), "err"); } }));
    };
    app.innerHTML = adminShell("scrims", "Scrims", `<div id="ad-body"></div>`, "Les 500 derniers scrims. « À régler » : scrims passés sans score, ou score pas encore confirmé.");
    render();
    setLive("/admin-scrims", ["scrims"], () => viewAdminScrims(app));
  }
  // L'ancienne page Staff est maintenant dans Joueurs (filtre Staff)
  async function viewStaff() { adFilter.players.f = "staff"; location.hash = "#/admin-joueurs"; }

  // ---------- Vue : saisons (admin) ----------
  async function viewSeasons(app) {
    if (!adminGate(app)) return;
    const seasons = await loadSeasons(true), cur = currentSeason(seasons);
    const n = seasons.length;
    app.innerHTML = adminShell("seasons", "Saisons", `
      <div class="two">
        <form class="card form" id="season-rename" novalidate>
          <h3>Saison en cours</h3>
          <p class="small-note">${cur ? `Depuis le ${new Date(cur.starts_at).toLocaleDateString(LOC(), { day: "numeric", month: "long", year: "numeric" })}.` : "Aucune saison en cours."}</p>
          <label for="season-name">Nom</label><input id="season-name" maxlength="40" value="${esc(cur ? cur.name : "")}">
          <div class="ctas"><button class="btn sm" type="submit">Renommer</button></div>
          <p class="form-err" id="season-rename-err" role="alert"></p>
        </form>
        <form class="card form" id="season-end" novalidate>
          <h3>Terminer la saison</h3>
          <p class="small-note">Le classement actuel devient le classement final de « ${esc(cur ? cur.name : "")} ». Les résultats repartent de zéro. On ne peut pas revenir en arrière.</p>
          <label for="season-next">Nom de la nouvelle saison</label><input id="season-next" maxlength="40" value="Saison ${n}">
          <div class="ctas"><button class="btn danger sm" id="season-end-btn" type="submit">Terminer et commencer la nouvelle saison</button></div>
          <p class="form-err" id="season-end-err" role="alert"></p>
        </form>
      </div>
      <h3 class="t-h">Historique</h3>
      <div class="t-lines">${seasons.map(x => `<div class="t-line"><span class="t-res ${x.ends_at ? "d" : "w"}">${x.ends_at ? "FIN" : "EN COURS"}</span><span class="t-opp"><b>${esc(x.name)}</b></span>
        <span class="small-note">${new Date(x.starts_at).toLocaleDateString(LOC())} → ${x.ends_at ? new Date(x.ends_at).toLocaleDateString(LOC()) : "aujourd'hui"}</span><span></span></div>`).join("")}</div>`,
      "Le classement ne compte que les scrims de la saison en cours. Terminer la saison fige son classement (il reste consultable sur la page Classement) et repart de zéro pour toutes les équipes.");
    $("#season-rename").onsubmit = async e => {
      e.preventDefault();
      try { await rpc("admin_rename_season", { p_name: $("#season-name").value }); toast("Saison renommée."); seasonsCache = null; paintSeason(); viewSeasons(app); }
      catch (x) { $("#season-rename-err").textContent = errMsg(x); }
    };
    const endForm = $("#season-end");
    endForm.onsubmit = e => e.preventDefault();
    confirmable($("#season-end-btn"), "Sûr ? Clique encore pour terminer la saison", async () => {
      try { await rpc("admin_end_season", { p_new_name: $("#season-next").value }); toast("Nouvelle saison lancée."); seasonsCache = null; paintSeason(); viewSeasons(app); }
      catch (x) { $("#season-end-err").textContent = errMsg(x); }
    });
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
    paintSeason();
    const { data } = await sb.auth.getSession();
    state.session = data.session; await loadMe(); renderAuth();
    let after = null; try { after = sessionStorage.getItem("prizm_after_login"); sessionStorage.removeItem("prizm_after_login"); } catch (e) {}
    if (after && state.session && location.hash !== after) { location.hash = after; } else route();
    homeScrims(); teamHome(); startLive();
    // Sur téléphone, les tableaux deviennent des cartes : chaque case porte le nom de sa colonne
    const labelTables = () => document.querySelectorAll("#view-app table").forEach(tb => {
      const heads = [...tb.querySelectorAll("thead th")].map(th => { const x = th.textContent.trim(); return (x.length <= 3 && th.title ? th.title : x).trim(); });
      tb.querySelectorAll("tbody tr").forEach(tr => {
        let i = 0;
        [...tr.children].forEach(td => {
          const l = heads[i] || "";
          if (td.getAttribute("data-label") !== l && !td.hasAttribute("data-tr-data-label")) td.setAttribute("data-label", l);
          i += +(td.getAttribute("colspan") || 1);
        });
      });
    });
    let lt = 0;
    new MutationObserver(() => { cancelAnimationFrame(lt); lt = requestAnimationFrame(labelTables); }).observe($("#view-app"), { childList: true, subtree: true });
    sb.auth.onAuthStateChange(async (ev, session) => {
      if (ev === "SIGNED_IN" && (!state.session || state.session.user.id !== session.user.id)) {
        state.session = session; await loadMe(); renderAuth(); route();
      } else if (ev === "SIGNED_OUT") { if (state.session) { state.session = null; clearMe(); renderAuth(); route(); } }
      else state.session = session;
    });
  }
  start();
})();
