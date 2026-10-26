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
  // repeating events on the guide pages (Golden Hour, Blob Party, Galaxy Hour):
  // <b class="rc" data-period="604800" data-offset="320400" data-dur="3600"> (offset from 00:00 UTC Thursday Jan 1 1970, like the game)
  function recurring(n) {
    for (const el of $$('.rc[data-period]')) {
      const p = +el.dataset.period, off = +el.dataset.offset, dur = +el.dataset.dur;
      const start = n - ((((n - off) % p) + p) % p);
      const on = n < start + dur;
      el.classList.toggle('on', on);
      el.textContent = on ? `LIVE NOW, ${left(start + dur - n)} left` : `in ${left(start + p - n)}`;
    }
  }
  function tick() {
    const n = now();
    recurring(n);
    let flipped = false;
    for (const c of $$('.cd[data-until]')) {
      const s = +c.dataset.until - n;
      if (s <= 0 && !c.dataset.done) { c.dataset.done = '1'; flipped = true; }
      c.textContent = s > 0 ? left(s) : 'now';
    }
    if (hourly) hourly();
    if (flipped && onFlip) onFlip();
  }

  // ---------------------------------------------------------- ☀️ Mutation of the Day
  // The SAME rule as Config.dailyMutationOn in the game (src/shared/Config.luau): cycles of
  // pool.length days, each a seeded shuffle (an LCG that stays exact in doubles), and a cycle
  // never starts with the mutation the previous one ended on. checks.py runs exactly the code
  // between the markers in node and compares 60 days with the game's own answers.
  // @daily-rule-begin
  function dailyMutationOn(day, rule) {
    const pool = rule.pool, n = pool.length;
    const cycle = (c) => {
      const p = pool.slice();
      let x = ((c * 7919 + rule.seed) % 2147483646) + 1;
      for (let i = n; i >= 2; i--) {
        x = (x * 48271) % 2147483647;
        const j = x % i;
        const t = p[i - 1]; p[i - 1] = p[j]; p[j] = t;
      }
      return p;
    };
    const c = Math.floor(day / n);
    const cur = cycle(c);
    if (n >= 3) {
      const prev = cycle(c - 1);
      if (cur[0] === prev[n - 1]) { const t = cur[0]; cur[0] = cur[1]; cur[1] = t; }
    }
    return cur[((day % n) + n) % n];
  }
  // @daily-rule-end

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
    // weekly events (Blob Party, 🌌 Galaxy Hour): seconds after Thursday 00:00 UTC, like the game
    function weeklyCard(id, whenId, p) {
      const c = card(id); if (!c || !p) return;
      const t = now(), week = 7 * 86400;
      const start = t - ((((t - p.offset) % week) + week) % week);
      const on = t < start + p.dur;
      c.classList.toggle('is-live', on);
      const w = card(whenId);
      if (w) w.innerHTML = on ? `<b class="tag-new">LIVE NOW</b> ends in <b class="cd" data-until="${start + p.dur}"></b>` : `Starts in <b class="cd" data-until="${start + week}"></b>`;
    }
    const partyCard = () => weeklyCard('party-card', 'party-when', live.party);
    const galaxyCard = () => weeklyCard('galaxy-card', 'galaxy-when', live.galaxy);
    function dailyCard() {
      const c = card('daily-card'); const r = live.daily; if (!c || !r || !r.pool || !r.pool.length) return;
      const day = Math.floor(now() / 86400);
      const m = dailyMutationOn(day, r), next = dailyMutationOn(day + 1, r);
      const info = r.muts[m] || {}, ninfo = r.muts[next] || {};
      if (info.color) c.style.setProperty('--accent', info.color);
      const nameEl = card('daily-name'), oddsEl = card('daily-odds'), whenEl = card('daily-when');
      if (nameEl) nameEl.textContent = `${info.icon || ''} ${mult(r.mult)}x ${m}`;
      // it's rolled with 2x its chance and nothing rarer changes, so its real odds are exactly 2x
      if (oddsEl) oddsEl.textContent = info.odds ? `1 in ${commas(Math.round(1 / (info.odds * r.mult)))} today (normally 1 in ${commas(Math.round(1 / info.odds))})` : '';
      if (whenEl) whenEl.innerHTML = `Tomorrow: ${esc(ninfo.icon || '')} <b>${esc(next)}</b>, in <b class="cd" data-until="${(day + 1) * 86400}"></b>`;
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
    const all = () => { seasonCard(); dropCard(); partyCard(); galaxyCard(); dailyCard(); localize(); tick(); };
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

  // (in-app browsers: the "Open in browser" hint and the ?ref= Play links are handled by the inline script in every page)

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
        + `<div class="sh-links"><a class="btn sh-page" href="${esc(b.u)}">Open ${esc(b.n)}'s page</a><button class="btn sh-calc" type="button">Open in the calculator</button></div>`;
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
    const fromHash = () => {
      const h = decodeURIComponent(location.hash.slice(1));
      const calcId = h.startsWith('calc=') ? h.slice(5) : null;
      if (calcId && byId[calcId]) { // values.html#calc=KingWobble (links from the blob pages)
        cBlob.value = calcId; calc();
        $('#calc').scrollIntoView();
        return;
      }
      if (byId[h]) open(h);
    };
    window.addEventListener('hashchange', fromHash);
    fromHash();
  }

  // ---------------------------------------------------------- trade calculator
  function setupTrade(T) {
    const byId = Object.fromEntries(T.blobs.map((b) => [b.id, b]));
    const mutBy = Object.fromEntries(T.muts.map((m) => [m.n, m]));
    const SIDES = ['give', 'get'];
    const state = { give: [], get: [] };
    const maxLv = T.levels.length;
    const mult = (n) => String(+n.toFixed(4));
    // #give=KingWobble.Gold.2,CloudPuff&get=VoidGobbler  (blob.mutation.stars, shareable)
    function parse() {
      const h = new URLSearchParams(location.hash.slice(1));
      for (const side of SIDES) {
        state[side] = (h.get(side) || '').split(',').filter(Boolean).map((tok) => {
          const [id, m = 'None', l = '1'] = tok.split('.');
          return byId[id] ? { id, m: mutBy[m] ? m : 'None', l: Math.min(Math.max(parseInt(l, 10) || 1, 1), maxLv) } : null;
        }).filter(Boolean).slice(0, T.max);
      }
    }
    function serialize() {
      return SIDES.filter((s) => state[s].length).map((s) => s + '=' + state[s].map((x) =>
        x.id + (x.m !== 'None' || x.l > 1 ? '.' + x.m + (x.l > 1 ? '.' + x.l : '') : '')).join(',')).join('&');
    }
    const val = (x) => byId[x.id].p * mutBy[x.m].m * T.levels[x.l - 1];
    const inc = (x) => byId[x.id].i * mutBy[x.m].m * T.levels[x.l - 1];
    const sum = (side, f) => state[side].reduce((a, x) => a + f(x), 0);
    const mutOpts = (sel) => T.muts.map((m) => `<option value="${esc(m.n)}"${m.n === sel ? ' selected' : ''}>${esc(m.ic ? m.ic + ' ' : '')}${esc(m.l)} x${mult(m.m)}</option>`).join('');
    const lvOpts = (sel) => T.levels.map((lm, k) => `<option value="${k + 1}"${k + 1 === sel ? ' selected' : ''}>${'★'.repeat(k + 1)} x${mult(lm)}</option>`).join('');
    function item(side, x, k) {
      const b = byId[x.id], r = T.rarities[b.r];
      return `<li class="t-item" style="--rc:${r.a}"><img class="ti-img" src="${esc(b.img)}" alt="" width="52" height="52">`
        + `<a class="ti-name" href="${esc(b.u)}">${esc(b.n)}</a><b class="v ti-v">${money(val(x))}</b>`
        + `<button type="button" class="ti-x" data-side="${side}" data-k="${k}" aria-label="Remove ${esc(b.n)}">✕</button>`
        + `<div class="ti-sel"><label><span class="vh">Mutation</span><select data-side="${side}" data-k="${k}" data-f="m">${mutOpts(x.m)}</select></label>`
        + `<label><span class="vh">Stars</span><select data-side="${side}" data-k="${k}" data-f="l">${lvOpts(x.l)}</select></label></div></li>`;
    }
    function verdict() {
      const g = sum('give', val), t = sum('get', val);
      const box = $('#verdict'), vd = box.querySelector('.vd'), vt = box.querySelector('.vt');
      box.className = 'verdict';
      if (!state.give.length || !state.get.length) { vd.textContent = '?'; vt.textContent = 'Add blobs to both sides'; return; }
      const d = (t - g) / Math.max(t, g);
      const pct = g > 0 ? Math.round((t / g - 1) * 100) : 0;
      const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '');
      const pctTxt = `${sign(pct)}${Math.abs(pct)}%`;
      const di = sum('get', inc) - sum('give', inc);
      const incTxt = `Income ${sign(di)}${money(Math.abs(di))}/s`;
      if (Math.abs(d) <= T.fair) { box.classList.add('vd-f'); vd.textContent = 'F'; vt.textContent = `Fair: ${sign(t - g)}${money(Math.abs(t - g))} (${pctTxt}). ${incTxt}`; }
      else if (d > 0) { box.classList.add('vd-w'); vd.textContent = 'W'; vt.textContent = `Win: you get ${money(t - g)} more (${pctTxt}). ${incTxt}`; }
      else { box.classList.add('vd-l'); vd.textContent = 'L'; vt.textContent = `Loss: you get ${money(g - t)} less (${pctTxt}). ${incTxt}`; }
    }
    function render() {
      for (const side of SIDES) {
        $('#' + side + '-items').innerHTML = state[side].length ? state[side].map((x, k) => item(side, x, k)).join('') : '<li class="t-empty">No blobs yet</li>';
        $('#' + side + '-v').textContent = money(sum(side, val));
        $('#' + side + '-i').textContent = money(sum(side, inc)) + '/s';
        const add = $(`.t-add[data-side="${side}"]`);
        add.disabled = state[side].length >= T.max;
        add.textContent = add.disabled ? `Max ${T.max} blobs` : '+ Add a blob';
      }
      verdict();
      const h = serialize();
      history.replaceState(null, '', location.pathname + location.search + (h ? '#' + h : ''));
    }
    const grid = $('.trade-grid');
    grid.addEventListener('change', (e) => {
      const t = e.target; if (!t.dataset.f) return;
      const x = state[t.dataset.side][+t.dataset.k]; if (!x) return;
      if (t.dataset.f === 'm') x.m = t.value; else x.l = +t.value;
      render();
    });
    grid.addEventListener('click', (e) => {
      const x = e.target.closest('.ti-x');
      if (x) { state[x.dataset.side].splice(+x.dataset.k, 1); render(); return; }
      const add = e.target.closest('.t-add');
      if (add && !add.disabled) openPicker(add.dataset.side);
    });
    // picker
    const picker = $('#picker'), pq = $('#pk-q'), list = $('#pk-list');
    let pickSide = 'give';
    list.innerHTML = T.blobs.map((b) => { const r = T.rarities[b.r];
      return `<button type="button" class="pk-b" data-id="${esc(b.id)}" style="--rc:${r.a}"><img src="${esc(b.img)}" alt="" width="44" height="44" loading="lazy" decoding="async">`
        + `<span class="pk-n">${esc(b.n)}<span class="pill" style="--pc:${r.c};--pt:${r.t};--pa:${r.a}">${esc(b.r)}</span></span><b class="v">${money(b.p)}</b></button>`; }).join('');
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    pq.addEventListener('input', () => { const q = norm(pq.value); for (const b of $$('.pk-b', list)) b.hidden = !!q && !norm(byId[b.dataset.id].n + byId[b.dataset.id].r).includes(q); });
    function openPicker(side) {
      pickSide = side; pq.value = ''; for (const b of $$('.pk-b', list)) b.hidden = false;
      $('#pk-h').textContent = side === 'give' ? 'Add a blob you give' : 'Add a blob you get';
      if (picker.showModal) picker.showModal(); else picker.setAttribute('open', '');
      list.scrollTop = 0;
      if (matchMedia('(hover: hover)').matches) pq.focus();
    }
    list.addEventListener('click', (e) => {
      const b = e.target.closest('.pk-b'); if (!b) return;
      if (state[pickSide].length < T.max) state[pickSide].push({ id: b.dataset.id, m: 'None', l: 1 });
      picker.close(); render();
    });
    $('#pk-close').addEventListener('click', () => picker.close());
    picker.addEventListener('click', (e) => { if (e.target === picker) picker.close(); });
    $('#t-swap').addEventListener('click', () => { [state.give, state.get] = [state.get, state.give]; render(); });
    $('#t-clear').addEventListener('click', () => { state.give = []; state.get = []; render(); });
    $('#t-share').addEventListener('click', async (e) => {
      const btn = e.currentTarget; const ok = await copyText(location.href);
      const old = btn.lastChild.textContent; btn.lastChild.textContent = ok ? 'Link copied!' : 'Copy the address bar';
      setTimeout(() => { btn.lastChild.textContent = old; }, 1600);
    });
    window.addEventListener('hashchange', () => { parse(); render(); });
    parse(); render();
  }

  // ---------------------------------------------------------- 🧮 rebirth planner (guide.html)
  // "2.5M" / "1,200" / "$40k" -> a number (NaN = not one)
  function parseAmount(s) {
    const m = String(s || '').trim().replace(/[$,\s]/g, '').match(/^(\d*\.?\d+)([a-z]*)$/i);
    if (!m) return NaN;
    const i = SUF.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
    return i < 0 ? NaN : parseFloat(m[1]) * Math.pow(1000, i);
  }
  function setupRebirth(R) {
    const n = $('#rb-n'), cash = $('#rb-cash'), inc = $('#rb-inc'), out = $('#rb-out');
    if (!n || !out) return;
    function dur(sec) {
      if (sec < 90) return `${Math.ceil(sec)} seconds`;
      if (sec < 5400) return `${Math.ceil(sec / 60)} minutes`;
      if (sec < 172800) return `${(Math.round(sec / 360) / 10)} hours`;
      return `${Math.round(sec / 8640) / 10} days`;
    }
    function calc() {
      const r = +n.value || 0;
      const cost = R.costs[r];
      if (cost === undefined) { out.textContent = 'You have every rebirth!'; return; }
      const have = parseAmount(cash.value || '0'), per = parseAmount(inc.value || '0');
      const bonus = Math.round(R.bonus * (r + 1) * 100);
      let text = `Rebirth ${r + 1} costs ${money(cost)} and takes you to +${bonus}% income forever. `;
      if (isNaN(have) || isNaN(per)) { out.textContent = text + 'Type numbers like 2.5M or 40K.'; return; }
      const need = cost - have;
      if (need <= 0) text += 'You can rebirth NOW!';
      else if (per <= 0) text += `You need ${money(need)} more. Type your income to see how long that takes.`;
      else text += `You need ${money(need)} more: about ${dur(need / per)} at ${money(per)}/s (half that with a 2x cash boost).`;
      out.textContent = text;
    }
    for (const el of [n, cash, inc]) el.addEventListener('input', calc);
    calc();
  }

  // ---------------------------------------------------------- 🥚 egg simulator (eggs.html)
  function setupEggs(E) {
    const tabs = $$('.es-tab');
    if (!tabs.length) return;
    const R = E.rarities, B = E.blobs, M = E.muts;
    const byId = Object.fromEntries(E.eggs.map((e) => [e.id, e]));
    let egg = null, busy = false;
    let st = { opened: 0, spent: 0, counts: {}, best: [], pity: {} };
    try { const saved = JSON.parse(store.get('eggsim') || 'null'); if (saved && saved.counts) st = Object.assign(st, saved); } catch (e) { /* fresh */ }
    const save = () => store.set('eggsim', JSON.stringify(st));
    const pick = (list, wkey) => {
      let total = 0; for (const x of list) total += x[wkey];
      let r = Math.random() * total;
      for (const x of list) { r -= x[wkey]; if (r < 0) return x; }
      return list[list.length - 1];
    };
    const isTarget = (e, id) => (e.t.id ? id === e.t.id : B[id].r === e.t.r);
    function roll(e) {
      let id;
      if (e.e[0].id) id = pick(e.e, 'w').id;
      else { const r = pick(e.e, 'w'); id = r.b[Math.floor(Math.random() * r.b.length)]; }
      // 🍀 Lucky Meter (EggService): the pity target is guaranteed once the meter is full
      const count = (st.pity[e.id] || 0) + 1;
      let forced = false;
      if (e.pity && count >= e.pity && !isTarget(e, id)) {
        if (e.t.id) id = e.t.id;
        else { const row = e.e.find((x) => x.r === e.t.r); if (row) id = row.b[Math.floor(Math.random() * row.b.length)]; }
        forced = true;
      }
      st.pity[e.id] = isTarget(e, id) ? 0 : count;
      let mut = 'None';
      for (const m of e.m) { if (Math.random() < m.c) { mut = m.n; break; } }
      return { id, mut, forced, v: B[id].v * (M[mut] ? M[mut].m : 1) };
    }
    // rarest first: the rarity, plus a rare mutation counts like extra rarity tiers (a Rainbow Epic beats a plain Legendary)
    const rank = (p) => R[B[p.id].r].o + Math.log2(M[p.mut] ? M[p.mut].m : 1) * 0.8;
    function card(p, big) {
      const b = B[p.id], r = R[b.r], m = M[p.mut];
      const mut = p.mut !== 'None' && m ? `<span class="es-mut" style="--mc:${m.c}">${esc(m.ic || '')} ${esc(m.l)}</span>` : '';
      return `<a class="es-card${big ? ' big' : ''}" href="${esc(b.u)}" style="--rc:${r.a}">
<img src="${esc(b.img)}" alt="" loading="lazy" width="${big ? 140 : 64}" height="${big ? 140 : 64}" onerror="this.style.visibility='hidden'">
<span class="es-cn">${esc(b.n)}</span>${mut}<span class="es-cr" style="color:${r.a}">${esc(b.r)}${p.forced ? ' 🍀' : ''}</span><b class="es-cv">${money(p.v)}</b></a>`;
    }
    function render() {
      const e = egg;
      if (e) {
        const left = e.pity ? e.pity - (st.pity[e.id] || 0) : 0;
        const tname = e.t.id ? B[e.t.id].n : e.t.r;
        $('#es-meter').textContent = e.pity ? `🍀 Lucky Meter: a ${tname} is guaranteed within ${left} more hatch${left === 1 ? '' : 'es'}` : '';
        $('#es-perks').textContent = e.perks.length ? `This egg makes ${e.perks.join(', ')} mutations likelier` : '';
      }
      const rows = Object.keys(st.counts).sort((a, b) => R[b].o - R[a].o);
      $('#es-sum').textContent = st.opened ? `${commas(st.opened)} eggs opened • ${money(st.spent)} of in-game cash` : 'Nothing opened yet.';
      $('#es-bars').innerHTML = rows.map((r) => {
        const n = st.counts[r], pc = st.opened ? (n / st.opened) * 100 : 0;
        return `<li style="--rc:${R[r] ? R[r].a : '#fff'}"><span>${esc(r)}</span><i style="width:${Math.max(2, pc).toFixed(1)}%"></i><b>${commas(n)}</b></li>`;
      }).join('');
      $('#es-best').innerHTML = st.best.length ? st.best.map((p) => `<li>${card(p, false)}</li>`).join('') : '<li class="t-empty">Your rarest pulls show here</li>';
    }
    function select(id) {
      egg = byId[id];
      for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.egg === id));
      const stage = $('.es-stage');
      stage.style.setProperty('--ec', egg.c); stage.style.setProperty('--ea', egg.a);
      $('#es-name').textContent = egg.n;
      $('#es-where').textContent = `${money(egg.p)} • ${egg.where}`;
      $('#es-result').innerHTML = '';
      store.set('eggsim.egg', id);
      render();
    }
    function open(n) {
      if (!egg || busy) return;
      busy = true;
      const shell = $('#es-egg');
      shell.classList.remove('cracked'); void shell.offsetWidth; shell.classList.add('shake');
      setTimeout(() => {
        const pulls = [];
        for (let i = 0; i < n; i++) pulls.push(roll(egg));
        st.opened += n; st.spent += egg.p * n;
        for (const p of pulls) {
          const r = B[p.id].r; st.counts[r] = (st.counts[r] || 0) + 1;
          st.best.push(p);
        }
        st.best.sort((a, b) => rank(b) - rank(a) || b.v - a.v);
        st.best = st.best.slice(0, 8);
        save();
        shell.classList.remove('shake'); shell.classList.add('cracked');
        const top = pulls.slice().sort((a, b) => rank(b) - rank(a) || b.v - a.v);
        $('#es-result').innerHTML = n === 1 ? card(pulls[0], true)
          : `<p class="es-got">Best of ${n}:</p><div class="es-grid">${top.slice(0, n === 10 ? 10 : 12).map((p) => card(p, false)).join('')}</div>`;
        render();
        busy = false;
      }, 650);
    }
    for (const t of tabs) t.addEventListener('click', () => select(t.dataset.egg));
    for (const b of $$('.es-open')) b.addEventListener('click', () => open(+b.dataset.n));
    $('#es-reset').addEventListener('click', () => { st = { opened: 0, spent: 0, counts: {}, best: [], pity: {} }; save(); $('#es-result').innerHTML = ''; render(); });
    $('#es-share').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget, best = st.best[0];
      const text = best
        ? `I hatched a ${best.mut !== 'None' ? M[best.mut].l + ' ' : ''}${B[best.id].n} (${B[best.id].r}) in ${commas(st.opened)} eggs on the Steal a Blob egg simulator! ${location.origin}${location.pathname}`
        : `${location.origin}${location.pathname}`;
      const ok = await copyText(text);
      const old = btn.lastChild.textContent; btn.lastChild.textContent = ok ? 'Copied!' : 'Copy failed';
      setTimeout(() => { btn.lastChild.textContent = old; }, 1600);
    });
    const first = store.get('eggsim.egg');
    select(byId[first] ? first : E.eggs[Math.min(1, E.eggs.length - 1)].id);
  }

  // ---------------------------------------------------------- 🔮 which blob are you? (quiz.html)
  function setupQuiz(Q) {
    const qEl = $('#qz-q'), ans = $('#qz-answers'), step = $('#qz-step'), fill = $('#qz-fill');
    if (!qEl || !ans) return;
    const n = Q.traits.length;
    let i = 0, score = new Array(n).fill(0), picks = [];
    function ask() {
      const q = Q.questions[i];
      step.textContent = `Question ${i + 1} of ${Q.questions.length}`;
      fill.style.width = `${(i / Q.questions.length) * 100}%`;
      qEl.textContent = q.q;
      ans.innerHTML = q.a.map((a, k) => `<button type="button" class="qz-a" data-k="${k}"><span aria-hidden="true">${esc(a.i)}</span>${esc(a.t)}</button>`).join('');
      const first = ans.querySelector('button');
      if (first && i > 0) first.focus();
    }
    function result() {
      // closest blob: dot product of the answers' traits with each blob's personality; the answer pattern breaks ties
      let seed = 7;
      for (const p of picks) seed = (seed * 31 + p + 1) % 2147483647;
      let best = null, bestScore = -Infinity;
      Q.blobs.forEach((b, k) => {
        let d = 0;
        for (let t = 0; t < n; t++) d += score[t] * b.v[t];
        const norm = Math.sqrt(b.v.reduce((x, y) => x + y * y, 0)) || 1;
        const jitter = (((seed * (k + 13)) % 997) / 997) * 0.35;
        const sc = d / Math.sqrt(norm) + jitter;
        if (sc > bestScore) { bestScore = sc; best = b; }
      });
      let top = 0;
      for (let t = 1; t < n; t++) if (score[t] > score[top]) top = t;
      const r = Q.rarities[best.r] || { a: '#fff' };
      $('#qz').hidden = true;
      const res = $('#qz-result');
      res.hidden = false;
      $('#qz-card').href = best.u;
      $('#qz-card').style.setProperty('--rc', r.a);
      const img = $('#qz-img'); img.src = best.img; img.alt = best.n;
      $('#qz-name').textContent = best.n;
      const rar = $('#qz-rar'); rar.textContent = best.r; rar.style.color = r.a;
      $('#qz-line').textContent = Q.lines[Q.traits[top]] || '';
      $('#qz-desc').textContent = best.d ? `“${best.d}”` : '';
      res.dataset.blob = best.n; res.dataset.rarity = best.r;
      res.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    ans.addEventListener('click', (e) => {
      const btn = e.target.closest('.qz-a');
      if (!btn) return;
      const k = +btn.dataset.k, a = Q.questions[i].a[k];
      for (let t = 0; t < n; t++) score[t] += a.w[t];
      picks.push(k);
      i += 1;
      if (i < Q.questions.length) ask(); else { fill.style.width = '100%'; result(); }
    });
    $('#qz-again').addEventListener('click', () => {
      i = 0; score = new Array(n).fill(0); picks = [];
      $('#qz-result').hidden = true; $('#qz').hidden = false; ask();
      $('#qz').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#qz-share').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget, res = $('#qz-result');
      const url = `${location.origin}${location.pathname}`;
      const text = `I'm a ${res.dataset.blob} (${res.dataset.rarity}) in Steal a Blob! Which blob are you?`;
      if (navigator.share) {
        try { await navigator.share({ title: 'Which blob are you?', text, url }); return; } catch (e) { /* cancelled: copy instead */ }
      }
      const ok = await copyText(`${text} ${url}`);
      const old = btn.lastChild.textContent; btn.lastChild.textContent = ok ? 'Copied!' : 'Copy failed';
      setTimeout(() => { btn.lastChild.textContent = old; }, 1600);
    });
    ask();
  }

  // ---------------------------------------------------------- start
  localize();
  if (DATA.live) setupHome(DATA.live);
  if (DATA.blobs) setupValues(DATA);
  if (DATA.trade) setupTrade(DATA.trade);
  if (DATA.rebirth) setupRebirth(DATA.rebirth);
  if (DATA.eggsim) setupEggs(DATA.eggsim);
  if (DATA.quiz) setupQuiz(DATA.quiz);
  tick();
  if ($('.cd[data-until]') || $('.rc[data-period]') || hourly) setInterval(tick, 1000);
})();
