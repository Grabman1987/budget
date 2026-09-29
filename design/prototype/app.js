/* Finanz-App prototype · Heute. Sample data only. */
(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Format (de-AT: 1.234,56 €, real minus) ----------
  const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const MINUS = '−';
  const r2 = (v) => Math.round(v * 100) / 100;
  function eur(v, { cents = true, sign = false } = {}) {
    const a = Math.abs(v);
    const s = cents ? nf2.format(a) : nf0.format(Math.round(a));
    const pre = v < -0.004 ? MINUS : sign && v > 0.004 ? '+' : '';
    return pre + s + ' €';
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

  // ---------- Sample data ----------
  const TODAY = 17;
  const PAYDAY = 30;
  const CLASS_LABEL = { need: 'Bedarf', want: 'Wunsch', future: 'Zukunft' };

  const env = (id, name, cls, carry, assigned, spent, goal, pinned = false) => ({ id, name, cls, carry, assigned, spent, goal, pinned });
  const state = {
    period: 'month',
    envelopes: [
      env('lebensmittel', 'Lebensmittel', 'need', 28, 572, 388, 600, true),
      env('treibstoff', 'Treibstoff', 'need', 0, 140, 152.4, 140, true),
      env('haushalt', 'Haushalt', 'need', 0, 120, 35.5, 120),
      env('gesundheit', 'Gesundheit', 'need', 80, 40, 0, 40),
      env('oeffis', 'Öffis', 'need', 0, 45, 0, 45),
      env('nebenkosten', 'Nebenkosten', 'need', 0, 150, 0, 150),
      env('versicherungen', 'Versicherungen', 'need', 160.72, 40.18, 0, 40.18),
      env('kleidung', 'Kleidung', 'need', 200, 50, 30, 50),
      env('lieferdienste', 'Lieferdienste', 'want', 0, 80, 62, 80, true),
      env('freizeit', 'Freizeit', 'want', 0, 120, 56, 120, true),
      env('essen', 'Essen gehen', 'want', 0, 150, 121, 150, true),
      env('hobby', 'Hobby', 'want', 46.59, 50, 0, 50),
      env('streaming', 'Streaming', 'want', 0, 17.99, 0, 17.99),
      env('reisen', 'Reisen', 'want', 100, 50, 0, 50),
      env('geschenke', 'Geschenke', 'want', 17.01, 20, 0, 20),
      env('notgroschen', 'Notgroschen', 'future', 3150, 250, 0, 250),
      env('investieren', 'Investieren', 'future', 0, 400, 0, 400),
    ],
    openBills: [
      { date: '20.09.', name: 'Streaming-Abo', acct: 'Kreditkarte', amt: 17.99 },
      { date: '22.09.', name: 'Mobilfunk', acct: 'Girokonto', amt: 25 },
      { date: '25.09.', name: 'Strom', acct: 'Girokonto', amt: 105 },
    ],
    upcoming: [
      { date: '20.09.', name: 'Streaming-Abo', sub: 'Kreditkarte', amt: -17.99, st: 'erwartet' },
      { date: '22.09.', name: 'Mobilfunk', sub: 'Girokonto', amt: -25, st: 'erwartet' },
      { date: '25.09.', name: 'Strom', sub: 'Girokonto', amt: -105, st: 'erwartet' },
      { date: '30.09.', name: 'Gehalt', sub: 'Girokonto', amt: 3812, st: 'erwartet' },
      { date: '30.09.', name: 'Beitrag Miete', sub: 'Kontakt M. Muster', amt: 800, st: 'erwartet' },
      { date: '01.10.', name: 'Miete', sub: 'Girokonto', amt: -890, st: 'gedeckt' },
    ],
    checks: [
      { name: 'Notgroschen', val: '2,4 von 3 Monaten Bedarf', st: 'bad' },
      { name: 'Spekulativer Anteil', val: '14,2 % · Ziel ≤ 10 %', st: 'bad' },
      { name: '50/30/20', val: '48 / 31 / 21 % · Ziel 50 / 30 / 20', st: 'warn' },
      { name: 'Geldalter', val: '18 Tage · Ziel 30', st: 'warn' },
      { name: 'Schuldenquote', val: '10 % · Ziel ≤ 30 %', st: 'ok' },
      { name: 'Tiefpunkt-Prognose', val: '≥ 0 € in den nächsten 90 Tagen', st: 'ok' },
    ],
    ruleSummary: { ok: 11, warn: 3, bad: 2 },
    netWorth: { series: [63606,  71456,  73620,  74280,  76400,  77489,  77792,  80115,  85498,  85575,  85744,  84730], liquid: 9356, invested: 88000, debt: -12626 },
    tx: [
      { date: '17.09.', payee: 'Supermarkt', cat: 'Lebensmittel', note: 'Anteil für Kontakt', amt: -84.2, st: 'vorgemerkt' },
      { date: '16.09.', payee: 'Tankstelle', cat: 'Treibstoff', amt: -58.1, st: 'bestätigt' },
      { date: '16.09.', payee: 'Lieferdienst', cat: 'Lieferdienste', amt: -24.9, st: 'bestätigt' },
      { date: '15.09.', payee: 'Kino', cat: 'Freizeit', amt: -26, st: 'bestätigt' },
    ],
    uncat: [
      { date: '16.09.', payee: 'Online-Händler', amt: 39.9, sug: 'haushalt' },
      { date: '15.09.', payee: 'Bäckerei', amt: 6.4, sug: 'lebensmittel' },
      { date: '14.09.', payee: 'Apotheke', amt: 12.35, sug: 'gesundheit' },
      { date: '13.09.', payee: 'Buchhandlung', amt: 18.9, sug: 'hobby' },
    ],
    p2p: { value: 4215.8, age: 34 },
    revisions: [
      { id: 'A', kind: 'cover', urgent: true },
      { id: 'B', kind: 'uncat' },
      { id: 'C', kind: 'p2p' },
    ],
    inboxOther: 3,
    paceExtra: 0,
  };

  // Girokonto balance: actual 1.–17., forecast 18.–29., salary on the 30th.
  const balance = [null, 2710, 2410, 1998, 1960, 1935, 1880, 1870, 1810, 1795, 1760, 1742, 1700, 1690, 1655, 1580, 1530, 1497,
    1462, 1425, 1390, 1352, 1290, 1255, 1220, 1080, 1045, 690, 650, 612];
  const SALARY = 3812;

  // Pace model: fixed costs on due day, variable rest linear.
  const LIMIT = 3300;
  const FIXED = { 1: 890, 3: 412, 15: 60, 20: 17.99, 22: 25, 25: 105 };
  const FIXED_TOTAL = Object.values(FIXED).reduce((a, b) => a + b, 0);
  const VAR_PLAN = LIMIT - FIXED_TOTAL;
  const VAR_ACTUAL = [0, 22, 48, 15, 61, 30, 9, 72, 25, 40, 18, 55, 33, 47, 20, 64, 58, 73.34];
  const fixedTo = (d) => Object.entries(FIXED).reduce((s, [k, v]) => s + (+k <= d ? v : 0), 0);
  const plan = (d) => fixedTo(d) + (VAR_PLAN * d) / 30;
  const actualBase = (d) => fixedTo(Math.min(d, TODAY)) + VAR_ACTUAL.slice(0, Math.min(d, TODAY) + 1).reduce((a, b) => a + b, 0);
  const actual = (d) => actualBase(d) + (d >= TODAY ? state.paceExtra : 0);
  const prev = (d) => fixedTo(d) + 1670 * Math.pow(d / 30, 1.08) + (d > 9 ? 40 : 0);

  // ---------- Derived ----------
  const avail = (e) => r2(e.carry + e.assigned - e.spent);
  const byId = (id) => state.envelopes.find((e) => e.id === id);
  const sumClass = (cls) => r2(state.envelopes.filter((e) => e.cls === cls).reduce((s, e) => s + avail(e), 0));
  const openSum = () => r2(state.openBills.reduce((s, b) => s + b.amt, 0));
  const freeUntilPayday = () => r2(sumClass('need') + sumClass('want') - openSum());
  const inboxCount = () => state.inboxOther + state.revisions.reduce((s, r) => s + (r.kind === 'uncat' ? state.uncat.length : 1), 0);

  // ---------- SVG helpers ----------
  function s(tag, attrs = {}, parent) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
  }
  function clear(svg) {
    [...svg.childNodes].forEach((n) => { if (n.nodeName !== 'desc') n.remove(); });
  }
  function plot(path, cls, animate) {
    if (!animate || reduceMotion) return;
    const len = path.getTotalLength();
    path.style.setProperty('--len', len);
    path.style.strokeDasharray = path.classList.contains('l-forecast') || path.classList.contains('l-plan') || path.classList.contains('l-prev') ? '' : `${len}`;
    if (!path.style.strokeDasharray) {
      // dashed lines: reveal with a clip instead of dash animation
      return;
    }
    path.classList.add('draw');
    if (cls) path.classList.add(cls);
    path.addEventListener('animationend', () => { path.style.strokeDasharray = ''; path.classList.remove('draw'); }, { once: true });
  }
  function revealClip(svg, id, x0, x1, y0, y1, animate, delay = 0) {
    const defs = svg.querySelector('defs') || s('defs', {}, svg);
    const cp = s('clipPath', { id }, defs);
    const rect = s('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, cp);
    if (animate && !reduceMotion) {
      rect.setAttribute('width', 0);
      requestAnimationFrame(() => {
        rect.animate([{ width: '0px' }, { width: `${x1 - x0}px` }], { duration: 1000, delay, easing: 'cubic-bezier(0.16,1,0.3,1)', fill: 'forwards' })
          .finished.then(() => rect.setAttribute('width', x1 - x0)).catch(() => rect.setAttribute('width', x1 - x0));
      });
    }
    return `url(#${id})`;
  }
  function tick(g, x, y, size = 6) {
    s('path', { d: `M${x - size / 2} ${y + size / 2} L${x + size / 2} ${y - size / 2}`, class: 'l-dim', 'stroke-width': 1.6 }, g);
  }
  function hatchDefs(svg, prefix) {
    const defs = svg.querySelector('defs') || s('defs', {}, svg);
    const want = s('pattern', { id: `${prefix}-want`, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-45)' }, defs);
    s('rect', { width: 2, height: 5, fill: 'var(--want)' }, want);
    const bound = s('pattern', { id: `${prefix}-bound`, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-45)' }, defs);
    s('rect', { width: 1.5, height: 5, fill: 'var(--line-2)' }, bound);
  }

  // ---------- Leitmaß: free until payday on the balance chart ----------
  function renderLead(animate) {
    const svg = $('#leadChart');
    clear(svg);
    const W = svg.clientWidth, H = svg.clientHeight;
    if (!W) return;
    const m = W < 640;
    const g = m
      ? { top: 104, bottom: H - 26, fig: 40, figY: 46, dimY: 64, noteY: 82, padL: 40 }
      : { top: 140, bottom: H - 30, fig: 68, figY: 78, dimY: 100, noteY: 120, padL: 48 };
    const padR = 10;
    const [d0, d1] = state.period === 'month' ? [1, 30] : [TODAY, 30];
    const x = (d) => g.padL + ((d - d0) / (d1 - d0)) * (W - g.padL - padR);
    const YMAX = 3500;
    const y = (v) => g.bottom - (v / YMAX) * (g.bottom - g.top);

    // graticule, faint, only behind the chart
    for (const v of [1000, 2000, 3000]) {
      s('line', { x1: g.padL, x2: W - padR, y1: y(v), y2: y(v), class: 'graticule' }, svg);
      const t = s('text', { x: g.padL - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'svg-label' }, svg);
      t.textContent = nf0.format(v);
    }
    s('line', { x1: g.padL, x2: W - padR, y1: y(0), y2: y(0), class: 'axis' }, svg);
    const z = s('text', { x: g.padL - 8, y: y(0) + 4, 'text-anchor': 'end', class: 'svg-label' }, svg);
    z.textContent = '0 €';

    // x labels
    const days = state.period === 'month' ? [1, 8, 15, 22] : [18, 21, 24, 27];
    for (const d of days) {
      if (Math.abs(d - TODAY) < (m ? 4 : 2)) continue;
      const t = s('text', { x: x(d), y: g.bottom + 18, 'text-anchor': 'middle', class: 'svg-label' }, svg);
      t.textContent = `${d}.`;
    }
    const tp = s('text', { x: x(PAYDAY), y: g.bottom + 18, 'text-anchor': 'end', class: 'svg-label-line' }, svg);
    tp.textContent = 'Gehalt 30.';
    if (TODAY >= d0) {
      const tt = s('text', { x: x(TODAY), y: g.bottom + 18, 'text-anchor': 'middle', class: 'svg-label-line' }, svg);
      tt.textContent = 'heute 17.';
    }

    // today marker
    s('line', { x1: x(TODAY), x2: x(TODAY), y1: g.dimY + 6, y2: g.bottom, class: 'l-today' }, svg);

    // actual (solid) and forecast (dashed)
    const pts = (a, b) => { const p = []; for (let d = Math.max(a, d0); d <= b; d++) p.push(`${x(d).toFixed(1)},${y(balance[d]).toFixed(1)}`); return p; };
    if (TODAY > d0) {
      const pa = s('path', { d: 'M' + pts(1, TODAY).join(' L'), class: 'l-actual' }, svg);
      plot(pa, null, animate);
    }
    const clipF = revealClip(svg, 'clip-fc', x(TODAY) - 2, W, 0, H, animate, 500);
    s('path', { d: 'M' + pts(TODAY, 29).join(' L'), class: 'l-forecast', 'clip-path': clipF }, svg);

    // salary jump
    const jg = s('g', { 'clip-path': clipF }, svg);
    s('path', { d: `M${x(29)},${y(balance[29])} L${x(30)},${y(balance[29])} L${x(30)},${g.top + 6}`, class: 'l-forecast' }, jg);
    s('path', { d: `M${x(30) - 4},${g.top + 13} L${x(30)},${g.top + 5} L${x(30) + 4},${g.top + 13}`, class: 'l-dim' }, jg);
    const js = s('text', { x: x(30) - 8, y: g.top + 14, 'text-anchor': 'end', class: 'svg-label-line' }, jg);
    js.textContent = `+${nf0.format(SALARY)} € Gehalt`;

    // elevation mark at the forecast low (charts only)
    const lx = x(29), ly = y(balance[29]);
    const kg = s('g', { class: 'fade-in' }, svg);
    const shelf = ly - (m ? 40 : 48);
    const kt = s('text', { x: lx - 4, y: shelf - 6, 'text-anchor': 'end', class: 'svg-label-strong' }, kg);
    kt.textContent = m ? `Tiefpunkt ${eur(balance[29], { cents: false })}` : `Tiefpunkt ${eur(balance[29], { cents: false })} · 29.09.`;
    const kw = kt.getComputedTextLength();
    s('path', { d: `M${lx - 6},${ly - 12} L${lx + 6},${ly - 12} L${lx},${ly - 1.5} Z`, class: 'kote' }, kg);
    s('path', { d: `M${lx},${ly - 12} L${lx},${shelf} L${lx - kw - 8},${shelf}`, class: 'l-dim', 'stroke-width': 1 }, kg);

    // today dot
    s('circle', { cx: x(TODAY), cy: y(balance[TODAY]), r: 4, class: 'dot-actual' }, svg);

    // dimension line today -> payday
    const x0 = x(TODAY), x1 = x(PAYDAY);
    const dg = s('g', {}, svg);
    s('line', { x1: x1, x2: x1, y1: g.dimY - 8, y2: g.bottom, class: 'l-ext' }, dg);
    s('line', { x1: x0, x2: x0, y1: g.dimY - 8, y2: g.dimY + 6, class: 'l-dim', 'stroke-width': 1 }, dg);
    const dl = s('path', { d: `M${x0 - 10},${g.dimY} L${x1 + 6},${g.dimY}`, class: 'l-dim' }, dg);
    tick(dg, x0, g.dimY, 9);
    tick(dg, x1, g.dimY, 9);
    plot(dl, null, animate);

    // figure = dimension text
    const free = freeUntilPayday();
    const whole = (free < 0 ? MINUS : '') + nf0.format(Math.trunc(Math.abs(free)));
    const cents = nf2.format(Math.abs(free)).split(',')[1];
    const btn = s('g', { class: 'dim-figure-btn', role: 'button', tabindex: 0, 'aria-label': `Frei verfügbar bis Gehalt: ${eur(free)}. Maßkette zeigen`, 'aria-controls': 'chain' }, svg);
    const focus = s('rect', { class: 'dim-focus', rx: 4 }, btn);
    const t = s('text', { y: g.figY, class: 'dim-figure', 'font-size': g.fig }, btn);
    const t1 = s('tspan', {}, t); t1.textContent = whole;
    const t2 = s('tspan', { class: 'cents', 'font-size': g.fig * 0.5, fill: 'var(--ink-3)', dx: 2 }, t); t2.textContent = `,${cents} €`;
    if (free < 0) t.setAttribute('fill', 'var(--red)');
    const tw = t.getComputedTextLength();
    let cx = (x0 + x1) / 2 - tw / 2;
    cx = Math.min(Math.max(cx, g.padL), W - tw - 2);
    t.setAttribute('x', cx);
    focus.setAttribute('x', cx - 8); focus.setAttribute('y', g.figY - g.fig * 0.82);
    focus.setAttribute('width', tw + 16); focus.setAttribute('height', g.fig * 0.98);
    btn.addEventListener('click', toggleChain);
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleChain(); } });

    const left = PAYDAY - TODAY;
    const note = s('text', { x: (x0 + x1) / 2, y: g.noteY, 'text-anchor': 'middle', class: 'svg-label-line' }, svg);
    note.textContent = m ? `${left} Tage bis Gehalt` : `${left} Tage bis Gehalt · Mi 30.09.`;
    if (m) note.setAttribute('x', Math.min((x0 + x1) / 2, W - 70));

    $('#leadDesc').textContent = `Frei verfügbar bis Gehalt ${eur(free)}. Girokonto: Verlauf bis heute ${eur(balance[TODAY])}, Prognose mit Tiefpunkt ${eur(balance[29])} am 29.09., danach Gehalt am 30.09.`;
  }

  // ---------- Maßkette (one component for every dimension chain) ----------
  // cfg: { prefix, parts: [{ key, label, value, fill }], minus: { key, label, value }, result: { label, value }, onSeg, cents }
  function drawChain(svg, cfg, animate) {
    clear(svg);
    const W = svg.clientWidth;
    if (!W) return;
    hatchDefs(svg, cfg.prefix);
    const total = cfg.parts.reduce((a, p) => a + p.value, 0);
    const result = cfg.result.value;
    const L = 2, R = W - 2;
    const X = (v) => L + (Math.max(0, v) / Math.max(total, 1)) * (R - L);
    const small = W < 520;
    const money = (v) => eur(v, { cents: cfg.cents !== false && !small });
    const barY = 44, barH = 14, labelY = 24;
    const bindSeg = (g, key) => {
      g.addEventListener('click', () => cfg.onSeg(key));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cfg.onSeg(key); } });
    };

    let acc = 0;
    cfg.parts.forEach((p, i) => {
      const x0 = X(acc), x1 = X(acc + p.value);
      acc += p.value;
      const g = s('g', { class: 'chain-seg', role: 'button', tabindex: 0, 'aria-label': `${p.label} ${eur(p.value)}, Einzelposten zeigen` }, svg);
      s('rect', { x: x0, y: barY, width: Math.max(1, x1 - x0), height: barH, class: 'seg-fill', fill: p.fill }, g);
      s('rect', { x: x0, y: barY, width: Math.max(1, x1 - x0), height: barH, fill: 'none', stroke: 'var(--line)', 'stroke-width': 1 }, g);
      s('line', { x1: x0, x2: x1, y1: labelY, y2: labelY, class: 'l-dim' }, g);
      tick(g, x0, labelY); tick(g, x1, labelY);
      s('line', { x1: x0, x2: x0, y1: labelY - 5, y2: barY, class: 'l-ext' }, g);
      s('line', { x1: x1, x2: x1, y1: labelY - 5, y2: barY, class: 'l-ext' }, g);
      const tx = s('text', { x: (x0 + x1) / 2, y: labelY - 7, 'text-anchor': 'middle', class: 'svg-label-strong' }, g);
      tx.textContent = `${p.label} ${money(p.value)}`;
      const tw = tx.getComputedTextLength();
      if (tw > x1 - x0 - 4) {
        if (i === 0) { tx.setAttribute('text-anchor', 'start'); tx.setAttribute('x', x0); }
        else { tx.setAttribute('text-anchor', 'end'); tx.setAttribute('x', x1); }
      }
      bindSeg(g, p.key);
    });

    // subtracted part, hatched as bound, under the bar
    const m = cfg.minus;
    const bg = s('g', { class: 'chain-seg', role: 'button', tabindex: 0, 'aria-label': `${m.label} ${eur(-m.value)}, Einzelposten zeigen` }, svg);
    const outline = m.style === 'outline';
    s('rect', { x: X(result), y: barY + barH + 6, width: X(total) - X(result), height: 12, fill: outline ? 'transparent' : `url(#${cfg.prefix}-bound)`, class: 'seg-fill' }, bg);
    s('rect', { x: X(result), y: barY + barH + 6, width: X(total) - X(result), height: 12, fill: 'none', stroke: outline ? 'var(--line)' : 'var(--line-2)', 'stroke-dasharray': outline ? '5 3' : null }, bg);
    const bt = s('text', { x: X(result) - 8, y: barY + barH + 16, 'text-anchor': 'end', class: 'svg-label-line' }, bg);
    bt.textContent = `${m.label} ${money(-m.value)}`;
    bindSeg(bg, m.key);

    // result dimension
    const ry = 124;
    s('line', { x1: X(0), x2: X(0), y1: barY + barH, y2: ry + 6, class: 'l-ext' }, svg);
    s('line', { x1: X(result), x2: X(result), y1: barY + barH + 18, y2: ry + 6, class: 'l-ext' }, svg);
    const rl = s('path', { d: `M${X(0)},${ry} L${X(result)},${ry}`, class: 'l-dim', 'stroke-width': 1.6 }, svg);
    tick(svg, X(0), ry, 9); tick(svg, X(result), ry, 9);
    const rt = s('text', { x: (X(0) + X(result)) / 2, y: ry - 8, 'text-anchor': 'middle', class: 'svg-label-strong', 'font-size': 14 }, svg);
    rt.textContent = `${cfg.result.label} ${eur(result, { cents: cfg.cents !== false })}`;
    plot(rl, null, animate);
  }

  function renderChain(animate) {
    const need = sumClass('need'), want = sumClass('want');
    drawChain($('#chainSvg'), {
      prefix: 'ch',
      parts: [
        { key: 'need', label: 'Bedarf', value: need, fill: 'var(--need)' },
        { key: 'want', label: 'Wunsch', value: want, fill: 'url(#ch-want)' },
      ],
      minus: { key: 'open', label: 'offen bis Gehalt', value: openSum() },
      result: { label: '= frei verfügbar', value: freeUntilPayday() },
      onSeg: openList,
    }, animate);
  }

  function toggleChain(force) {
    const chain = $('#chain');
    const open = typeof force === 'boolean' ? force : !chain.classList.contains('is-open');
    chain.classList.toggle('is-open', open);
    $('#chainBtn').setAttribute('aria-expanded', open);
    $('#chainBtn').textContent = open ? 'Maßkette ausblenden' : 'Maßkette zeigen';
    if (open) renderChain(true);
  }

  // ---------- Pace ----------
  function renderPace(animate) {
    const svg = $('#paceChart');
    clear(svg);
    const W = svg.clientWidth, H = svg.clientHeight;
    if (!W) return;
    const m = W < 520;
    const padL = 40, padR = m ? 56 : 92, top = 14, bottom = H - 24;
    const x = (d) => padL + (d / 30) * (W - padL - padR);
    const YMAX = 3600;
    const y = (v) => bottom - (v / YMAX) * (bottom - top);

    for (const v of [1000, 2000, 3000]) {
      s('line', { x1: padL, x2: W - padR, y1: y(v), y2: y(v), class: 'graticule' }, svg);
      const t = s('text', { x: padL - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'svg-label' }, svg);
      t.textContent = nf0.format(v);
    }
    s('line', { x1: padL, x2: W - padR, y1: y(0), y2: y(0), class: 'axis' }, svg);
    // limit
    s('line', { x1: padL, x2: W - padR, y1: y(LIMIT), y2: y(LIMIT), class: 'axis' }, svg);
    const lt = s('text', { x: W - padR + 6, y: y(LIMIT) + 4, class: 'svg-label' }, svg);
    lt.textContent = m ? 'Limit' : `Limit ${nf0.format(LIMIT)} €`;

    for (const d of [1, 8, 15, 22, 30]) {
      if (Math.abs(d - TODAY) < (m ? 4 : 2)) continue;
      const t = s('text', { x: x(d), y: bottom + 17, 'text-anchor': 'middle', class: 'svg-label' }, svg);
      t.textContent = `${d}.`;
    }
    const tt = s('text', { x: x(TODAY), y: bottom + 17, 'text-anchor': 'middle', class: 'svg-label-line' }, svg);
    tt.textContent = 'heute';
    s('line', { x1: x(TODAY), x2: x(TODAY), y1: top, y2: bottom, class: 'l-today' }, svg);

    // previous month (dash-dot) and plan (dashed): revealed left to right
    const clip = revealClip(svg, 'clip-pace', padL, W, 0, H, animate, 150);
    const prevPts = []; for (let d = 0; d <= 30; d++) prevPts.push(`${x(d)},${y(prev(d))}`);
    s('path', { d: 'M' + prevPts.join(' L'), class: 'l-prev', 'clip-path': clip }, svg);
    let pd = `M${x(0)},${y(0)}`;
    for (let d = 1; d <= 30; d++) {
      const before = plan(d - 1) + VAR_PLAN / 30;
      pd += ` L${x(d)},${y(before)}`;
      if (FIXED[d]) pd += ` L${x(d)},${y(plan(d))}`;
    }
    s('path', { d: pd, class: 'l-plan', 'clip-path': clip }, svg);

    // actual as step line
    let ad = `M${x(0)},${y(0)}`;
    for (let d = 1; d <= TODAY; d++) { ad += ` L${x(d)},${y(actual(d - 1))} L${x(d)},${y(actual(d))}`; }
    const ap = s('path', { d: ad, class: 'l-actual' }, svg);
    plot(ap, null, animate);

    // forecast
    const a17 = actual(TODAY);
    const rate = (a17 - fixedTo(TODAY)) / TODAY;
    const fEnd = a17 + (FIXED_TOTAL - fixedTo(TODAY)) + rate * (30 - TODAY);
    s('path', { d: `M${x(TODAY)},${y(a17)} L${x(30)},${y(fEnd)}`, class: 'l-forecast', 'clip-path': clip }, svg);
    s('circle', { cx: x(30), cy: y(fEnd), r: 3.5, class: 'dot-actual' }, svg);
    const ft = s('text', { x: x(30) + 8, y: y(fEnd) + 4, class: 'svg-label-strong' }, svg);
    ft.textContent = m ? nf0.format(Math.round(fEnd)) : `${nf0.format(Math.round(fEnd))} €`;
    s('circle', { cx: x(TODAY), cy: y(a17), r: 4, class: 'dot-actual' }, svg);

    // bemaßter Abstand Ist ↔ Plan
    const p17 = plan(TODAY);
    const delta = a17 - p17;
    // Dimensioned gap between actual and plan, left of today (below the plan line, above the step line)
    const dx = x(TODAY) - 12;
    const dg = s('g', { class: 'fade-in' }, svg);
    s('line', { x1: dx - 4, x2: x(TODAY), y1: y(p17), y2: y(p17), class: 'l-ext' }, dg);
    s('line', { x1: dx - 4, x2: x(TODAY), y1: y(a17), y2: y(a17), class: 'l-ext' }, dg);
    s('line', { x1: dx, x2: dx, y1: y(p17), y2: y(a17), class: 'l-dim', stroke: delta > 0 ? 'var(--red)' : undefined }, dg);
    tick(dg, dx, y(p17), 7); tick(dg, dx, y(a17), 7);
    const dt = s('text', { x: x(TODAY) + 10, y: y(a17) + 24, class: delta > 0 ? 'svg-label-red' : 'svg-label-line' }, dg);
    dt.textContent = `${eur(Math.abs(delta), { cents: false })} ${delta > 0 ? 'über' : 'unter'} Plan`;
    s('path', { d: `M${dx},${(y(p17) + y(a17)) / 2} L${dx + 4},${y(a17) + 12} L${x(TODAY) + 8},${y(a17) + 12}`, class: 'l-ext' }, dg);

    // figures + head
    const over = delta > 0;
    $('#paceDelta').innerHTML = over
      ? `<span class="neg-alert" style="display:inline-flex;gap:6px;align-items:center;font-weight:600">${icon('alert', 'icon icon-sm')}${eur(delta, { cents: false })} über Plan</span>`
      : `<span style="display:inline-flex;gap:6px;align-items:center;color:var(--line);font-weight:600">${icon('check-circle', 'icon icon-sm')}${eur(-delta, { cents: false })} unter Plan</span>`;
    $('#paceFigs').innerHTML = `
      <button class="fig fig-btn" type="button" data-pace="spent" aria-label="Ausgegeben ${eur(a17, { cents: false })}, Maßkette zeigen"><small>Ausgegeben</small><strong>${eur(a17, { cents: false })}</strong></button>
      <button class="fig fig-btn" type="button" data-pace="plan" aria-label="Plan bis heute ${eur(p17, { cents: false })}, Maßkette zeigen"><small>Plan bis heute</small><strong class="muted">${eur(p17, { cents: false })}</strong></button>
      <button class="fig fig-btn" type="button" data-pace="forecast" aria-label="Prognose Monatsende ${eur(fEnd, { cents: false })}, Maßkette zeigen"><small>Prognose Monatsende</small><strong>${eur(fEnd, { cents: false })}</strong><small>von ${eur(LIMIT, { cents: false })} Limit</small></button>`;
    $('#paceDesc').textContent = `Ausgaben September kumuliert: ${eur(a17, { cents: false })} bis heute gegen Plan ${eur(p17, { cents: false })}, Prognose Monatsende ${eur(fEnd, { cents: false })} von ${eur(LIMIT, { cents: false })}.`;
  }

  // ---------- Revisions (next steps) ----------
  const revTri = (id) => `<svg class="rev-tri" viewBox="0 0 26 24" aria-hidden="true"><path d="M13 2.5 24 21.5H2Z"/><text x="13" y="18" text-anchor="middle">${id}</text></svg>`;
  function revContent(r) {
    if (r.kind === 'cover') {
      const t = byId('treibstoff'), f = byId('freizeit');
      return { title: `${t.name} ist überzogen`, sub: `${eur(avail(t))} · aus „${f.name}“ decken (${eur(avail(f))} verfügbar)`, action: 'Decken', btn: 'btn-alert' };
    }
    if (r.kind === 'uncat') {
      const n = state.uncat.length;
      return { title: `${n} ${n === 1 ? 'Buchung' : 'Buchungen'} ohne Kategorie`, sub: 'Vorschläge vorhanden, ein Klick je Buchung', action: 'Zuordnen', btn: 'btn-ghost' };
    }
    return { title: 'P2P-Wert veraltet', sub: `zuletzt aktualisiert vor ${state.p2p.age} Tagen`, action: 'Aktualisieren', btn: 'btn-ghost' };
  }
  function renderRevs() {
    const body = $('#revBody');
    const n = inboxCount();
    $('#revCount').textContent = state.revisions.length ? `${state.revisions.length} von ${n} im Posteingang` : '';
    if (!state.revisions.length) {
      body.innerHTML = `<div class="rev-empty">${icon('check-circle')}<div><strong>Nichts zu tun.</strong><br>Der Monat hält, und im Posteingang wartet nichts Dringendes.</div></div>`;
    } else {
      body.innerHTML = `<table class="rev-table"><caption class="sr-only">Nächste Schritte als Revisionsliste</caption>
        <thead><tr><th class="tech" scope="col">Rev.</th><th class="tech" scope="col">Änderung</th><th class="tech" scope="col" style="text-align:right">Aktion</th></tr></thead><tbody>${state.revisions.map((r) => {
        const c = revContent(r);
        return `<tr class="rev-row${r.urgent ? ' is-urgent' : ''}${r === state.revisions[0] ? ' is-promoted' : ''}" data-rev="${r.id}">
          <td class="rev-mark">${revTri(r.id)}</td>
          <td class="rev-what"><strong>${esc(c.title)}</strong><span>${esc(c.sub)}</span></td>
          <td class="rev-act"><button class="btn btn-sm ${c.btn}" type="button" data-rev-act="${r.id}">${c.action}</button></td>
        </tr>`;
      }).join('')}</tbody></table>`;
    }
    // Phone: the most important step sits directly under the answer.
    const first = state.revisions[0];
    $('#mNext').innerHTML = first
      ? (() => { const c = revContent(first); return `<div class="m-next-row${first.urgent ? ' is-urgent' : ''}">${revTri(first.id)}<span class="rev-what"><strong>${esc(c.title)}</strong><span>${esc(c.sub)}</span></span><button class="btn btn-sm ${c.btn}" type="button" data-rev-act="${first.id}">${c.action}</button></div>`; })()
      : `<div class="m-next-row">${icon('check-circle')}<span class="rev-what"><strong>Nichts zu tun.</strong><span>Im Posteingang wartet nichts Dringendes.</span></span></div>`;
    const foot = document.createElement('div');
    foot.className = 'rev-foot';
    foot.innerHTML = `<span>Posteingang: ${n} offen</span><button class="btn btn-ghost btn-sm" type="button" data-open="inbox">Posteingang öffnen</button>`;
    body.appendChild(foot);
    $$('[data-inbox-count]').forEach((el) => { el.textContent = n; el.hidden = n === 0; });
    $$('[data-inbox-label]').forEach((el) => el.setAttribute('aria-label', `Posteingang, ${n} offen`));
  }

  // ---------- Details ----------
  function renderEnvelopes() {
    $('#envList').innerHTML = state.envelopes.filter((e) => e.pinned).map((e) => {
      const a = avail(e);
      const over = a < 0;
      const pct = Math.min(1, e.spent / Math.max(e.goal, 1));
      return `<li><button class="row-btn env${over ? ' is-over' : ''}" type="button" data-env="${e.id}">
        <span class="env-name">${esc(e.name)}<span class="env-class">${CLASS_LABEL[e.cls]}</span></span>
        <span class="env-avail">${eur(a)}</span>
        <span class="env-bar" aria-hidden="true"><span class="env-fill hatch-${e.cls}" style="width:${(over ? 1 : pct) * 100}%"></span></span>
        <span class="env-meta">${over ? `${eur(e.spent)} von ${eur(e.goal)} · ${eur(-a)} überzogen` : `${eur(e.spent)} von ${eur(e.goal)} ausgegeben`}</span>
      </button></li>`;
    }).join('');
  }
  function renderUpcoming() {
    $('#upList').innerHTML = state.upcoming.map((u) => `<li class="row-btn up" style="cursor:default">
      <span class="up-date">${u.date}</span>
      <span class="up-name"><strong>${esc(u.name)}</strong><span>${esc(u.sub)}</span></span>
      <span class="up-amt">${eur(u.amt, { sign: true })}<br><span class="status${u.st === 'gedeckt' ? ' ok' : ''}">${icon(u.st === 'gedeckt' ? 'check-circle' : 'clock', 'icon')}${u.st === 'gedeckt' ? 'Rücklage voll' : 'erwartet'}</span></span>
    </li>`).join('');
  }
  function renderChecks() {
    const map = { ok: ['check-circle', 'erfüllt', 'ok'], warn: ['alert', 'Warnung', ''], bad: ['alert-circle', 'verletzt', 'bad'] };
    // KPI over all rules; the list below shows the six most important.
    const r = state.ruleSummary;
    const cells = [...Array(r.ok).fill('ok'), ...Array(r.warn).fill('warn'), ...Array(r.bad).fill('bad')];
    $('#chkKpi').innerHTML = `
      <div class="chk-fig"><strong>${r.ok}</strong><span>von ${r.ok + r.warn + r.bad} Regeln erfüllt</span></div>
      <div class="chk-cells" role="img" aria-label="${r.ok} erfüllt, ${r.warn} Warnung, ${r.bad} verletzt">${cells.map((c) => `<span class="cell cell-${c}"></span>`).join('')}</div>
      <div class="chk-legend"><span><i class="cell cell-ok"></i>${r.ok} erfüllt</span><span><i class="cell cell-warn"></i>${r.warn} Warnung</span><span><i class="cell cell-bad"></i>${r.bad} verletzt</span></div>
      <div class="chk-sub tech">Die sechs wichtigsten</div>`;
    $('#chkList').innerHTML = state.checks.map((c) => {
      const [ic, label, cls] = map[c.st];
      return `<li class="row-btn chk" style="cursor:default"><span class="chk-name"><strong>${esc(c.name)}</strong><span>${esc(c.val)}</span></span>
        <span class="chk-state ${cls}">${icon(ic, 'icon icon-sm')}${label}</span></li>`;
    }).join('');
  }
  function renderNW(animate) {
    const nw = state.netWorth;
    const last = nw.series.at(-1), before = nw.series.at(-2);
    const d = last - before;
    if (!$('#nwChain')) {
      $('#nwBody').innerHTML = `
        <p class="nw-delta">${icon(d >= 0 ? 'up' : 'down', 'icon icon-sm')}${eur(d, { cents: false, sign: true })} · ${d >= 0 ? '+' : MINUS}${nf2.format(Math.abs(d / before) * 100).replace(/,?0+$/, '')} % zum Vormonat</p>
        <svg class="chart-nwchain" id="nwChain" role="group" aria-label="Maßkette Nettovermögen"></svg>
        <p class="chain-note">Tippe ein Maß an, um die Konten zu sehen. Gestrichelt: Schulden, werden abgezogen.</p>`;
    }
    drawChain($('#nwChain'), {
      prefix: 'nw',
      cents: false,
      parts: [
        { key: 'liquid', label: 'Liquidität', value: nw.liquid, fill: 'var(--tint-2)' },
        { key: 'invested', label: 'Investiert', value: nw.invested, fill: 'var(--line)' },
      ],
      minus: { key: 'debt', label: 'Schulden', value: -nw.debt, style: 'outline' },
      result: { label: '= Nettovermögen', value: last },
      onSeg: openNW,
    }, animate);
  }
  const NW_ACCOUNTS = {
    liquid: ['Liquidität', [['Girokonto', 1497], ['Tagesgeld · Notgroschen', 7739], ['Bargeld', 120]]],
    invested: ['Investiert', [['Depot · ETF', 79450], ['Krypto', 4335], ['P2P · manuell bewertet', 4215]]],
    debt: ['Schulden', [['Kredit', -12176], ['Kreditkarte', -450]]],
  };
  function openNW(key) {
    const [title, rows] = NW_ACCOUNTS[key];
    const sum = rows.reduce((a, r) => a + r[1], 0);
    openPanel(title, `<p class="panel-sub">Stand je Konto am 17.09.2026, Beispieldaten.</p>${chainRows(rows.map(([n, v]) => [n, eur(v, { cents: false })]), ['= Summe', eur(sum, { cents: false })])}`);
  }
  function openPace(kind) {
    const a17 = actual(TODAY), p17 = plan(TODAY), fx = fixedTo(TODAY);
    const rate = (a17 - fx) / TODAY;
    const openFixed = FIXED_TOTAL - fx;
    const left = 30 - TODAY;
    const rows = {
      spent: ['Ausgegeben bis heute', [['Fixkosten fällig bis 17.09.', eur(fx)], ['Variable Ausgaben 1.–17.09.', eur(a17 - fx, { sign: true })]], ['= Ausgegeben', eur(a17)]],
      plan: ['Plan bis heute', [['Fixkosten fällig bis 17.09.', eur(fx)], [`Variabler Plan · 17/30 von ${eur(VAR_PLAN)}`, eur(p17 - fx, { sign: true })]], ['= Plan bis heute', eur(p17)]],
      forecast: ['Prognose Monatsende', [['Ausgegeben bis heute', eur(a17)], ['Offene Fixkosten bis 30.09.', eur(openFixed, { sign: true })], [`Variable Rate ${eur(rate)}/Tag × ${left} Tage`, eur(rate * left, { sign: true })]], ['= Prognose', eur(a17 + openFixed + rate * left)]],
    }[kind];
    openPanel(rows[0], `<p class="panel-sub">Plan: Fixkosten am Fälligkeitstag, variabler Rest linear über den Monat.</p>${chainRows(rows[1], rows[2])}`);
  }
  function renderTx(newFirst = false) {
    const clsOf = (cat) => (state.envelopes.find((e) => e.name === cat) || {}).cls;
    $('#txList').innerHTML = state.tx.slice(0, 5).map((t, i) => `<li class="row-btn tx${newFirst && i === 0 ? ' is-new' : ''}" style="cursor:default">
      <span class="tx-swatch${clsOf(t.cat) ? ' hatch-' + clsOf(t.cat) : ''}" aria-hidden="true"></span>
      <span class="tx-name"><strong>${esc(t.payee)}</strong><span>${esc(t.cat)}${t.note ? ' · ' + esc(t.note) : ''}</span></span>
      <span class="tx-amt">${eur(t.amt, { sign: true })}<br><span class="status">${esc(t.st)}</span></span>
    </li>`).join('');
  }

  function renderAll(animate = false) {
    renderLead(animate);
    renderPace(animate);
    renderRevs();
    renderEnvelopes();
    renderUpcoming();
    renderChecks();
    renderNW(animate);
    renderTx();
    if ($('#chain').classList.contains('is-open')) renderChain(false);
  }

  // ---------- Undo + toast ----------
  let toastTimer = null, undoFn = null;
  const snapshot = () => JSON.parse(JSON.stringify({ envelopes: state.envelopes, tx: state.tx, uncat: state.uncat, p2p: state.p2p, revisions: state.revisions, paceExtra: state.paceExtra }));
  function restore(snap) { Object.assign(state, snap); renderAll(false); }
  function toast(text, undo) {
    $('#toastText').textContent = text;
    undoFn = undo || null;
    $('#toastUndo').hidden = !undo;
    $('#toast').classList.add('is-open');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').classList.remove('is-open'), 6000);
  }
  $('#toastUndo').addEventListener('click', () => {
    if (undoFn) undoFn();
    undoFn = null;
    $('#toast').classList.remove('is-open');
  });

  function withUndo(label, fn) {
    const snap = snapshot();
    fn();
    renderAll(false);
    toast(label, () => { restore(snap); toast('Rückgängig gemacht.'); });
  }

  function removeRevision(id) {
    state.revisions = state.revisions.filter((r) => r.id !== id);
  }

  // ---------- Panel ----------
  let lastFocus = null;
  function openPanel(title, html, wire) {
    lastFocus = document.activeElement;
    $('#panelTitle').textContent = title;
    $('#panelBody').innerHTML = html;
    if (wire) wire($('#panelBody'));
    $('#scrim').classList.add('is-open');
    $('#panel').classList.add('is-open');
    setTimeout(() => $('#panel [data-close]').focus(), 30);
  }
  function closeAll() {
    $('#panel').classList.remove('is-open');
    $('#booking').classList.remove('is-open');
    $('#scrim').classList.remove('is-open');
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  $('#scrim').addEventListener('click', closeAll);
  $$('[data-close]').forEach((b) => b.addEventListener('click', closeAll));

  function chainRows(rows, total) {
    return `<div class="kv" style="border-top:0"><span class="tech">Posten</span><span class="tech">Betrag</span></div>` +
      rows.map(([a, b]) => `<div class="kv"><span>${esc(a)}</span><span>${b}</span></div>`).join('') +
      `<div class="kv" style="border-top:1.5px solid var(--line)"><span style="color:var(--ink);font-weight:600">${esc(total[0])}</span><span>${total[1]}</span></div>`;
  }

  function openEnvelope(id) {
    const e = byId(id);
    const a = avail(e);
    const over = a < 0;
    const txs = state.tx.filter((t) => t.cat === e.name);
    openPanel(e.name, `
      <div class="panel-graticule" aria-hidden="true"></div>
      <span class="tech">${CLASS_LABEL[e.cls]} · Verfügbar im September</span>
      <div class="big${over ? ' neg-alert' : ''}">${eur(a)}</div>
      <p class="panel-sub">${over ? 'Überzogen. Decke den Betrag aus einem anderen Envelope.' : `Monatsziel ${eur(e.goal)}`}</p>
      ${chainRows([['Übertrag aus August', eur(e.carry)], ['Zuweisung September', eur(e.assigned, { sign: true })], ['Ausgaben September', eur(-e.spent)]], ['= Verfügbar', eur(a)])}
      ${over ? `<div style="margin-top:20px"><button class="btn btn-alert" type="button" data-cover style="width:100%;height:44px">Aus „Freizeit“ decken</button></div>` : ''}
      <h3 style="font-size:15px;margin:28px 0 4px">Letzte Buchungen</h3>
      ${txs.length ? txs.map((t) => `<div class="kv"><span>${t.date} ${esc(t.payee)}</span><span>${eur(t.amt, { sign: true })}</span></div>`).join('') : '<p class="panel-sub">Keine Buchungen in den letzten Tagen.</p>'}
    `, (body) => {
      const c = $('[data-cover]', body);
      if (c) c.addEventListener('click', () => { closeAll(); doCover(); });
    });
  }

  function openList(key) {
    const env = (cls) => state.envelopes.filter((e) => e.cls === cls).map((e) => [e.name, eur(avail(e))]);
    if (key === 'open') {
      openPanel('Offen bis Gehalt', `
        <p class="panel-sub">Rechnungen, die vor dem Gehalt am 30.09. noch fällig sind. Sie sind im Leitmaß bereits abgezogen.</p>
        ${chainRows(state.openBills.map((b) => [`${b.date} ${b.name} · ${b.acct}`, eur(-b.amt)]), ['= Offen', eur(-openSum())])}`);
      return;
    }
    const title = key === 'need' ? 'Envelopes Bedarf' : 'Envelopes Wunsch';
    openPanel(title, `
      <p class="panel-sub">Verfügbar je Envelope im September. Negative Beträge sind überzogen und mindern das Leitmaß.</p>
      ${chainRows(env(key), ['= Summe', eur(sumClass(key))])}`);
  }

  function openUncat() {
    const html = () => state.uncat.length
      ? `<p class="panel-sub">Vorschläge aus Empfänger und Verlauf. „Übernehmen“ bucht auf das vorgeschlagene Envelope.</p>
        ${state.uncat.map((u, i) => `<div class="kv" style="align-items:center;gap:12px"><span><strong style="color:var(--ink)">${esc(u.payee)}</strong><br><span style="font-size:12.5px">${u.date} · ${eur(-u.amt)} → ${esc(byId(u.sug).name)}</span></span>
          <span><button class="btn btn-ghost btn-sm" type="button" data-accept="${i}">Übernehmen</button></span></div>`).join('')}
        <button class="btn btn-primary" type="button" data-accept-all style="width:100%;height:44px;margin-top:18px">Alle ${state.uncat.length} übernehmen</button>`
      : `<div class="rev-empty">${icon('check-circle')}<div><strong>Alles zugeordnet.</strong></div></div>`;
    const wire = (body) => {
      $$('[data-accept]', body).forEach((b) => b.addEventListener('click', () => {
        const u = state.uncat[+b.dataset.accept];
        withUndo(`${u.payee} → ${byId(u.sug).name}`, () => {
          byId(u.sug).spent = r2(byId(u.sug).spent + u.amt);
          state.uncat.splice(+b.dataset.accept, 1);
          if (!state.uncat.length) removeRevision('B');
        });
        body.innerHTML = html(); wire(body);
      }));
      const all = $('[data-accept-all]', body);
      if (all) all.addEventListener('click', () => {
        const n = state.uncat.length;
        withUndo(`${n} Buchungen zugeordnet`, () => {
          state.uncat.forEach((u) => { byId(u.sug).spent = r2(byId(u.sug).spent + u.amt); });
          state.uncat = [];
          removeRevision('B');
        });
        closeAll();
      });
    };
    openPanel('Ohne Kategorie', html(), wire);
  }

  function openP2P() {
    openPanel('P2P-Wert aktualisieren', `
      <p class="panel-sub">Manuelle Bewertung, zuletzt vor ${state.p2p.age} Tagen: ${eur(state.p2p.value)}.</p>
      <div class="field-row"><label for="p2pVal">Wert am 17.09.2026</label><input class="input" id="p2pVal" inputmode="decimal" value="${nf2.format(state.p2p.value)}"></div>
      <div class="field-error" id="p2pErr" role="alert"></div>
      <button class="btn btn-primary" type="button" id="p2pSave" style="width:100%;height:44px">Wert speichern</button>`, (body) => {
      $('#p2pSave', body).addEventListener('click', () => {
        const v = parseFloat($('#p2pVal', body).value.replace(/\./g, '').replace(',', '.'));
        if (!isFinite(v) || v < 0) { $('#p2pErr', body).textContent = 'Bitte einen Betrag eingeben, z. B. 4.230,00.'; return; }
        closeAll();
        withUndo(`P2P-Wert gespeichert: ${eur(v)}`, () => { state.p2p = { value: v, age: 0 }; removeRevision('C'); });
      });
    });
  }

  function openInbox() {
    const items = [];
    for (const r of state.revisions) items.push(revContent(r));
    items.push({ title: 'Mögliche Umbuchung', sub: 'Girokonto → Tagesgeld · 300,00 €' });
    openPanel('Posteingang', `<p class="panel-sub">${inboxCount()} offen. Im Prototyp sind nur die nächsten Schritte bedienbar.</p>` +
      items.map((c) => `<div class="kv"><span><strong style="color:var(--ink)">${esc(c.title)}</strong><br><span style="font-size:12.5px">${esc(c.sub)}</span></span><span></span></div>`).join(''));
  }

  function doCover() {
    const t = byId('treibstoff'), f = byId('freizeit');
    const need = -avail(t);
    if (need <= 0) return;
    withUndo(`${eur(need)} von Freizeit zu Treibstoff verschoben`, () => {
      t.assigned = r2(t.assigned + need);
      f.assigned = r2(f.assigned - need);
      removeRevision('A');
    });
  }

  document.addEventListener('click', (e) => {
    const act = e.target.closest('[data-rev-act]');
    if (act) {
      const r = state.revisions.find((x) => x.id === act.dataset.revAct);
      if (r.kind === 'cover') doCover();
      if (r.kind === 'uncat') openUncat();
      if (r.kind === 'p2p') openP2P();
      return;
    }
    const envBtn = e.target.closest('[data-env]');
    if (envBtn) { openEnvelope(envBtn.dataset.env); return; }
    const op = e.target.closest('[data-open="inbox"]');
    if (op) { location.href = 'konten.html#posteingang'; return; }
    const soon = e.target.closest('[data-soon]');
    if (soon) { e.preventDefault(); toast(`„${soon.dataset.soon}“ ist im Prototyp noch nicht gebaut.`); return; }
    const ob = e.target.closest('[data-open-booking]');
    if (ob) { openBooking(); return; }
    const pf = e.target.closest('[data-pace]');
    if (pf) openPace(pf.dataset.pace);
  });

  $('#chainBtn').addEventListener('click', () => toggleChain());

  $$('[data-period]').forEach((b) => b.addEventListener('click', () => {
    state.period = b.dataset.period;
    $$('[data-period]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    renderLead(true);
  }));

  // ---------- Booking (amount field with inline arithmetic, YNAB style) ----------
  const ACCOUNTS = [
    { name: 'Girokonto', role: 'budget' },
    { name: 'Kreditkarte', role: 'budget' },
    { name: 'Bargeld', role: 'budget' },
    { name: 'Tagesgeld', role: 'budget' },
    { name: 'Depot', role: 'tracking' },
    { name: 'Krypto', role: 'tracking' },
  ];
  const PAYEES = [
    { name: 'Supermarkt', cat: 'lebensmittel', acct: 'Girokonto' },
    { name: 'Tankstelle', cat: 'treibstoff', acct: 'Kreditkarte' },
    { name: 'Bäckerei', cat: 'lebensmittel', acct: 'Bargeld' },
    { name: 'Lieferdienst', cat: 'lieferdienste', acct: 'Kreditkarte' },
    { name: 'Drogerie', cat: 'haushalt', acct: 'Girokonto' },
    { name: 'Apotheke', cat: 'gesundheit', acct: 'Girokonto' },
    { name: 'Kino', cat: 'freizeit', acct: 'Kreditkarte' },
    { name: 'Restaurant', cat: 'essen', acct: 'Kreditkarte' },
  ];
  const PAYERS = [
    { name: 'Arbeitgeber', cat: 'tbb', acct: 'Girokonto' },
    { name: 'Kontakt M. Muster', cat: 'tbb', acct: 'Girokonto' },
    { name: 'Geldgeschenk', cat: 'reisen', acct: 'Girokonto' },
    { name: 'Erstattung Versicherung', cat: 'gesundheit', acct: 'Girokonto' },
  ];
  const FREQUENT = {
    out: ['lebensmittel', 'treibstoff', 'essen', 'freizeit', 'haushalt', 'lieferdienste'],
    in: ['tbb', 'reisen', 'geschenke', 'gesundheit', 'hobby'],
    transfer: ['investieren', 'notgroschen'],
  };
  const TBB = { id: 'tbb', name: 'Zu verteilen', cls: null };
  const catById = (id) => (id === 'tbb' ? TBB : byId(id));
  const bk = { kind: 'out', cat: null, active: -1 };
  const amountIn = $('#bkAmount');
  const accountOf = (name) => ACCOUNTS.find((a) => a.name === name);

  // Normalise what people type: 12,50 · 1.234,56 · 12.5 · × ÷ x : −
  function normalise(raw) {
    return raw.replace(/\s/g, '').replace(/[×xX]/g, '*').replace(/[÷:]/g, '/').replace(/[−–]/g, '-')
      .replace(/\d[\d.,]*/g, (n) => {
        if (n.includes(',')) return n.replace(/\./g, '').replace(',', '.');
        if (/^\d{1,3}(\.\d{3})+$/.test(n)) return n.replace(/\./g, '');
        return n;
      });
  }
  function evaluate(raw) {
    const expr = normalise(raw).replace(/^[+\-*/]+/, '').replace(/[+\-*/]+$/, '');
    if (!expr) return 0;
    if (/[^\d.+\-*/]/.test(expr)) return NaN;
    const toks = expr.match(/\d+(?:\.\d*)?|\.\d+|[+\-*/]/g);
    if (!toks || toks.length % 2 === 0) return NaN;
    const vals = [parseFloat(toks[0])];
    const ops = [];
    for (let i = 1; i < toks.length; i += 2) {
      const op = toks[i], n = parseFloat(toks[i + 1]);
      if (!/[+\-*/]/.test(op) || !isFinite(n)) return NaN;
      if (op === '*') vals.push(vals.pop() * n);
      else if (op === '/') vals.push(n === 0 ? NaN : vals.pop() / n);
      else { ops.push(op); vals.push(n); }
    }
    let res = vals[0];
    ops.forEach((op, i) => { res = op === '+' ? res + vals[i + 1] : res - vals[i + 1]; });
    return r2(res);
  }
  const hasOp = (raw) => /\d\s*[+\-*/×÷x:−]\s*\d/.test(raw);
  function renderAmount() {
    const raw = amountIn.value;
    const v = evaluate(raw);
    const hint = $('#bkAmountHint');
    if (raw && !isFinite(v)) hint.textContent = 'Das lässt sich nicht ausrechnen. Erlaubt sind Zahlen und + − × ÷.';
    else if (hasOp(raw)) hint.textContent = `= ${nf2.format(v)} €  ·  Enter übernimmt das Ergebnis`;
    else hint.textContent = 'Rechnen direkt im Feld, z. B. 12,50+8,20. Enter rechnet aus.';
    hint.classList.toggle('is-result', hasOp(raw) && isFinite(v));
  }
  function commitAmount() {
    const v = evaluate(amountIn.value);
    if (hasOp(amountIn.value) && isFinite(v) && v > 0) { amountIn.value = nf2.format(v); renderAmount(); }
  }
  amountIn.addEventListener('input', () => { $('#errAmount').textContent = ''; renderAmount(); });
  amountIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitAmount(); } });
  amountIn.addEventListener('blur', commitAmount);
  $$('[data-op]').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the caret in the field
    b.addEventListener('click', () => {
      const el = amountIn;
      const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? el.value.length;
      const ch = { '+': '+', '-': '−', '*': '×', '/': '÷' }[b.dataset.op];
      el.value = el.value.slice(0, start) + ch + el.value.slice(end);
      el.focus();
      el.setSelectionRange(start + 1, start + 1);
      renderAmount();
    });
  });

  function fillAccounts() {
    const from = $('#bkAccount'), to = $('#bkTo');
    const keepFrom = from.value, keepTo = to.value;
    const budget = ACCOUNTS.filter((a) => a.role === 'budget');
    from.innerHTML = budget.map((a) => `<option>${a.name}</option>`).join('');
    if (keepFrom) from.value = keepFrom;
    const others = ACCOUNTS.filter((a) => a.name !== from.value);
    to.innerHTML = `<option value="">Konto wählen</option>` +
      `<optgroup label="Budget-Konten">${others.filter((a) => a.role === 'budget').map((a) => `<option>${a.name}</option>`).join('')}</optgroup>` +
      `<optgroup label="Tracking-Konten">${others.filter((a) => a.role === 'tracking').map((a) => `<option>${a.name}</option>`).join('')}</optgroup>`;
    if (keepTo && keepTo !== from.value) to.value = keepTo;
  }
  $('#bkAccount').addEventListener('change', () => { fillAccounts(); renderKind(); });
  $('#bkTo').addEventListener('change', () => { $('#errTo').textContent = ''; bk.cat = null; renderKind(); });

  // Category is required for spending, optional for income (default: Zu verteilen),
  // and only asked for transfers onto tracking accounts (e.g. Investieren).
  function catNeeded() {
    if (bk.kind === 'transfer') return (accountOf($('#bkTo').value) || {}).role === 'tracking';
    return true;
  }
  function renderKind() {
    const k = bk.kind;
    $('#bkSign').textContent = k === 'out' ? MINUS : k === 'in' ? '+' : '';
    $('#bkSign').hidden = k === 'transfer';
    $('#bkPayeeRow').hidden = k === 'transfer';
    $('#bkToRow').hidden = k !== 'transfer';
    $('#bkPayeeLabel').textContent = k === 'in' ? 'Von (Zahler)' : 'Empfänger';
    $('#bkAccountLabel').textContent = k === 'transfer' ? 'Von Konto' : 'Konto';
    renderCats();
  }
  function renderCats() {
    const row = $('#bkCatRow');
    const k = bk.kind;
    if (k === 'transfer' && !catNeeded()) {
      row.hidden = false;
      $('#bkCats').innerHTML = `<span class="cat-note">${$('#bkTo').value ? 'Zwischen Budget-Konten budgetneutral, keine Kategorie nötig.' : 'Wähle das Zielkonto. Auf Tracking-Konten (Depot, Krypto) braucht die Umbuchung eine Kategorie.'}</span>`;
      $('#bkCatAll').hidden = true;
      return;
    }
    row.hidden = false;
    if (k === 'in' && !bk.cat) bk.cat = 'tbb';
    const list = k === 'in' ? PAYERS : PAYEES;
    const p = list.find((x) => x.name.toLowerCase() === $('#bkPayee').value.trim().toLowerCase());
    const sugg = [];
    if (bk.cat) sugg.push(bk.cat);
    if (p && !sugg.includes(p.cat)) sugg.push(p.cat);
    FREQUENT[k].forEach((c) => { if (!sugg.includes(c)) sugg.push(c); });
    $('#bkCats').innerHTML = sugg.slice(0, 6).map((id) => {
      const c = catById(id);
      return `<button class="chip" type="button" data-cat="${id}" aria-pressed="${bk.cat === id}"><span class="swatch ${c.cls ? 'hatch-' + c.cls : 'swatch-open'}" aria-hidden="true"></span>${esc(c.name)}${bk.cat === id ? icon('check', 'icon icon-sm chip-check') : ''}</button>`;
    }).join('') + `<button class="chip chip-quiet" type="button" data-cat-all>Alle</button>` +
      (k === 'out' ? `<button class="chip chip-quiet" type="button" data-split>${icon('split', 'icon icon-sm')}Aufteilen</button>` : '');
  }
  $('#bkCats').addEventListener('click', (e) => {
    const c = e.target.closest('[data-cat]');
    if (c) { bk.cat = c.dataset.cat; $('#errCat').textContent = ''; $('#bkCatAll').hidden = true; renderCats(); return; }
    if (e.target.closest('[data-cat-all]')) { const sel = $('#bkCatAll'); sel.hidden = !sel.hidden; if (!sel.hidden) sel.focus(); return; }
    if (e.target.closest('[data-split]')) toast('Aufteilen folgt im Paket P2, im Prototyp nicht umgesetzt.');
  });
  (function fillAll() {
    const sel = $('#bkCatAll');
    sel.innerHTML = '<option value="">Kategorie wählen</option><option value="tbb">Zu verteilen (nur Einnahmen)</option>' + ['need', 'want', 'future'].map((cls) => `<optgroup label="${CLASS_LABEL[cls]}">${state.envelopes.filter((e) => e.cls === cls).map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</optgroup>`).join('');
    sel.addEventListener('change', () => {
      if (!sel.value) return;
      if (sel.value === 'tbb' && bk.kind !== 'in') { $('#errCat').textContent = '„Zu verteilen“ gibt es nur für Einnahmen.'; return; }
      bk.cat = sel.value; $('#errCat').textContent = ''; sel.hidden = true; renderCats();
    });
  })();

  $$('[data-kind]').forEach((b) => b.addEventListener('click', () => {
    bk.kind = b.dataset.kind;
    bk.cat = null;
    $$('[data-kind]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    $('#errCat').textContent = ''; $('#errTo').textContent = '';
    renderKind();
  }));

  // payee / payer combobox
  const payeeIn = $('#bkPayee'), payeeList = $('#bkPayeeList');
  const payeeSource = () => (bk.kind === 'in' ? PAYERS : PAYEES);
  function renderPayees() {
    const q = payeeIn.value.trim().toLowerCase();
    const list = payeeSource().filter((p) => !q || p.name.toLowerCase().includes(q));
    if (!list.length || document.activeElement !== payeeIn) { payeeList.hidden = true; payeeIn.setAttribute('aria-expanded', 'false'); return; }
    bk.active = Math.min(bk.active, list.length - 1);
    payeeList.innerHTML = list.map((p, i) => `<li role="option" id="pay-${i}" data-payee="${esc(p.name)}" aria-selected="${i === bk.active}">${esc(p.name)}<span>${esc(catById(p.cat).name)} · ${p.acct}</span></li>`).join('');
    payeeList.hidden = false;
    payeeIn.setAttribute('aria-expanded', 'true');
    if (bk.active >= 0) payeeIn.setAttribute('aria-activedescendant', `pay-${bk.active}`); else payeeIn.removeAttribute('aria-activedescendant');
  }
  function choosePayee(name) {
    const p = payeeSource().find((x) => x.name === name);
    payeeIn.value = name;
    if (p) { bk.cat = p.cat; $('#bkAccount').value = p.acct; fillAccounts(); $('#errCat').textContent = ''; }
    payeeList.hidden = true;
    payeeIn.setAttribute('aria-expanded', 'false');
    renderCats();
  }
  payeeIn.addEventListener('input', () => { bk.active = -1; renderPayees(); renderCats(); });
  payeeIn.addEventListener('focus', () => { bk.active = -1; renderPayees(); });
  payeeIn.addEventListener('blur', () => setTimeout(() => { payeeList.hidden = true; payeeIn.setAttribute('aria-expanded', 'false'); }, 120));
  payeeIn.addEventListener('keydown', (e) => {
    const n = payeeList.children.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); bk.active = (bk.active + 1) % Math.max(n, 1); renderPayees(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); bk.active = (bk.active - 1 + n) % Math.max(n, 1); renderPayees(); }
    else if (e.key === 'Enter' && !payeeList.hidden && bk.active >= 0) { e.preventDefault(); choosePayee(payeeList.children[bk.active].dataset.payee); }
    else if (e.key === 'Escape' && !payeeList.hidden) { e.stopPropagation(); payeeList.hidden = true; }
  });
  payeeList.addEventListener('mousedown', (e) => { const li = e.target.closest('[data-payee]'); if (li) { e.preventDefault(); choosePayee(li.dataset.payee); } });

  $('#bkReceipt').addEventListener('click', () => toast('Kamera für Belege ist im Prototyp nicht angebunden.'));

  function resetBk() {
    bk.cat = null; bk.active = -1;
    amountIn.value = ''; payeeIn.value = ''; $('#bkNote').value = ''; $('#bkCatAll').hidden = true;
    $('#bkTo').value = '';
    ['#errAmount', '#errCat', '#errTo'].forEach((id) => { $(id).textContent = ''; });
    fillAccounts();
    renderAmount();
    renderKind();
  }
  function openBooking() {
    lastFocus = document.activeElement;
    resetBk();
    $('#scrim').classList.add('is-open');
    $('#booking').classList.add('is-open');
    setTimeout(() => amountIn.focus(), 60);
  }
  function save(keepOpen) {
    const v = evaluate(amountIn.value);
    const k = bk.kind;
    const from = $('#bkAccount').value, to = $('#bkTo').value;
    let ok = true;
    if (!isFinite(v) || v <= 0) { $('#errAmount').textContent = 'Betrag fehlt oder lässt sich nicht ausrechnen.'; ok = false; }
    if (k === 'transfer' && !to) { $('#errTo').textContent = 'Zielkonto fehlt. Eine Umbuchung geht immer auf ein anderes Konto.'; ok = false; }
    if (catNeeded() && !bk.cat && !(k === 'transfer' && !to)) { $('#errCat').textContent = k === 'transfer' ? 'Umbuchungen auf Tracking-Konten brauchen eine Kategorie, z. B. Investieren.' : 'Kategorie fehlt. Wähle einen Vorschlag oder „Alle“.'; ok = false; }
    if (!ok) return;
    const snap = snapshot();
    let amt, payee, catName;
    if (k === 'out') {
      const e = byId(bk.cat);
      e.spent = r2(e.spent + v);
      if (e.cls !== 'future') state.paceExtra = r2(state.paceExtra + v);
      amt = -v; payee = payeeIn.value.trim() || 'Ohne Empfänger'; catName = e.name;
    } else if (k === 'in') {
      if (bk.cat !== 'tbb') { const e = byId(bk.cat); e.spent = r2(e.spent - v); }
      amt = v; payee = payeeIn.value.trim() || 'Einnahme'; catName = catById(bk.cat).name;
    } else {
      const tracking = accountOf(to).role === 'tracking';
      if (tracking && bk.cat) { const e = byId(bk.cat); e.spent = r2(e.spent + v); }
      amt = -v; payee = `${from} → ${to}`; catName = tracking && bk.cat ? byId(bk.cat).name : 'Umbuchung';
    }
    const [, mo, d] = $('#bkDate').value.split('-');
    state.tx.unshift({ date: `${d}.${mo}.`, payee, cat: catName, note: $('#bkNote').value.trim(), amt, st: 'manuell' });
    renderAll(false);
    renderTx(true);
    toast(`Gespeichert: ${k === 'transfer' ? eur(v) : eur(amt, { sign: true })} · ${payee}`, () => { restore(snap); toast('Rückgängig gemacht.'); });
    if (keepOpen) { resetBk(); amountIn.focus(); } else closeAll();
  }
  $('#bkSave').addEventListener('click', () => save(false));
  $('#bkSaveNew').addEventListener('click', () => save(true));

  // ---------- Keyboard ----------
  document.addEventListener('keydown', (e) => {
    const bkOpen = $('#booking').classList.contains('is-open');
    const panelOpen = $('#panel').classList.contains('is-open');
    if (e.key === 'Escape' && (bkOpen || panelOpen)) { closeAll(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#search').focus(); return; }
    if (bkOpen) trap(e, $('#booking'));
    else if (panelOpen) trap(e, $('#panel'));
  });
  function trap(e, root) {
    if (e.key !== 'Tab') return;
    const f = $$('button:not([hidden]), input:not([hidden]), select:not([hidden]), [tabindex="0"]', root).filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
  }
  $('#search').addEventListener('keydown', (e) => { if (e.key === 'Enter') toast('Die Suche ist im Prototyp nicht verbunden.'); });

  // ---------- Theme + collapse ----------
  const darkMQ = matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (document.documentElement.dataset.theme || (darkMQ.matches ? 'dark' : 'light')) === 'dark';
  function syncThemeBtns() {
    const d = isDark();
    [$('#themeBtn'), $('#themeBtnM')].forEach((b) => {
      b.querySelector('use').setAttribute('href', d ? '#i-sun' : '#i-moon');
      const l = b.querySelector('.label');
      if (l) l.textContent = d ? 'Heller Zeichenfilm' : 'Dunkle Blaupause';
    });
  }
  function toggleTheme() {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('fa-theme', next); } catch (e) { /* storage unavailable */ }
    syncThemeBtns();
  }
  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#themeBtnM').addEventListener('click', toggleTheme);
  darkMQ.addEventListener('change', syncThemeBtns);
  syncThemeBtns();

  $('#collapseBtn').addEventListener('click', () => {
    const app = $('#app');
    const c = app.classList.toggle('is-collapsed');
    $('#collapseBtn').setAttribute('aria-expanded', !c);
    $('#collapseBtn').setAttribute('aria-label', c ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen');
    try { localStorage.setItem('fa-collapsed', c ? '1' : ''); } catch (e) { /* storage unavailable */ }
  });
  try { if (localStorage.getItem('fa-collapsed')) { $('#app').classList.add('is-collapsed'); $('#collapseBtn').setAttribute('aria-expanded', 'false'); } } catch (e) { /* storage unavailable */ }

  // ---------- Boot ----------
  let rafId = 0, booted = false;
  const ro = new ResizeObserver(() => {
    if (!booted) return;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      renderLead(false); renderPace(false); renderNW(false);
      if ($('#chain').classList.contains('is-open')) renderChain(false);
    });
  });
  ro.observe($('.sheet'));
  const boot = () => {
    if (booted) return;
    booted = true;
    renderAll(true);
    // Deep links from other pages: + Buchung and Posteingang live here in the prototype.
    if (location.hash === '#buchung') openBooking();
    if (location.hash === '#posteingang') openInbox();
  };
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(boot);
  setTimeout(boot, 1200);
})();
