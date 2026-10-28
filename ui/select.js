/* Menus déroulants maison, pour le site et le Comp Builder.
 * Chaque <select> reste dans la page (formulaires, React, valeur), mais il est caché et remplacé
 * par un bouton + une liste au style du site. Choisir une option change le <select> et envoie
 * l'événement « change », donc tout le code existant continue de marcher sans modification.
 * Clavier : flèches, Entrée, Échap, Début/Fin, et taper les premières lettres.
 * Un <select data-native> garde le menu du navigateur. */
(function () {
  if (window.__prizmSelect) return;
  window.__prizmSelect = true;
  var setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  var open = null; // { sel, btn, pop, items, idx }
  var CHEV = '<svg class="csel__chev" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var css =
    '.csel-native{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}' +
    '.csel{display:inline-flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;max-width:100%;box-sizing:border-box;cursor:pointer;text-align:left;' +
      'font-family:inherit;line-height:1.2;color:var(--ink,var(--text-primary,#eef0f3));background:var(--paper,var(--bg-base,#0d1117));' +
      'border:1px solid var(--line,var(--border-subtle,#29303b));border-radius:12px;padding:10px 12px 10px 14px;transition:border-color .15s,background-color .15s}' +
    '.csel{background-image:none!important;padding-right:12px!important;appearance:none}' +
    '.player-select .csel{background:transparent!important;border:0!important;box-shadow:none!important;padding:2px 0!important;min-height:0!important;gap:4px;font-size:.68rem!important;font-weight:600!important;color:var(--text-on-image,#fff);max-width:110px;border-radius:6px}' +
    '.player-select .csel__chev{width:12px;height:12px;color:inherit;opacity:.7}' +
    '.csel:hover{border-color:color-mix(in srgb,var(--ink,var(--text-primary,#eef0f3)) 40%,transparent)}' +
    '.csel[aria-expanded="true"],.csel:focus-visible{border-color:var(--accent,var(--brand-red,#ffa043));outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--accent,var(--brand-red,#ffa043)) 22%,transparent)}' +
    '.csel:disabled{opacity:.5;cursor:not-allowed}' +
    '.csel__label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.csel__chev{flex:none;color:var(--mute,var(--text-secondary,#9aa3af));transition:transform .2s}' +
    '.csel[aria-expanded="true"] .csel__chev{transform:rotate(180deg)}' +
    '.csel-pop{position:fixed;z-index:3000;box-sizing:border-box;padding:6px;margin:0;list-style:none;overflow-y:auto;overscroll-behavior:contain;' +
      'background:var(--panel,var(--bg-panel,#161b23));border:1px solid var(--line,var(--border-subtle,#29303b));border-radius:16px;' +
      'box-shadow:0 22px 48px rgba(0,0,0,.55);font:500 .92rem/1.3 var(--body,var(--font-body,system-ui,sans-serif));color:var(--ink,var(--text-primary,#eef0f3));' +
      'animation:csel-in .14s ease-out}' +
    '@keyframes csel-in{from{opacity:0;transform:translateY(-4px)}}' +
    '@media (prefers-reduced-motion:reduce){.csel-pop{animation:none}.csel__chev{transition:none}}' +
    '.csel-opt{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.csel-opt.is-act{background:color-mix(in srgb,var(--ink,var(--text-primary,#eef0f3)) 8%,transparent)}' +
    '.csel-opt[aria-selected="true"]{color:var(--accent,var(--brand-red,#ffa043));font-weight:700}' +
    '.csel-opt[aria-selected="true"]::after{content:"";margin-left:auto;flex:none;width:7px;height:7px;border-radius:50%;background:currentColor}' +
    '.csel-opt--av{padding:7px 12px 7px 8px}' +
    '.csel-av{flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;overflow:hidden;font:800 .66rem var(--display,var(--font-display,sans-serif));color:#0a0e14;background:var(--c,#3a4250);box-shadow:0 0 0 2px var(--c,transparent)}' +
    '.csel-av img{width:100%;height:100%;object-fit:cover;display:block;border:2px solid var(--panel,var(--bg-panel,#161b23));border-radius:50%;box-sizing:border-box}' +
    '.csel-av--empty{background:transparent;color:var(--mute,var(--text-secondary,#9aa3af));box-shadow:inset 0 0 0 1.5px var(--line,var(--border-strong,#5a6575));border-style:dashed}' +
    '.csel-opt__txt{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}' +
    '.csel-opt__sub{flex:none;font:500 .7rem var(--mono,var(--font-mono,monospace));color:var(--mute,var(--text-secondary,#9aa3af))}' +
    '.csel-opt--av[aria-selected="true"] .csel-opt__txt{color:var(--c-sel,inherit)}' +
    '.csel-opt[aria-disabled="true"]{opacity:.4;cursor:default}' +
    '.csel-group{padding:10px 12px 4px;font:600 .68rem var(--mono,var(--font-mono,ui-monospace,monospace));text-transform:uppercase;letter-spacing:.1em;color:var(--mute,var(--text-secondary,#9aa3af))}';

  function labelOf(sel) {
    var o = sel.options[sel.selectedIndex];
    return o ? o.textContent.trim() : '';
  }
  function refresh(sel) {
    var btn = sel.__csel;
    if (!btn) return;
    var l = labelOf(sel), span = btn.firstChild;
    if (span.textContent !== l) span.textContent = l;
    if (btn.disabled !== sel.disabled) btn.disabled = sel.disabled;
    var a = sel.getAttribute('aria-label') || sel.title;
    if (a && btn.getAttribute('aria-label') !== a + ' : ' + l) btn.setAttribute('aria-label', a + ' : ' + l);
  }

  function enhance(sel) {
    if (sel.__csel || sel.multiple || sel.size > 1 || sel.hasAttribute('data-native') || !sel.parentNode) return;
    var cs = getComputedStyle(sel);
    if (cs.display === 'none') return;
    var parentW = sel.parentNode.clientWidth || 0;
    var w = sel.offsetWidth;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'csel ' + sel.className;
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="csel__label"></span>' + CHEV;
    // Même place que le menu d'origine : pleine largeur s'il l'était, sinon au moins sa largeur
    if (parentW && w >= parentW * 0.95) btn.style.width = '100%';
    else if (w) btn.style.minWidth = Math.min(w, 420) + 'px';
    if (cs.flexGrow !== '0') btn.style.flexGrow = cs.flexGrow;
    if (cs.flexBasis && cs.flexBasis !== 'auto') btn.style.flexBasis = cs.flexBasis;
    if (cs.gridColumnStart !== 'auto') btn.style.gridColumn = cs.gridColumnStart + ' / ' + cs.gridColumnEnd;
    // Les champs déjà stylés (padding, police) gardent leur taille
    btn.style.fontSize = cs.fontSize;
    btn.style.fontWeight = cs.fontWeight;
    btn.style.minHeight = sel.offsetHeight + 'px';
    if (sel.id) {
      var lab = document.querySelector('label[for="' + CSS.escape(sel.id) + '"]');
      if (lab) lab.addEventListener('click', function (e) { e.preventDefault(); btn.focus(); });
    }
    sel.__csel = btn;
    all.add(sel);
    sel.classList.add('csel-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    sel.parentNode.insertBefore(btn, sel.nextSibling);
    refresh(sel);
    sel.addEventListener('change', function () { refresh(sel); });
    btn.addEventListener('click', function () { if (open && open.sel === sel) close(true); else openFor(sel); });
    btn.addEventListener('keydown', function (e) {
      if (open && open.sel === sel) return; // géré par la liste
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].indexOf(e.key) >= 0) { e.preventDefault(); openFor(sel); }
    });
  }

  function openFor(sel) {
    close(false);
    var btn = sel.__csel;
    if (btn.disabled) return;
    var pop = document.createElement('ul');
    pop.className = 'csel-pop';
    pop.setAttribute('role', 'listbox');
    pop.tabIndex = -1;
    var items = [];
    Array.prototype.forEach.call(sel.children, function (node) {
      if (node.tagName === 'OPTGROUP') {
        var g = document.createElement('li'); g.className = 'csel-group'; g.setAttribute('role', 'presentation'); g.textContent = node.label;
        pop.appendChild(g);
        Array.prototype.forEach.call(node.children, function (o) { add(o); });
      } else if (node.tagName === 'OPTION') add(node);
    });
    function add(o) {
      if (o.hidden) return;
      var li = document.createElement('li');
      li.className = 'csel-opt';
      li.setAttribute('role', 'option');
      var txt = o.textContent.trim();
      // Option avec une personne (data-color, data-img) : pastille avec sa photo ou ses initiales
      if (o.dataset.color || o.dataset.img || o.hasAttribute('data-avatar')) {
        li.classList.add('csel-opt--av');
        var av = document.createElement('span');
        av.className = 'csel-av' + (o.dataset.color || o.dataset.img ? '' : ' csel-av--empty');
        if (o.dataset.color) av.style.setProperty('--c', o.dataset.color);
        if (o.dataset.img) { var im = document.createElement('img'); im.src = o.dataset.img; im.alt = ''; im.referrerPolicy = 'no-referrer'; av.appendChild(im); }
        else av.textContent = o.dataset.initials || (o.dataset.color ? txt.slice(0, 2).toUpperCase() : '?');
        var lab = document.createElement('span'); lab.className = 'csel-opt__txt'; lab.textContent = txt;
        li.appendChild(av); li.appendChild(lab);
        if (o.dataset.sub) { var sub = document.createElement('small'); sub.className = 'csel-opt__sub'; sub.textContent = o.dataset.sub; li.appendChild(sub); }
      } else li.textContent = txt;
      li.setAttribute('aria-selected', o.selected ? 'true' : 'false');
      if (o.disabled) li.setAttribute('aria-disabled', 'true');
      li.addEventListener('mousedown', function (e) { e.preventDefault(); });
      li.addEventListener('click', function () { if (!o.disabled) choose(o.index); });
      li.addEventListener('mousemove', function () { act(items.indexOf(it)); });
      var it = { li: li, o: o };
      items.push(it);
      pop.appendChild(li);
    }
    document.body.appendChild(pop);
    open = { sel: sel, btn: btn, pop: pop, items: items, idx: -1, typed: '', tt: 0 };
    btn.setAttribute('aria-expanded', 'true');
    place();
    var cur = 0;
    items.forEach(function (it, i) { if (it.o.selected) cur = i; });
    act(cur, true);
    pop.addEventListener('keydown', onKey);
    pop.focus({ preventScroll: true });
  }

  function place() {
    if (!open) return;
    var r = open.btn.getBoundingClientRect(), pop = open.pop;
    var w = Math.max(r.width, 180);
    pop.style.minWidth = w + 'px';
    pop.style.maxWidth = Math.max(w, Math.min(420, innerWidth - 16)) + 'px';
    var below = innerHeight - r.bottom - 12, above = r.top - 12;
    var h = Math.min(pop.scrollHeight, 340);
    var up = below < Math.min(h, 220) && above > below;
    pop.style.maxHeight = Math.max(120, Math.min(340, up ? above : below)) + 'px';
    var left = Math.min(r.left, innerWidth - pop.offsetWidth - 8);
    pop.style.left = Math.max(8, left) + 'px';
    pop.style.top = (up ? Math.max(8, r.top - 6 - Math.min(h, above)) : r.bottom + 6) + 'px';
  }

  function act(i, scroll) {
    if (!open || i < 0 || i >= open.items.length) return;
    if (open.idx >= 0) open.items[open.idx].li.classList.remove('is-act');
    open.idx = i;
    var li = open.items[i].li;
    li.classList.add('is-act');
    if (scroll) {
      var p = open.pop;
      if (li.offsetTop < p.scrollTop) p.scrollTop = li.offsetTop - 6;
      else if (li.offsetTop + li.offsetHeight > p.scrollTop + p.clientHeight) p.scrollTop = li.offsetTop + li.offsetHeight - p.clientHeight + 6;
    }
  }
  function move(d) {
    if (!open) return;
    var i = open.idx, n = open.items.length;
    for (var k = 0; k < n; k++) {
      i = Math.max(0, Math.min(n - 1, i + d));
      if (!open.items[i].o.disabled) break;
    }
    act(i, true);
  }

  function choose(index) {
    var sel = open.sel;
    var changed = sel.selectedIndex !== index;
    close(true);
    if (!changed) return;
    setValue.call(sel, sel.options[index].value);
    sel.selectedIndex = index;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    refresh(sel);
  }

  function onKey(e) {
    if (!open) return;
    var k = e.key;
    if (k === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (k === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (k === 'Home') { e.preventDefault(); act(0, true); }
    else if (k === 'End') { e.preventDefault(); act(open.items.length - 1, true); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); var it = open.items[open.idx]; if (it && !it.o.disabled) choose(it.o.index); }
    else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (k === 'Tab') { close(false); }
    else if (k.length === 1 && /\S/.test(k)) {
      clearTimeout(open.tt);
      open.typed += k.toLowerCase();
      open.tt = setTimeout(function () { if (open) open.typed = ''; }, 700);
      for (var i = 0; i < open.items.length; i++) {
        if (open.items[i].li.textContent.toLowerCase().indexOf(open.typed) === 0) { act(i, true); break; }
      }
    }
  }

  function close(focus) {
    if (!open) return;
    var o = open;
    open = null;
    o.btn.setAttribute('aria-expanded', 'false');
    o.pop.remove();
    if (focus) o.btn.focus({ preventScroll: true });
  }

  document.addEventListener('mousedown', function (e) {
    if (open && !open.pop.contains(e.target) && !open.btn.contains(e.target)) close(false);
  }, true);
  window.addEventListener('resize', function () { close(false); });
  document.addEventListener('scroll', function (e) { if (open && !open.pop.contains(e.target)) close(false); }, true);

  // Nouveaux menus (pages qui se dessinent après coup, React) et valeurs changées par le code
  var queued = false, all = new Set();
  function scan() {
    queued = false;
    all.forEach(function (s) {
      if (!s.isConnected) { if (s.__csel) s.__csel.remove(); all.delete(s); if (open && open.sel === s) close(false); }
    });
    document.querySelectorAll('select').forEach(function (s) {
      if (s.__csel) {
        if (!s.__csel.isConnected) {
          // React ou le site a redessiné autour : on remet le bouton à côté
          if (s.isConnected && s.parentNode) s.parentNode.insertBefore(s.__csel, s.nextSibling);
        }
        refresh(s);
      } else enhance(s);
    });
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(scan); } }
  function boot() {
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
    scan();
    new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['selected', 'disabled'] });
    // React change parfois la valeur sans événement : on resynchronise de temps en temps
    setInterval(function () { document.querySelectorAll('select.csel-native').forEach(refresh); }, 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
