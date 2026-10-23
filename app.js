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
    const { data, error } = await sb.from("profiles").select("id,username,avatar_url,riot_id,rank,is_admin").eq("id", state.session.user.id).maybeSingle();
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
  const views = { "/profil": viewProfile, "/mon-equipe": viewMyTeam, "/equipes": viewTeams, "/admin": viewAdmin };
  function route() {
    const h = location.hash || "";
    const path = h.startsWith("#/") ? h.slice(1).split("?")[0] : null;
    const home = $("#view-home"), app = $("#view-app");
    document.querySelectorAll("nav a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === h));
    if (path && views[path]) {
      home.hidden = true; app.hidden = false; window.scrollTo(0, 0);
      app.innerHTML = `<div class="wrap app-wrap"><p class="eyebrow">Chargement…</p></div>`;
      views[path](app).catch(e => { app.innerHTML = panel("Oups", `<p class="lead">${esc(errMsg(e))}</p>`); });
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

  const rankOptions = sel => `<option value="">Choisis ton rang</option>` +
    ["Fer","Bronze","Argent","Or","Platine","Diamant","Ascendant","Immortel"].map((g, gi) =>
      `<optgroup label="${g}">${[0,1,2].map(k => { const i = gi*3+k; return `<option value="${i}" ${sel === i ? "selected" : ""}>${RANKS[i]}</option>`; }).join("")}</optgroup>`).join("") +
    `<option value="24" ${sel === 24 ? "selected" : ""}>Radiant</option>`;

  // ---------- Vue : profil ----------
  async function viewProfile(app) {
    if (!state.session) return needLogin(app, "Ton profil joueur est lié à ton compte Discord.");
    await loadMe(); const p = state.profile;
    if (!p) { app.innerHTML = panel("Profil introuvable", `<p class="lead">La base de données n'est pas encore prête.</p>`); return; }
    const div = rankDiv(p.rank);
    app.innerHTML = panel("Mon profil", `
      <div class="profile-head">${avatar(p.avatar_url, p.username, 64)}<div><b class="ph-name">${esc(p.username)}</b><span class="small-note">Compte Discord relié</span></div></div>
      <form class="form" id="profile-form" novalidate>
        <label for="riot-id">Riot ID</label>
        <input id="riot-id" name="riot" placeholder="Pseudo#TAG" value="${esc(p.riot_id || "")}" autocomplete="off" required>
        <span class="hint">Exactement comme en jeu, avec le #.</span>
        <label for="rank">Rang actuel</label>
        <select id="rank" name="rank" required>${rankOptions(p.rank)}</select>
        <p class="div-preview" id="div-preview">${div ? `Ce rang correspond à la <b>${DIV_NAMES[div]}</b>.` : "Choisis ton rang pour voir ta division."}</p>
        <div class="ctas"><button class="btn solid" type="submit">Enregistrer</button></div>
        <p class="form-err" id="profile-err" role="alert"></p>
      </form>`, "Compte");
    $("#rank").onchange = e => { const d = rankDiv(e.target.value === "" ? null : +e.target.value);
      $("#div-preview").innerHTML = d ? `Ce rang correspond à la <b>${DIV_NAMES[d]}</b>.` : "Choisis ton rang pour voir ta division."; };
    $("#profile-form").onsubmit = async e => {
      e.preventDefault();
      const riot = $("#riot-id").value.trim(), rank = $("#rank").value;
      const err = $("#profile-err"); err.textContent = "";
      if (!/^[^#]{3,16}#[A-Za-z0-9]{3,5}$/.test(riot)) { err.textContent = "Riot ID invalide. Format attendu : Pseudo#TAG (ex : Celyan#EUW)."; return; }
      if (rank === "") { err.textContent = "Choisis ton rang."; return; }
      const { error } = await sb.from("profiles").update({ riot_id: riot, rank: +rank }).eq("id", state.session.user.id);
      if (error) { err.textContent = errMsg(error); return; }
      toast("Profil enregistré."); await loadMe(); renderAuth();
    };
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

    app.innerHTML = panel(`${esc(t.name)} <span class="tag-chip">${esc(t.tag)}</span>`, `
      <div class="team-status">
        ${statusPill(t)}
        <span class="small-note">${t.status === "validee" ? "Ton équipe peut scrimer et s'inscrire aux tournois de sa division." :
          t.status === "refusee" ? "Contacte le staff dans #support sur le Discord." :
          `Division estimée : <b>${t.suggested ? DIV_NAMES[t.suggested] : "à calculer"}</b>. Le staff valide la division finale.`}</span>
      </div>
      ${t.status === "validee" ? `<div class="callout info">Ton rôle <b>D${t.division}</b> est donné automatiquement sur le Discord PRIZM. Tu dois être sur le serveur pour le recevoir${(CFG.links || {}).discord ? ` : <a href="${esc(CFG.links.discord)}" target="_blank" rel="noopener">rejoindre le Discord</a>` : ""}. Arrivé après la validation ? <button class="link-btn" id="sync-me" type="button">Recevoir mon rôle</button></div>` : ""}
      ${tit < 5 && t.status !== "validee" ? `<div class="callout">Il te faut 5 titulaires pour être validé. Pour l'instant : ${tit}/5.</div>` : ""}
      ${rosterTable(roster, isCap, me)}
      <div class="two" style="margin-top:32px">
        <div class="card">
          <h3>Inviter des joueurs</h3>
          <p class="small-note">7 joueurs max (5 titulaires + 2 remplaçants). Envoie le lien ou le code.</p>
          <div class="code-big" id="inv-code">${esc(code)}</div>
          <div class="copy-row"><input id="inv-link" readonly value="${esc(inviteLink)}" aria-label="Lien d'invitation"><button class="btn sm" id="copy-inv" type="button">Copier le lien</button></div>
          <p class="copied" id="inv-copied" aria-live="polite"></p>
          ${isCap ? `<button class="link-btn" id="regen" type="button">Générer un nouveau code</button>` : ""}
        </div>
        <div class="card">
          <h3>Quitter l'équipe</h3>
          <p class="small-note">${isCap ? (roster.length > 1 ? "Tu es capitaine : nomme un autre capitaine avant de partir." : "Tu es seul : quitter supprime l'équipe.") : "Tu pourras rejoindre une autre équipe ensuite."}</p>
          <button class="btn danger" id="leave" type="button" ${isCap && roster.length > 1 ? "disabled" : ""}>${isCap && roster.length === 1 ? "Supprimer l'équipe" : "Quitter l'équipe"}</button>
        </div>
      </div>`, "Mon équipe");

    if ($("#sync-me")) $("#sync-me").onclick = () => discordSync({ user_ids: [me] }, true);
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

  function rosterTable(roster, isCap, me) {
    return `<div class="table-scroll"><table class="roster">
      <thead><tr><th>Joueur</th><th>Riot ID</th><th>Rang</th><th>Rôle</th>${isCap ? "<th><span class='sr'>Actions</span></th>" : ""}</tr></thead>
      <tbody>${roster.map(r => `<tr>
        <td><span class="pl">${avatar(r.avatar_url, r.username, 28)}<b>${esc(r.username)}</b>${r.is_captain ? '<span class="cap">Capitaine</span>' : ""}</span></td>
        <td class="mono">${esc(r.riot_id || "—")}</td>
        <td>${r.rank != null ? esc(RANKS[r.rank]) : "—"}</td>
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
  const teamRow = t => `<details class="team-row" data-id="${t.id}"><summary><span class="tag-chip">${esc(t.tag)}</span><b>${esc(t.name)}</b><span class="small-note">${t.members} joueur${t.members > 1 ? "s" : ""}</span></summary><div class="roster-slot"><p class="small-note">Chargement…</p></div></details>`;
  function bindTeamRows(root, admin = false) {
    root.querySelectorAll("details.team-row").forEach(d => d.addEventListener("toggle", async () => {
      if (!d.open || d.dataset.loaded) return; d.dataset.loaded = "1";
      try { const r = await rpc("team_roster", { p_team: d.dataset.id }); $(".roster-slot", d).innerHTML = rosterTable(r, false, null); }
      catch (x) { $(".roster-slot", d).innerHTML = `<p class="form-err">${esc(errMsg(x))}</p>`; }
    }));
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
          <div class="ar-main"><span class="tag-chip">${esc(t.tag)}</span><b>${esc(t.name)}</b>${statusPill(t)}
            <span class="small-note">Capitaine : ${esc(t.captain)} · ${t.members} joueur(s) · estimée : ${t.suggested ? "D" + t.suggested : "—"}</span></div>
          <div class="ar-actions">
            <label class="sr" for="div-${t.id}">Division</label>
            <select id="div-${t.id}">${[1,2,3,4].map(d => `<option value="${d}" ${(t.division || t.suggested) === d ? "selected" : ""}>D${d}</option>`).join("")}</select>
            <button class="btn sm solid" data-review="validee" type="button">Valider</button>
            <button class="btn sm" data-review="refusee" type="button">Refuser</button>
            <button class="link-btn" data-sync type="button" title="Remet les rôles Discord de cette équipe à jour">Synchro Discord</button>
          </div>
          <details class="team-row" data-id="${t.id}"><summary>Voir le roster</summary><div class="roster-slot"></div></details>
        </div>`).join("") || `<p class="small-note">Aucune équipe inscrite pour l'instant.</p>`}</div>`, "Staff");
    app.querySelectorAll("[data-review]").forEach(b => b.onclick = async () => {
      const row = b.closest(".admin-row"), id = row.dataset.id;
      try { await rpc("admin_review_team", { p_team: id, p_status: b.dataset.review, p_division: +$("select", row).value });
        toast(b.dataset.review === "validee" ? "Équipe validée." : "Équipe refusée."); await discordSync({ team_id: id }, true); viewAdmin(app); }
      catch (x) { toast(errMsg(x), "err"); }
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
