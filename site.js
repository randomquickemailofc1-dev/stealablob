/* Steal a Blob website, every page (small on purpose: many pages load nothing else):
   🎨 the theme picker (the inline <head> script in gen/shell.theme_script applies the saved theme before the first paint)
   ⭐ "Rate this page": 5 stars + an optional comment to the Discord bot (site.config.json feedbackApi), one rating per page
   per browser; the page's average and the site's average when the bot answers. Comments are never shown on the site. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const store = {
    get(k) { try { return localStorage.getItem('sab.' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('sab.' + k, v); } catch (e) { /* private mode */ } },
  };

  // ---------------------------------------------------------- 🎨 themes
  const THEMES = ['galaxy', 'spooky', 'frost', 'candy', 'lava'];
  function seasonTheme() {
    // the <head> script (gen/shell.theme_script) works out the running season's theme from the game data
    const a = document.documentElement.getAttribute('data-season-theme');
    return THEMES.includes(a) ? a : 'galaxy';
  }
  function setMetaColor() {
    const m = $('meta[name="theme-color"]');
    if (!m) return;
    const c = getComputedStyle(document.documentElement).getPropertyValue('--night-2').trim();
    if (c) m.setAttribute('content', c);
  }
  function setupTheme() {
    const btn = $('.theme-btn'), menu = $('#theme-menu');
    if (!btn || !menu) return;
    let pick = store.get('theme') || 'auto';
    if (pick !== 'auto' && !THEMES.includes(pick)) pick = 'auto';
    const autoTheme = seasonTheme(); // what "auto" means right now
    const items = $$('[role="menuitemradio"]', menu);
    function mark() {
      for (const it of items) it.setAttribute('aria-checked', String(it.dataset.theme === pick));
    }
    function apply(t) {
      pick = t;
      store.set('theme', t);
      const real = t === 'auto' ? autoTheme : t;
      if (real === 'galaxy') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', real);
      mark(); setMetaColor();
    }
    function open(focusFirst) {
      menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
      const cur = items.find((it) => it.dataset.theme === pick) || items[0];
      if (focusFirst) cur.focus();
    }
    function close(focusBtn) {
      menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
      if (focusBtn) btn.focus();
    }
    btn.addEventListener('click', () => (menu.hidden ? open(true) : close(false)));
    for (const it of items) it.addEventListener('click', () => { apply(it.dataset.theme); close(true); });
    menu.addEventListener('keydown', (e) => {
      const i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === 'Tab') close(false);
    });
    document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('.theme')) close(false); });
    mark(); setMetaColor();
  }

  // ---------------------------------------------------------- ⭐ rate this page
  const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);
  async function getJson(url, ms) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), ms) : 0;
    try {
      const r = await fetch(url, { signal: ctl ? ctl.signal : undefined, credentials: 'omit' });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; } finally { clearTimeout(timer); }
  }
  function setupRate() {
    const box = $('.rate');
    if (!box || typeof fetch !== 'function') return;
    const api = box.dataset.api, slug = box.dataset.page;
    if (!api || !slug) return;
    box.hidden = false;
    const stars = $$('.rate-stars button', box), form = $('.rate-form', box), text = $('#rate-text', box);
    const msg = $('.rate-msg', box), avgEl = $('.rate-avg', box), count = $('.rate-count', box), send = $('.rate-send', box);
    const key = 'rated.' + slug;
    let value = 0, busy = false;
    const done = +(store.get(key) || 0);
    function paint(v) {
      stars.forEach((s, i) => { s.classList.toggle('on', i < v); s.setAttribute('aria-checked', String(i + 1 === v)); });
    }
    function lock(v) {
      paint(v);
      for (const s of stars) { s.disabled = true; }
      box.classList.add('rated');
      form.hidden = true;
    }
    if (done >= 1 && done <= 5) {
      lock(done);
      msg.textContent = `Thanks! You gave this page ${done} star${done > 1 ? 's' : ''}.`;
    } else {
      stars.forEach((s, i) => {
        s.addEventListener('click', () => { value = i + 1; paint(value); form.hidden = false; msg.textContent = ''; });
        s.addEventListener('mouseenter', () => { if (!value) paint(i + 1); });
        s.addEventListener('mouseleave', () => { if (!value) paint(0); });
        s.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); stars[Math.min(4, i + 1)].focus(); stars[Math.min(4, i + 1)].click(); }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); stars[Math.max(0, i - 1)].focus(); stars[Math.max(0, i - 1)].click(); }
        });
      });
      text.addEventListener('input', () => { count.textContent = `${text.value.length}/500`; });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!value || busy) return;
        busy = true; send.disabled = true; msg.textContent = 'Sending…';
        const body = { page: slug, rating: value };
        const t = text.value.trim().slice(0, 500);
        if (t) body.text = t;
        let status = 0;
        let wait = 0;
        try {
          const r = await fetch(api + '/site/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit' });
          status = r.status;
          if (status === 429) {
            const j = await r.json().catch(() => null);
            wait = Number((j && j.retryAfter) || r.headers.get('Retry-After')) || 0;
          }
        } catch (err) { status = 0; }
        busy = false; send.disabled = false;
        if (status >= 200 && status < 300) {
          store.set(key, String(value));
          lock(value);
          msg.textContent = t ? 'Thanks! The team reads every comment.' : 'Thanks for rating!';
        } else if (status === 429) {
          msg.textContent = wait > 0 && wait < 120 ? `Slow down a little! Try again in ${Math.ceil(wait)} s.`
            : wait >= 120 ? `That's a lot of ratings from here. Try again in ${Math.ceil(wait / 60)} min.`
            : 'Too many ratings from here right now. Try again later.';
        } else if (status === 400 || status === 413) {
          msg.textContent = "That didn't go through. Try a shorter comment.";
        } else if (status === 503) {
          msg.textContent = 'Our bot is just waking up. Try again in a minute.';
        } else {
          msg.textContent = "Couldn't send it right now. Try again in a bit.";
        }
      });
    }
    // the averages (the bot may be asleep: then they just don't show)
    getJson(api + '/site/ratings', 5000).then((d) => {
      if (!d || typeof d !== 'object') return;
      const parts = [];
      const p = d.byPage && d.byPage[slug];
      if (p && p.count > 0 && typeof p.avg === 'number') parts.push(`This page ★ ${fmt(p.avg)} (${p.count})`);
      if (d.count > 0 && typeof d.avg === 'number') parts.push(`Whole site ★ ${fmt(d.avg)} (${d.count})`);
      if (parts.length) { avgEl.textContent = parts.join(' • '); avgEl.hidden = false; }
    });
  }

  // 📲 the app: register the service worker; show "Get the app" (Android/Chrome = the real install prompt,
  // iPhone = how to Add to Home Screen); hidden once installed / opened as the app
  function setupApp() {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const box = $('.get-app'), btn = $('.app-btn'), hint = $('.app-hint');
    if (!box || !btn) return;
    const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    if (standalone) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let deferred = null;
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; box.hidden = false; });
    window.addEventListener('appinstalled', () => { box.hidden = true; });
    if (ios) box.hidden = false;
    btn.addEventListener('click', async () => {
      if (deferred) {
        deferred.prompt();
        try { await deferred.userChoice; } catch (_) { /* dismissed */ }
        deferred = null;
        box.hidden = true;
      } else if (hint) {
        hint.hidden = !hint.hidden;
      }
    });
  }

  // ---------------------------------------------------------- ☰ More: the footer's site map (#site-map) as a sheet
  // The More links point at #site-map, so without JS (or <dialog>) they just jump to the footer.
  function setupMenu() {
    const map = $('#site-map');
    if (!map || typeof HTMLDialogElement !== 'function') return;
    let dlg = null;
    function build() {
      dlg = document.createElement('dialog');
      dlg.className = 'sheet menu-sheet';
      dlg.setAttribute('aria-labelledby', 'menu-h');
      const inner = document.createElement('div');
      inner.className = 'sh-in';
      inner.innerHTML = '<button class="sh-close" type="button" aria-label="Close">✕</button><p class="menu-h" id="menu-h">All pages</p>';
      const copy = map.cloneNode(true);
      copy.removeAttribute('id');
      copy.classList.add('menu-map');
      inner.appendChild(copy);
      const play = $('a.playbar') || $('a.play-mini');
      if (play) { // the page's own Play link (already the right src, the ?ref= script ran before this)
        const p = play.cloneNode(true);
        p.className = 'btn btn-play menu-play';
        p.lastElementChild.textContent = 'Play free on Roblox';
        inner.appendChild(p);
      }
      dlg.appendChild(inner);
      document.body.appendChild(dlg);
      inner.querySelector('.sh-close').addEventListener('click', () => dlg.close());
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    }
    for (const a of $$('[data-menu]')) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (!dlg) build();
        if (!dlg.open) dlg.showModal();
      });
    }
  }

  setupTheme();
  setupRate();
  setupApp();
  setupMenu();
})();
