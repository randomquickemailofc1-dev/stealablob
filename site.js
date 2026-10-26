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
        try {
          const r = await fetch(api + '/site/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit' });
          status = r.status;
        } catch (err) { status = 0; }
        busy = false; send.disabled = false;
        if (status >= 200 && status < 300) {
          store.set(key, String(value));
          lock(value);
          msg.textContent = t ? 'Thanks! The team reads every comment.' : 'Thanks for rating!';
        } else if (status === 429) {
          msg.textContent = 'Too many ratings from here right now. Try again later.';
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

  setupTheme();
  setupRate();
})();
