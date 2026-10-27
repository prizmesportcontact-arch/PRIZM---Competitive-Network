/*
 * PRIZM — langues du site (français / anglais).
 * Le site est écrit en français ; en anglais, chaque texte affiché est remplacé à la volée grâce au
 * dictionnaire window.PRIZM_EN (i18n/en.js). « {} » dans une clé = partie variable (nombre, nom…),
 * reprise dans la traduction par {} (dans l'ordre) ou {1}, {2}… Le choix est gardé dans le navigateur.
 * Utilisé par le site et par le Comp Builder (compo/).
 */
(function () {
  var KEY = 'prizm_lang';
  var lang = null;
  try { lang = localStorage.getItem(KEY); } catch (e) {}
  if (lang !== 'fr' && lang !== 'en') lang = /^fr\b/i.test(navigator.language || '') ? 'fr' : 'en';
  window.PRIZM_LANG = lang;
  window.PRIZM_LOCALE = lang === 'en' ? 'en-GB' : 'fr-FR';
  document.documentElement.lang = lang;
  window.prizmSetLang = function (l) {
    try { localStorage.setItem(KEY, l); } catch (e) {}
    location.reload();
  };

  // ---------- Sélecteur FR / EN dans l'en-tête ----------
  function addSwitch() {
    var row = document.querySelector('header.top .wrap') || document.querySelector('.pz-top__row');
    if (!row || row.querySelector('.lang-switch')) return;
    var box = document.createElement('div');
    box.className = 'lang-switch';
    box.setAttribute('data-no-tr', '');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', lang === 'en' ? 'Language' : 'Langue');
    [['fr', 'FR', 'Français'], ['en', 'EN', 'English']].forEach(function (l) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = l[1];
      b.title = l[2];
      b.className = l[0] === lang ? 'on' : '';
      b.setAttribute('aria-pressed', String(l[0] === lang));
      b.onclick = function () { if (l[0] !== lang) window.prizmSetLang(l[0]); };
      box.appendChild(b);
    });
    var anchor = row.querySelector('#auth-slot, .auth-panel');
    while (anchor && anchor.parentNode !== row) anchor = anchor.parentNode;
    if (anchor) row.insertBefore(box, anchor); else row.appendChild(box);
  }
  var styles = '.lang-switch{display:inline-flex;border:1px solid rgba(154,163,175,.35);flex:none}' +
    '.lang-switch button{background:transparent;border:0;color:#9aa3af;font:700 .72rem/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.06em;padding:7px 8px;cursor:pointer}' +
    '.lang-switch button.on{background:#ffa043;color:#1a1006}' +
    '.lang-switch button:not(.on):hover{color:#eef0f3}' +
    'header.top .lang-switch{margin-left:14px}' +
    '@media (max-width:820px){header.top .lang-switch{margin-left:auto}}';
  function boot() {
    var st = document.createElement('style'); st.textContent = styles; document.head.appendChild(st);
    addSwitch();
    // Le Comp Builder dessine son en-tête après coup
    var tries = 0, t = setInterval(function () { addSwitch(); if (document.querySelector('.lang-switch') || ++tries > 40) clearInterval(t); }, 250);
    if (lang === 'en') startTranslate();
  }

  // ---------- Traduction ----------
  var exact = {}, pats = [];
  function norm(s) { return String(s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim(); }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function prepare() {
    var D = window.PRIZM_EN || {};
    Object.keys(D).forEach(function (k) {
      if (k.indexOf('{}') < 0) { exact[k] = D[k]; return; }
      var parts = k.split('{}');
      pats.push({ re: new RegExp('^' + parts.map(esc).join('([\\s\\S]*?)') + '$'), to: D[k], len: k.length, lit: parts.join('').trim().length });
    });
    pats.sort(function (a, b) { return b.len - a.len; });
  }
  function tr(s, depth) {
    var n = norm(s);
    if (!n || !/[A-Za-zÀ-ÿ]/.test(n)) return null;
    if (Object.prototype.hasOwnProperty.call(exact, n)) return exact[n];
    if ((depth || 0) > 3) return null;
    for (var i = 0; i < pats.length; i++) {
      var m = pats[i].re.exec(n);
      if (!m) continue;
      // Une clé courte avec des parties variables ne doit pas « avaler » une longue phrase
      if (pats[i].lit < 25 && m.slice(1).some(function (x) { return x.length > 40; })) continue;
      var g = m.slice(1).map(function (x) {
        var t = x.trim() ? tr(x, (depth || 0) + 1) : null;
        if (t == null) return x;
        return x.match(/^\s*/)[0] + t + x.match(/\s*$/)[0];
      });
      var seq = 0;
      return pats[i].to.replace(/\{(\d*)\}/g, function (_, d) { var v = d ? g[+d - 1] : g[seq++]; return v == null ? '' : v; });
    }
    return null;
  }
  window.prizmT = function (s) { if (lang !== 'en') return s; var t = tr(s); return t == null ? s : t; };

  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, CODE: 1 };
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var done = new WeakMap();
  function skipEl(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP[e.tagName] || e.hasAttribute('data-no-tr') || e.isContentEditable) return true;
    }
    return false;
  }
  function doText(node) {
    var v = node.nodeValue;
    if (!v || done.get(node) === v) return;
    if (node.parentNode && skipEl(node.parentNode)) return;
    var t = tr(v);
    if (t != null) {
      var out = v.match(/^\s*/)[0] + t + v.match(/\s*$/)[0];
      if (out !== v) node.nodeValue = out;
      done.set(node, out);
    } else done.set(node, v);
  }
  function doAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i], v = el.getAttribute(a);
      if (!v) continue;
      var mark = 'data-tr-' + a;
      if (el.getAttribute(mark) === v) continue;
      var t = tr(v);
      if (t != null && t !== v) el.setAttribute(a, t);
      el.setAttribute(mark, t != null ? t : v);
    }
    if (el.tagName === 'INPUT' && /^(button|submit)$/i.test(el.type) && el.value) {
      var t2 = tr(el.value); if (t2 != null) el.value = t2;
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 || skipEl(root)) return;
    doAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { return n.nodeType === 1 && (SKIP[n.tagName] || n.hasAttribute('data-no-tr')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; },
    });
    var n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  var queue = new Set(), scheduled = false;
  function flush() {
    scheduled = false;
    var list = Array.from(queue); queue.clear();
    list.forEach(function (n) { if (n.isConnected) walk(n); });
    var tt = tr(document.title); if (tt != null && tt !== document.title) document.title = tt;
  }
  function push(n) { queue.add(n); }
  function startTranslate() {
    prepare();
    walk(document.body);
    var tt = tr(document.title); if (tt != null) document.title = tt;
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === 'characterData') push(m.target);
        else if (m.type === 'attributes') push(m.target);
        else m.addedNodes.forEach(push);
      });
      flush(); // tout de suite (avant l'affichage) : pas de clignotement en français
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
