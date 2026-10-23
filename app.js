/* Steal a Blob website: countdowns, copy buttons, the blob list (search / rarity / sort),
   the blob sheet and the value calculator. Data comes from <script id="sab-data"> written by build.py. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = $('#sab-data');
  const DATA = el ? JSON.parse(el.textContent) : {};
  const now = () => Date.now() / 1000;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem('sab.' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('sab.' + k, v); } catch (e) { /* private mode */ } },
  };

  // ---------------------------------------------------------- numbers (Format.number from the game)
  const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  const trim = (t) => (t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t);
  function fnum(n) {
    if (!isFinite(n)) return '0';
    const sign = n < 0 ? '-' : ''; n = Math.abs(n);
    if (n < 1000) return sign + (n === Math.floor(n) ? String(n) : trim((Math.floor(n * 10) / 10).toFixed(1)));
    const i = Math.min(Math.floor(Math.log10(n) / 3), SUF.length - 1);
    const s = n / Math.pow(1000, i);
    const t = s >= 100 ? String(Math.floor(s)) : s >= 10 ? trim((Math.floor(s * 10) / 10).toFixed(1)) : trim((Math.floor(s * 100) / 100).toFixed(2));
    return sign + t + SUF[i];
  }
  const money = (n) => '$' + fnum(n);
  const mult = (n) => String(+n.toFixed(4)); // multipliers exactly (1.25, not 1.2)
  const commas = (n) => Math.floor(n).toLocaleString('en-US');

  // ---------------------------------------------------------- time
  const pad = (n) => String(n).padStart(2, '0');
  function left(sec) {
    sec = Math.max(0, Math.floor(sec));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (d > 0) return `${d}d ${h}h ${pad(m)}m`;
    if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
    return `${m}m ${pad(s)}s`;
  }
  function localTime(t, fmt) {
    const d = new Date(t * 1000);
    try {
      if (fmt === 'date') return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d);
      if (fmt === 'weekly') {
        const day = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(d);
        const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);
        return `${day} at ${time}`;
      }
      return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
    } catch (e) { return d.toUTCString(); }
  }
  function localize(root = document) {
    for (const t of $$('time[data-time]', root)) {
      const ts = +t.dataset.time;
      t.textContent = localTime(ts, t.dataset.fmt);
      t.dateTime = new Date(ts * 1000).toISOString();
    }
  }
  let onFlip = null; // called when a countdown reaches zero (an event starts or ends)
  function tick() {
    const n = now();
    let flipped = false;
    for (const c of $$('.cd[data-until]')) {
      const s = +c.dataset.until - n;
      if (s <= 0 && !c.dataset.done) { c.dataset.done = '1'; flipped = true; }
      c.textContent = s > 0 ? left(s) : 'now';
    }
    if (hourly) hourly();
    if (flipped && onFlip) onFlip();
  }

  // ---------------------------------------------------------- home: live cards
  let hourly = null;
  function setupHome(live) {
    const card = (id) => document.getElementById(id);
    function seasonCard() {
      const c = card('season-card'); if (!c) return;
      const t = now();
      const cur = live.seasons.find((s) => s.start <= t && t < s.end);
      const next = live.seasons.filter((s) => s.start > t).sort((a, b) => a.start - b.start)[0];
      const s = cur || next; if (!s) { c.hidden = true; return; }
      c.style.setProperty('--accent', s.color);
      const thumbs = cur ? s.blobs.slice(0, 5).map((b) => `<img src="${esc(b.img)}" alt="${esc(b.n)}" width="64" height="64" loading="lazy" decoding="async">`).join('') : '';
      const sub = cur
        ? (s.blobs.length ? `${s.blobs.length} LIMITED blobs on the Blob Road` : 'LIMITED blobs on the Blob Road') + (s.event ? `, tons more during ${esc(s.event)}` : '')
        : 'LIMITED blobs are coming';
      const nextLine = cur && next ? `<p class="lc-next">Next: ${esc(next.icon)} ${esc(next.id)} season, <time data-time="${next.start}" data-fmt="date"></time></p>` : '';
      c.innerHTML = `<div class="lc-head"><span class="lc-icon" aria-hidden="true">${esc(s.icon)}</span><div><h3 class="lc-title">${esc(s.id)} season</h3><p class="lc-sub">${sub}</p></div></div>`
        + (thumbs ? `<div class="thumbs">${thumbs}</div>` : '')
        + `<p class="lc-when">${cur ? 'Ends in' : 'Starts in'} <b class="cd" data-until="${cur ? s.end : s.start}"></b></p>${nextLine}`;
    }
    function dropCard() {
      const c = card('drop-card'); if (!c) return;
      const t = now();
      const recent = live.drops.filter((d) => d.t <= t && t < d.t + 7 * 86400).pop();
      const next = live.drops.find((d) => d.t > t);
      let html = '<div class="lc-head"><span class="lc-icon" aria-hidden="true">🆕</span><div><h3 class="lc-title">Blob Friday</h3><p class="lc-sub">A new blob drops every Friday</p></div></div>';
      if (recent) {
        const name = recent.out ? recent.name : (recent.name || 'A new blob');
        html += `<div class="drop-row is-new"><img src="${esc(recent.img)}" alt="${esc(name)}" width="88" height="88" class="${recent.out ? '' : 'sil'}"><div><span class="tag-new">NEW</span>`
          + `<p class="dn">${esc(name)}</p><p class="dw">Out now in game</p></div></div>`;
      }
      if (next) {
        html += `<div class="drop-row"><img src="${esc(next.img)}" alt="Next blob (silhouette)" width="88" height="88" class="sil"><div><span class="tag-soon">NEXT DROP</span>`
          + `<p class="dn">${esc(next.name || 'Mystery blob')}</p><p class="dw"><time data-time="${next.t}" data-fmt="full"></time></p>`
          + `<p class="lc-when">Drops in <b class="cd" data-until="${next.t}"></b></p></div></div>`;
      }
      if (!recent && !next) html += '<p class="lc-when">The next drop will be announced in the Discord.</p>';
      c.innerHTML = html;
    }
    function partyCard() {
      const c = card('party-card'); const p = live.party; if (!c || !p) return;
      const t = now(), week = 7 * 86400;
      const start = t - ((((t - p.offset) % week) + week) % week);
      const on = t < start + p.dur;
      c.classList.toggle('is-live', on);
      const w = card('party-when');
      if (w) w.innerHTML = on ? `<b class="tag-new">LIVE NOW</b> ends in <b class="cd" data-until="${start + p.dur}"></b>` : `Starts in <b class="cd" data-until="${start + week}"></b>`;
    }
    const h = live.hourly, hEl = card('hourly');
    if (h && hEl && h.events.length) {
      hourly = () => {
        const t = now(), into = t % 3600;
        if (into < h.dur) {
          const e = h.events[Math.floor(t / 3600) % h.events.length];
          hEl.innerHTML = `${esc(e.icon)} <b>${esc(e.n)}</b> is on now: ${esc(e.d)} (${left(h.dur - into)} left)`;
        } else {
          const st = (Math.floor(t / 3600) + 1) * 3600;
          const e = h.events[(st / 3600) % h.events.length];
          hEl.innerHTML = `${esc(e.icon)} Next hourly event: <b>${esc(e.n)}</b> in ${left(st - t)}`;
        }
      };
    }
    const all = () => { seasonCard(); dropCard(); partyCard(); localize(); tick(); };
    onFlip = all;
    all();
  }

  // ---------------------------------------------------------- codes: copy buttons
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall back below */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); Object.assign(ta.style, { position: 'fixed', top: '0', opacity: '0' });
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove(); return ok;
  }
  for (const b of $$('.btn-copy')) {
    b.addEventListener('click', async () => {
      const code = b.dataset.code; const label = b.querySelector('span');
      const ok = await copyText(code);
      if (ok) {
        b.classList.add('done'); label.textContent = 'Copied!';
        setTimeout(() => { b.classList.remove('done'); label.textContent = 'Copy'; }, 1600);
      } else { // select the code so it can be copied by hand
        const c = b.closest('.code-card').querySelector('.code');
        const r = document.createRange(); r.selectNodeContents(c);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        label.textContent = 'Selected';
      }
    });
  }

  // in-app browsers (TikTok, Instagram...) often can't open the Roblox app
  if (/TikTok|musical_ly|Bytedance|Instagram|FBAN|FBAV|Snapchat/i.test(navigator.userAgent)) {
    const h = $('#inapp'); if (h) h.hidden = false;
  }

  // ---------------------------------------------------------- values page
  function setupValues(D) {
    const byId = Object.fromEntries(D.blobs.map((b) => [b.id, b]));
    const mutBy = Object.fromEntries(D.muts.map((m) => [m.n, m]));
    const R = D.rarities;
    const grid = $('#grid'), q = $('#q'), sortSel = $('#sort'), count = $('#count'), empty = $('#empty');
    const cards = $$('.blob[data-id]', grid);
    const soon = $$('.blob.soon', grid);
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    let rarity = '';
    const saved = store.get('sort');
    if (saved && sortSel.querySelector(`option[value="${saved}"]`)) sortSel.value = saved;
    const cmp = {
      value: (a, b) => b.p - a.p || a.x - b.x,
      'value-asc': (a, b) => a.p - b.p || a.x - b.x,
      income: (a, b) => b.i - a.i || a.x - b.x,
      rarity: (a, b) => R[b.r].o - R[a.r].o || b.p - a.p,
      new: (a, b) => (b.rel || 0) - (a.rel || 0) || b.x - a.x,
      name: (a, b) => a.n.localeCompare(b.n),
    };
    function apply() {
      const term = norm(q.value);
      const list = cards.map((c) => byId[c.dataset.id]).sort(cmp[sortSel.value] || cmp.value);
      let shown = 0;
      for (const b of list) {
        const c = grid.querySelector(`[data-id="${CSS.escape(b.id)}"]`);
        const ok = (!rarity || b.r === rarity) && (!term || norm(b.n).includes(term));
        c.hidden = !ok; if (ok) shown++;
        grid.appendChild(c);
      }
      for (const s of soon) { s.hidden = !!(rarity || term); grid.appendChild(s); }
      count.textContent = shown === cards.length ? `${shown} blobs` : `${shown} of ${cards.length} blobs`;
      empty.hidden = shown > 0;
    }
    q.addEventListener('input', apply);
    sortSel.addEventListener('change', () => { store.set('sort', sortSel.value); apply(); });
    for (const chip of $$('.chip')) {
      chip.addEventListener('click', () => {
        rarity = chip.dataset.r;
        for (const c of $$('.chip')) c.setAttribute('aria-pressed', String(c === chip));
        apply();
      });
    }
    apply();
    for (const s of soon) if (now() >= +s.dataset.soon) s.querySelector('.bw').textContent = 'Out now in game!';
    // NEW lasts a week after a drop, even if the site wasn't rebuilt since
    for (const c of cards) { const b = byId[c.dataset.id]; const tag = c.querySelector('.tag-new'); if (tag && b.rel && now() >= b.rel + 7 * 86400) tag.remove(); }

    // ---- calculator
    const cBlob = $('#c-blob');
    let cMut = 'None', cLv = 1;
    function calc() {
      const b = byId[cBlob.value]; if (!b) return;
      const m = mutBy[cMut] || { m: 1, l: 'Normal' };
      const lm = D.levels[cLv - 1] || 1;
      const value = b.p * m.m * lm, income = b.i * m.m * lm;
      const img = $('#c-img'); img.src = b.img; img.alt = b.n;
      $('#c-name').textContent = (cMut !== 'None' ? m.l + ' ' : '') + b.n + (cLv > 1 ? ' ' + '★'.repeat(cLv) : '');
      const v = $('#c-val'); v.textContent = money(value); v.title = '$' + commas(value);
      const i = $('#c-inc'); i.textContent = money(income) + '/s'; i.title = '$' + commas(income) + ' per second';
      $('#c-sell').textContent = money(Math.floor(value * D.sell));
      $('#c-f').textContent = `${money(b.p)} × ${mult(m.m)} (${m.l}) × ${mult(lm)} (${'★'.repeat(cLv)}) = ${money(value)}`;
    }
    function press(groupSel, attr, val) {
      for (const x of $$(groupSel + ' .seg-b')) x.setAttribute('aria-pressed', String(x.dataset[attr] === String(val)));
    }
    cBlob.addEventListener('change', calc);
    for (const b of $$('#c-mut .seg-b')) b.addEventListener('click', () => { cMut = b.dataset.m; press('#c-mut', 'm', cMut); calc(); });
    for (const b of $$('#c-lv .seg-b')) b.addEventListener('click', () => { cLv = +b.dataset.l; press('#c-lv', 'l', cLv); calc(); });
    calc();

    // ---- blob sheet
    const sheet = $('#sheet'), body = $('#sh-body');
    function pill(r) { const x = R[r]; return `<span class="pill" style="--pc:${x.c};--pt:${x.t};--pa:${x.a}">${esc(r)}</span>`; }
    function open(id) {
      const b = byId[id]; if (!b || !sheet.showModal) return false;
      const head = `<tr><th></th>${D.levels.map((_, k) => `<th scope="col">${'★'.repeat(k + 1)}</th>`).join('')}</tr>`;
      const rows = D.muts.map((m) => `<tr><th scope="row">${esc(m.l)}</th>${D.levels.map((lm) => `<td>${money(b.p * m.m * lm)}<small>${money(b.i * m.m * lm)}/s</small></td>`).join('')}</tr>`).join('');
      const how = b.how.map(([ic, t, o]) => `<li><span aria-hidden="true">${esc(ic)}</span><span>${esc(t)}</span>${o ? `<b>${esc(o)}</b>` : '<span></span>'}</li>`).join('');
      body.innerHTML = `<button class="sh-close" type="button" aria-label="Close">✕</button>`
        + `<div class="sh-top" style="--rc:${R[b.r].a}"><img src="${esc(b.img)}" alt="${esc(b.n)}" width="120" height="120"><div>${pill(b.r)}`
        + `<h2 class="sh-name" id="sh-name" tabindex="-1">${esc(b.n)}</h2><p class="sh-desc">${esc(b.d)}</p></div></div>`
        + `<div class="sh-stats"><div><span>Value</span><b class="v" title="$${commas(b.p)}">${money(b.p)}</b></div><div><span>Income</span><b class="i">${money(b.i)}/s</b></div>`
        + `<div><span>Sells for</span><b>${money(Math.floor(b.p * D.sell))}</b></div></div>`
        + `<h3 class="sh-h">How to get it</h3><ul class="how">${how}</ul>`
        + `<h3 class="sh-h">Value with mutations and stars</h3><table class="mx"><thead>${head}</thead><tbody>${rows}</tbody></table>`
        + `<button class="btn sh-calc" type="button">Open in the calculator</button>`;
      body.querySelector('.sh-close').addEventListener('click', () => sheet.close());
      body.querySelector('.sh-calc').addEventListener('click', () => {
        cBlob.value = b.id; calc(); sheet.close();
        $('#calc').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
      if (!sheet.open) sheet.showModal();
      sheet.scrollTop = 0;
      body.querySelector('.sh-name').focus({ preventScroll: true });
      return true;
    }
    sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
    sheet.addEventListener('close', () => { if (byId[location.hash.slice(1)]) history.replaceState(null, '', location.pathname + location.search); });
    for (const c of cards) {
      c.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        if (open(c.dataset.id)) { e.preventDefault(); history.replaceState(null, '', '#' + c.dataset.id); }
      });
    }
    const fromHash = () => { const id = decodeURIComponent(location.hash.slice(1)); if (byId[id]) open(id); };
    window.addEventListener('hashchange', fromHash);
    fromHash();
  }

  // ---------------------------------------------------------- start
  localize();
  if (DATA.live) setupHome(DATA.live);
  if (DATA.blobs) setupValues(DATA);
  tick();
  if ($('.cd[data-until]') || hourly) setInterval(tick, 1000);
})();
