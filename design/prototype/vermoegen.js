/* Finanz-App prototype · Vermögen. Sample data only.
   Helpers mirror the other pages; unify them in the React build. */
(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const MINUS = '−';
  const r2 = (v) => Math.round(v * 100) / 100;
  const eur = (v, { cents = true, sign = false } = {}) => {
    const a = Math.abs(v);
    const s = cents ? nf2.format(a) : nf0.format(Math.round(a));
    return (v < -0.004 ? MINUS : sign && v > 0.004 ? '+' : '') + s + ' €';
  };
  const pct = (v, sign = false) => `${v < -0.0004 ? MINUS : sign && v > 0.0004 ? '+' : ''}${nf1.format(Math.abs(v) * 100)} %`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MONTHS = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  // ---------- Net worth: monthly series Oct 2023 … Sep 2026 (the last 12 months match Heute) ----------
  // Net worth at month end, Sep 2023 … Sep 2026, and the own contribution per month.
  // Same ledger as Reports (reports-core.js): own = income − consumption + regular principal, market = the rest.
  const NW_VALUES = [20478, 20924, 26510, 26504, 28373, 28403, 28708, 31215, 32306, 37151, 39656, 38733, 39724, 42568, 46967, 49628, 51227, 50402, 52262, 54164, 54057, 60618, 61696, 58701, 61960, 63606, 71456, 73620, 74280, 76400, 77489, 77792, 80115, 85498, 85575, 85744, 84730];
  const OWN_VALUES = [884, 4847, 530, 352, -562, 478, 1053, 858, 5460, 1097, -1887, 1362, 1213, 4945, 700, 547, -405, 787, 1524, 527, 5451, 1245, -2065, 1242, 1321, 5152, 895, 1124, 68, 475, 1374, 624, 5473, 900, -1967, -1754];
  const INV_VALUES = [40831, 40693, 43771, 43534, 45451, 46443, 46669, 48524, 49156, 51041, 52849, 54213, 54242, 56273, 58227, 60588, 62040, 62020, 63493, 64271, 64036, 67681, 67914, 67384, 69801, 70526, 75759, 77427, 77364, 79816, 80830, 80159, 82257, 84748, 84325, 86861, 88000];
  const NW = []; // { y, m, value, own, market }
  NW_VALUES.forEach((value, k) => {
    const m = (8 + k) % 12, y = 2023 + Math.floor((8 + k) / 12);
    const own = k ? OWN_VALUES[k - 1] : 0;
    NW.push({ y, m, value, own, market: k ? value - NW_VALUES[k - 1] - own : 0 });
  });
  // Daily values: own contributions spread over the month, market moves day by day (prices),
  // and each month still ends exactly on its monthly value. September 2026 ends today, the 17th.
  const DAILY = []; // { d: Date, value, own, market }
  (function buildDaily() {
    let seed = 91;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    DAILY.push({ d: new Date(NW[0].y, NW[0].m + 1, 0), value: NW[0].value, own: 0, market: 0 });
    for (let k = 1; k < NW.length; k++) {
      const { y, m, own, market } = NW[k];
      const last = k === NW.length - 1 ? 17 : new Date(y, m + 1, 0).getDate();
      const noise = Array.from({ length: last }, () => (rnd() - 0.5) + (rnd() - 0.5));
      const mean = noise.reduce((a, b) => a + b, 0) / last;
      const vol = NW[k].value * 0.0055;
      let v = DAILY[DAILY.length - 1].value;
      for (let d = 1; d <= last; d++) {
        const o = own / last;
        const mk = market / last + (noise[d - 1] - mean) * vol;
        v += o + mk;
        DAILY.push({ d: new Date(y, m, d), value: d === last ? NW[k].value : v, own: o, market: mk });
      }
    }
  })();
  const PERIODS = { '1M': 1, '3M': 3, YTD: 'ytd', '1J': 12, '3J': 36, Alles: 'all' };
  let period = 'YTD';
  function window_() {
    const n = NW.length - 1;
    let k = PERIODS[period];
    if (k === 'ytd') k = NW[n].m + 1; // months since 31.12.
    if (k === 'all') k = n;
    k = Math.min(k, n);
    return NW.slice(n - k); // includes the start point
  }
  const PARTS = [
    { name: 'Depot · ETF und Aktie', v: 79450 }, { name: 'Tagesgeld', v: 7739 }, { name: 'Krypto', v: 4335 },
    { name: 'P2P-Kredite', v: 4215 }, { name: 'Girokonto', v: 1497 }, { name: 'Bargeld', v: 120 },
    { name: 'Kredit 6,32 %', v: -12176 }, { name: 'Kreditkarte', v: -450 },
  ];

  // ---------- Portfolio ----------
  const POS = [
    { name: 'ETF Welt', cls: 'welt', plat: 'Broker C', qty: 612.4, price: 111.86, cost: 50187 },
    { name: 'ETF Schwellenländer', cls: 'em', plat: 'Broker C', qty: 218, price: 32.11, cost: 5979 },
    { name: 'Einzelaktie A', cls: 'spec', plat: 'Broker C', qty: 25, price: 158.0, cost: 2842 },
    { name: 'Bitcoin', cls: 'spec', plat: 'Plattform D', qty: 0.0412, price: 82524, cost: 1303 },
    { name: 'Ethereum', cls: 'spec', plat: 'Plattform D', qty: 0.41, price: 2280, cost: 765 },
    { name: 'P2P-Kredite', cls: 'spec', plat: 'Plattform E', qty: null, price: null, cost: 3276, value: 4215 },
  ];
  POS.forEach((p) => { if (p.value == null) p.value = r2(p.qty * p.price); });
  // scale to the exact sample totals (68.500 / 7.000 / 3.950 / 3.400 / 935 / 4.215)
  const EXACT = [68500, 7000, 3950, 3400, 935, 4215];
  POS.forEach((p, i) => { p.value = EXACT[i]; if (p.qty) p.price = r2(p.value / p.qty); });
  const INVESTED = POS.reduce((a, p) => a + p.value, 0);
  const CLASSES = [
    { key: 'welt', name: 'Aktien Welt', soll: 0.8 },
    { key: 'em', name: 'Schwellenländer', soll: 0.12 },
    { key: 'spec', name: 'Spekulativ', soll: 0.08, note: 'Einzelaktien, Krypto, P2P' },
  ];
  // savings plans: the decision lives here, the effect in Reports › Portfolio
  const SPARPLAN = [
    { name: 'ETF Welt', now: 317, next: 300, why: 'Soll 80 %, Ist 77,8 %: bleibt Hauptposition' },
    { name: 'ETF Schwellenländer', now: 60, next: 100, why: 'unter Soll (8,0 % statt 12 %), R13' },
    { name: 'Einzelaktie A', now: 20, next: 0, why: 'spekulativer Anteil 14,2 % über 10 %, R15' },
    { name: 'Bitcoin', now: 2, next: 0, why: 'R15' },
    { name: 'Ethereum', now: 1, next: 0, why: 'R15' },
  ];
  const PERF = { // TTWROR, IRR (p.a. for >1J), benchmark — same monthly returns as Reports › Portfolio
    '1M': [0.009, 0.009, 0.008], '3M': [0.024, 0.02, 0.026], YTD: [0.06, 0.056, 0.088],
    '1J': [0.124, 0.118, 0.13], '3J': [0.382, 0.106, 0.409], Alles: [0.382, 0.106, 0.409],
  };

  // ---------- Loan ----------
  const LOAN = { name: 'Kredit 6,32 %', inst: 'Bank F', rest: 12176, rate: 0.0632, pmt: 412, fixedUntil: '07.2031' };
  const CARD = { bal: 450, limit: 2000 };
  const NET_INCOME = 3812;
  let extra = 300;
  function amortize(P, pmtBase, ex) {
    const i = LOAN.rate / 12;
    const rows = [];
    let b = P, interest = 0, m = 0;
    while (b > 0.005 && m < 600) {
      const z = b * i;
      const pay = Math.min(b + z, pmtBase + ex);
      b = b + z - pay;
      interest += z;
      rows.push({ m, b: Math.max(0, b), z, t: pay - z });
      m++;
    }
    return { months: m, interest, rows };
  }
  const monthLabel = (k) => { const d = new Date(2026, 9 + k, 1); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

  // ---------- Freedom number ----------
  const FREE = { annualSpend: 39600, saving: 700, ret: 0.05, goalYear: 2050 };

  // ---------- SVG ----------
  function s(tag, attrs = {}, parent) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
  }
  let animateNext = true;
  function plotIn(p) {
    if (reduceMotion || !animateNext) return;
    const len = p.getTotalLength();
    p.style.strokeDasharray = len; p.style.setProperty('--len', len); p.classList.add('draw');
    p.addEventListener('animationend', () => { p.style.strokeDasharray = ''; p.classList.remove('draw'); }, { once: true });
  }
  function yTicks(lo, hi, n = 4) {
    const span = hi - lo || 1;
    const raw = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((x) => x >= raw) || raw;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-6; v += step) out.push(v);
    return out;
  }
  const kfmt = (v) => (Math.abs(v) >= 1000 ? `${nf0.format(v / 1000)} T` : nf0.format(v));

  // Same arithmetic rules as the booking field (no eval: the page runs under a strict CSP).
  function evaluate(raw) {
    const expr = raw.replace(/\s|€/g, '').replace(/[×xX]/g, '*').replace(/[÷:]/g, '/').replace(/[−–]/g, '-')
      .replace(/\d[\d.,]*/g, (n) => (n.includes(',') ? n.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(n) ? n.replace(/\./g, '') : n))
      .replace(/[+\-*/]+$/, '');
    if (!expr || /[^\d.+\-*/]/.test(expr)) return NaN;
    const toks = expr.match(/\d+(?:\.\d*)?|\.\d+|[+\-*/]/g);
    if (!toks || toks.length % 2 === 0) return NaN;
    const vals = [parseFloat(toks[0])], ops = [];
    for (let k = 1; k < toks.length; k += 2) {
      const op = toks[k], n = parseFloat(toks[k + 1]);
      if (op === '*') vals.push(vals.pop() * n); else if (op === '/') vals.push(n === 0 ? NaN : vals.pop() / n); else { ops.push(op); vals.push(n); }
    }
    let res = vals[0];
    ops.forEach((op, k) => { res = op === '+' ? res + vals[k + 1] : res - vals[k + 1]; });
    return r2(res);
  }

  // ---------- Views ----------
  const chainHtml = (terms, label) => `<div class="chain-inline" role="group" aria-label="${esc(label)}">${terms.map((t) => {
    const inner = `<span class="ct-label tech">${t.label}</span><span class="ct-val">${t.val}</span>`;
    return `<span class="ct-pair">${t.op ? `<span class="ct-op" aria-hidden="true">${t.op}</span>` : ''}<span class="ct-term${t.result ? ' is-result' : ''}">${inner}</span></span>`;
  }).join('')}</div>`;

  function dailyWindow() {
    const w = window_();
    const from = new Date(w[0].y, w[0].m + 1, 0); // end of the start month
    return DAILY.filter((p) => p.d >= from);
  }
  function renderNetWorth() {
    const w = window_();
    const start = w[0], end = w[w.length - 1];
    const own = w.slice(1).reduce((a, x) => a + x.own, 0), market = w.slice(1).reduce((a, x) => a + x.market, 0);
    const delta = end.value - start.value;
    const whole = nf0.format(Math.trunc(end.value));
    const assets = PARTS.filter((p) => p.v > 0), debts = PARTS.filter((p) => p.v < 0);
    const maxA = Math.max(...assets.map((p) => p.v));
    $('#view').innerHTML = `
      <section class="vnw vnw-wide" aria-labelledby="nwT">
        <div class="tbd-head"><h2 id="nwT">Nettovermögen</h2><span class="tbd-state"><span class="${delta >= 0 ? 'ok' : 'ink'}">${icon(delta >= 0 ? 'up' : 'down', 'icon icon-sm')}${eur(delta, { cents: false, sign: true })} · ${periodText()}</span></span></div>
        <div class="tbd-fig">${whole}<span class="cents">,00 €</span></div>
        <svg class="vline" id="nwChart" role="img" aria-label="Nettovermögen täglich im Zeitraum, darunter Eigenleistung und Markt"></svg>
        <div class="legend" aria-hidden="true">
          <span><svg viewBox="0 0 26 8"><path class="l-actual" d="M0 4h26"/></svg>Nettovermögen, täglich</span>
          <span><i class="lg-sq lg-own"></i>Eigenleistung</span>
          <span><i class="lg-sq lg-mkt"></i>Markt</span>
        </div>
        ${chainHtml([
          { label: `Anfang ${MONTHS[start.m]} ${start.y}`, val: eur(start.value, { cents: false }) },
          { op: own >= 0 ? '+' : MINUS, label: 'Eigenleistung', val: eur(Math.abs(own), { cents: false }) },
          { op: market >= 0 ? '+' : MINUS, label: 'Markt', val: eur(Math.abs(market), { cents: false }) },
          { op: '=', label: 'jetzt', val: eur(end.value, { cents: false }), result: true },
        ], 'Maßkette Nettovermögen im Zeitraum')}
        <p class="vnote">Eigenleistung = was du eingezahlt hast (Einnahmen minus Ausgaben). Markt = alles andere: Kurse, Zinsen, Bewertungen.</p>
      </section>
      <section class="vcomp" aria-labelledby="compT">
        <div class="tbd-head"><h2 id="compT">Woraus es besteht</h2></div>
        <ul class="vbars">${assets.map((p) => `<li><span class="vb-name">${esc(p.name)}</span><span class="vb-bar"><i style="width:${(p.v / maxA) * 100}%"></i></span><span class="vb-val">${eur(p.v, { cents: false })}</span></li>`).join('')}
          ${debts.map((p) => `<li class="is-debt"><span class="vb-name">${esc(p.name)}</span><span class="vb-bar"><i style="width:${(-p.v / maxA) * 100}%"></i></span><span class="vb-val">${eur(p.v, { cents: false })}</span></li>`).join('')}</ul>
        <p class="vnote">Gestrichelt: Schulden, werden abgezogen.</p>
      </section>`;
    drawNW();
  }
  function periodText() {
    const w = window_();
    const a = w[0];
    return period === 'Alles' ? `seit ${MONTHS[a.m]} ${a.y}` : period === 'YTD' ? 'seit Jahresbeginn' : `letzte ${period === '1M' ? 'Monat' : period.replace('M', ' Monate').replace('J', ' Jahre').replace('1 Jahre', '12 Monate')}`;
  }
  function drawNW() {
    const svg = $('#nwChart');
    const W = svg.clientWidth, H = svg.clientHeight;
    if (!W) return;
    const pts = dailyWindow();
    const n = pts.length - 1;
    // bars: per week for short periods, per month otherwise
    const weekly = period === '1M' || period === '3M';
    const buckets = [];
    pts.slice(1).forEach((p, i) => {
      const key = weekly ? Math.floor(i / 7) : `${p.d.getFullYear()}-${p.d.getMonth()}`;
      let b = buckets[buckets.length - 1];
      if (!b || b.key !== key) { b = { key, own: 0, market: 0, i0: i + 1, i1: i + 1 }; buckets.push(b); }
      b.own += p.own; b.market += p.market; b.i1 = i + 1;
    });
    const L = 56, T = 22, R = 14;
    const split = H * 0.66;
    const vals = pts.map((p) => p.value);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.12 || 1000;
    const y0 = lo - pad, y1 = hi + pad;
    const x = (i) => L + (n ? i / n : 0.5) * (W - L - R);
    const y = (v) => split - 10 - ((v - y0) / (y1 - y0)) * (split - 10 - T);
    const bandLabel = (txt, yy) => { const t = s('text', { x: L, y: yy, class: 'svg-label-line' }, svg); t.textContent = txt; };
    bandLabel('Nettovermögen', 10);
    bandLabel(weekly ? 'Veränderung je Woche' : 'Veränderung je Monat', split + 14);
    yTicks(y0, y1).forEach((v) => { s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'graticule' }, svg); const t = s('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'svg-label' }, svg); t.textContent = kfmt(v); });
    const p = s('path', { d: pts.map((pt, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(pt.value).toFixed(1)}`).join(' '), class: 'l-actual l-daily' }, svg);
    plotIn(p);
    s('circle', { cx: x(n), cy: y(pts[n].value), r: 4, class: 'dot-actual' }, svg);
    // bars around zero, own band with its own axis
    const bmax = Math.max(...buckets.map((b) => Math.max(Math.abs(b.own), Math.abs(b.market))), 1);
    const zb = split + (H - 28 - split) / 2 + 8;
    const bh = (H - 28 - split) / 2 - 8;
    s('line', { x1: 0, x2: W, y1: split + 2, y2: split + 2, class: 'axis' }, svg);
    s('line', { x1: L, x2: W - R, y1: zb, y2: zb, class: 'axis' }, svg);
    const z0 = s('text', { x: L - 8, y: zb + 4, 'text-anchor': 'end', class: 'svg-label' }, svg); z0.textContent = '0';
    [[bmax, zb - bh], [-bmax, zb + bh]].forEach(([v, yy]) => { s('line', { x1: L, x2: W - R, y1: yy, y2: yy, class: 'graticule' }, svg); const t = s('text', { x: L - 8, y: yy + 4, 'text-anchor': 'end', class: 'svg-label' }, svg); t.textContent = (v > 0 ? '+' : MINUS) + kfmt(Math.abs(v)); });
    buckets.forEach((b) => {
      const xa = x(b.i0 - 1), xb = x(b.i1);
      const wdt = Math.max(2, (xb - xa) * 0.36);
      const cx = (xa + xb) / 2;
      const h1 = (Math.abs(b.own) / bmax) * bh, h2 = (Math.abs(b.market) / bmax) * bh;
      s('rect', { x: cx - wdt - 1, y: b.own >= 0 ? zb - h1 : zb, width: wdt, height: Math.max(1, h1), class: 'bar-own' }, svg);
      s('rect', { x: cx + 1, y: b.market >= 0 ? zb - h2 : zb, width: wdt, height: Math.max(1, h2), class: 'bar-mkt' }, svg);
    });
    // x labels on month starts, thinned to fit
    const starts = pts.map((pt, i) => ({ pt, i })).filter(({ pt, i }) => i > 0 && pt.d.getDate() === 1);
    const maxLabels = Math.max(2, Math.floor((W - L - R) / 70));
    const step = Math.max(1, Math.ceil(starts.length / maxLabels));
    starts.forEach(({ pt, i }, j) => {
      if (j % step) return;
      if (x(i) > W - R - 40) return;
      s('line', { x1: x(i), x2: x(i), y1: split - 10, y2: split - 5, class: 'axis' }, svg);
      const t = s('text', { x: x(i), y: H - 6, 'text-anchor': 'middle', class: 'svg-label' }, svg);
      t.textContent = `${MONTHS[pt.d.getMonth()]}${pt.d.getMonth() === 0 ? ' ' + String(pt.d.getFullYear()).slice(2) : ''}`;
    });
    const tEnd = s('text', { x: W - R, y: H - 6, 'text-anchor': 'end', class: 'svg-label-line' }, svg); tEnd.textContent = 'heute';
  }

  function renderPortfolio() {
    const byCls = CLASSES.map((c) => ({ ...c, ist: POS.filter((p) => p.cls === c.key).reduce((a, p) => a + p.value, 0) / INVESTED }));
    const breaches = byCls.filter((c) => Math.abs(c.ist - c.soll) > Math.min(0.05, c.soll * 0.25));
    const spec = byCls.find((c) => c.key === 'spec').ist;
    const em = byCls.find((c) => c.key === 'em');
    const emGap = r2(em.soll * INVESTED - em.ist * INVESTED);
    const specOver = r2((spec - 0.10) * INVESTED);
    const plat = [...new Set(POS.map((p) => p.plat))].map((name) => ({ name, v: POS.filter((p) => p.plat === name).reduce((a, p) => a + p.value, 0) }));
    $('#view').innerHTML = `
      <section class="vnw" aria-labelledby="pfT">
        <div class="tbd-head"><h2 id="pfT">Portfolio</h2><span class="tbd-state">${breaches.length ? `<span class="ink">${icon('alert', 'icon icon-sm')}${breaches.length} Klassen außerhalb des Bands</span>` : `<span class="ok">${icon('check-circle', 'icon icon-sm')}Allocation im Band</span>`}</span></div>
        <div class="tbd-fig">${nf0.format(INVESTED)}<span class="cents">,00 €</span></div>
        ${chainHtml([
          { label: 'Einstand', val: eur(POS.reduce((a, p) => a + p.cost, 0), { cents: false }) },
          { op: '+', label: 'Wertzuwachs', val: eur(INVESTED - POS.reduce((a, p) => a + p.cost, 0), { cents: false }) },
          { op: '=', label: 'Wert heute', val: eur(INVESTED, { cents: false }), result: true },
        ], 'Maßkette Portfoliowert')}
        <a class="vlook" href="reports.html#r/prendite">${icon('chart')}<span><strong>Wie haben sich die Entscheidungen ausgewirkt?</strong><small>Rendite, Benchmarks, Depots im Vergleich, Kosten und Steuern stehen unter Reports › Portfolio.</small></span>${icon('chevron', 'icon icon-sm')}</a>
      </section>
      <section class="vplan" aria-labelledby="spT">
        <div class="head"><h2 id="spT">Sparpläne</h2><span class="aside">400 € im Monat · am 5.</span></div>
        <table class="ktable vtable vplans"><caption class="sr-only">Sparpläne mit heutiger Rate und Vorschlag</caption>
          <thead><tr><th class="tech" scope="col">Produkt</th><th class="tech kc-num" scope="col">Rate heute</th><th class="tech kc-num" scope="col">Vorschlag</th><th class="tech" scope="col">Grund</th></tr></thead>
          <tbody>${SPARPLAN.map((p) => `<tr><td><span class="kname-s">${esc(p.name)}</span></td><td class="kc-num">${eur(p.now, { cents: false })}</td><td class="kc-num"><strong>${eur(p.next, { cents: false })}</strong></td><td class="kc-plain">${esc(p.why)}</td></tr>`).join('')}</tbody></table>
        <div class="vplan-act"><button class="btn btn-sm btn-primary" type="button" data-soon="Sparplan ändern">Vorschlag übernehmen</button><span class="muted">Die Bank ändert den Sparplan nicht automatisch; die App erinnert dich.</span></div>
      </section>
      <section class="valloc" aria-labelledby="alT">
        <div class="head"><h2 id="alT">Aufteilung Soll/Ist</h2><span class="aside">Band: ±5 Prozentpunkte oder ±25 % relativ</span></div>
        <ul class="vallo">${byCls.map((c) => {
          const band = Math.min(0.05, c.soll * 0.25);
          const out = Math.abs(c.ist - c.soll) > band;
          const scale = 1; // 0–100 %
          return `<li class="${out ? 'is-out' : ''}">
            <span class="va-name">${esc(c.name)}${c.note ? `<small>${esc(c.note)}</small>` : ''}</span>
            <span class="va-track" aria-hidden="true"><i class="va-band" style="left:${(c.soll - band) * 100 * scale}%;width:${band * 200 * scale}%"></i><i class="va-ist" style="width:${c.ist * 100 * scale}%"></i><i class="va-soll" style="left:${c.soll * 100 * scale}%"></i></span>
            <span class="va-val"><strong class="${out ? 'neg-alert' : ''}">${pct(c.ist)}</strong><small>Soll ${pct(c.soll)}</small></span>
          </li>`;
        }).join('')}</ul>
      </section>
      <section class="vrebal" aria-labelledby="rbT">
        <div class="head"><h2 id="rbT">Rebalancing</h2><span class="aside">${breaches.length ? `${breaches.length} außerhalb des Bands` : 'alles im Band'}</span></div>
        ${breaches.length ? `<table class="rev-table"><caption class="sr-only">Vorschläge zum Rebalancing</caption><thead><tr><th class="tech" scope="col">Rev.</th><th class="tech" scope="col">Änderung</th><th class="tech" scope="col" style="text-align:right">Aktion</th></tr></thead><tbody>
          <tr class="rev-row is-urgent"><td class="rev-mark">${tri('A')}</td><td class="rev-what"><strong>Schwellenländer unter Soll</strong><span>${pct(em.ist)} statt ${pct(em.soll)} · ${eur(emGap, { cents: false })} fehlen. Nächste Sparraten dorthin lenken (Wasserfall Stufe 8: am stärksten untergewichtete Klasse zuerst).</span></td><td class="rev-act"><button class="btn btn-sm btn-alert" type="button" data-soon="Sparplan anpassen">Sparplan umlenken</button></td></tr>
          <tr class="rev-row"><td class="rev-mark">${tri('B')}</td><td class="rev-what"><strong>Spekulativer Anteil ${pct(spec)} über 10 % (R15)</strong><span>${eur(specOver, { cents: false })} über der Grenze. Keine Zukäufe bei Krypto, P2P und Einzelaktien, bis der Anteil unter 10 % liegt.</span></td><td class="rev-act"><button class="btn btn-sm btn-ghost" type="button" data-soon="Regel R15">Regel ansehen</button></td></tr>
        </tbody></table>` : `<p class="rev-empty">${icon('check-circle')}Alle Anlageklassen liegen im Band.</p>`}
      </section>
      <section class="vpos" aria-labelledby="posT">
        <div class="head"><h2 id="posT">Positionen</h2><span class="aside">${POS.length} Positionen · Einstand ${eur(POS.reduce((a, p) => a + p.cost, 0), { cents: false })}</span></div>
        <table class="ktable vtable"><caption class="sr-only">Positionen mit Wert, Anteil und Rendite seit Kauf</caption>
          <thead><tr><th class="tech kc-pos" scope="col">Pos.</th><th class="tech" scope="col">Position</th><th class="tech" scope="col">Plattform</th><th class="tech kc-num" scope="col">Stück</th><th class="tech kc-num" scope="col">Kurs</th><th class="tech kc-num" scope="col">Wert</th><th class="tech kc-num" scope="col">Anteil</th><th class="tech kc-num" scope="col">seit Kauf</th></tr></thead>
          <tbody>${CLASSES.map((c, ci) => {
            const items = POS.filter((p) => p.cls === c.key);
            const sum = items.reduce((a, p) => a + p.value, 0);
            return `<tr class="kgroup"><td class="kc-pos"><span class="grp-no">${ci + 1}</span></td><td colspan="4"><span class="grp-title">${esc(c.name)}</span></td><td class="kc-num">${eur(sum, { cents: false })}</td><td class="kc-num">${pct(sum / INVESTED)}</td><td></td></tr>` +
              items.map((p, i) => { const gain = p.value / p.cost - 1; return `<tr><td class="kc-pos"><span class="pos">${ci + 1}.${i + 1}</span></td><td><span class="kname-s">${esc(p.name)}</span></td><td class="kc-acct">${esc(p.plat)}</td><td class="kc-num kc-plain">${p.qty ? nf2.format(p.qty).replace(/,00$/, '') : '—'}</td><td class="kc-num kc-plain">${p.price ? eur(p.price) : 'manuell'}</td><td class="kc-num">${eur(p.value, { cents: false })}</td><td class="kc-num kc-plain">${pct(p.value / INVESTED)}</td><td class="kc-num kc-plain">${pct(gain, true)}</td></tr>`; }).join('');
          }).join('')}</tbody></table>
      </section>
      <section class="vplat" aria-labelledby="plT">
        <div class="head"><h2 id="plT">Plattformen</h2><span class="aside">R14: Krypto- oder P2P-Plattform je ≤ 20 %</span></div>
        <ul class="vbars">${plat.map((p) => `<li><span class="vb-name">${esc(p.name)}</span><span class="vb-bar"><i style="width:${(p.v / INVESTED) * 100}%"></i></span><span class="vb-val">${pct(p.v / INVESTED)}</span></li>`).join('')}</ul>
      </section>`;
  }
  const tri = (id) => `<svg class="rev-tri" viewBox="0 0 26 24" aria-hidden="true"><path d="M13 2.5 24 21.5H2Z"/><text x="13" y="18" text-anchor="middle">${id}</text></svg>`;


  function renderDebts() {
    const base = amortize(LOAN.rest, LOAN.pmt, 0);
    const sc = amortize(LOAN.rest, LOAN.pmt, extra);
    const saved = base.interest - sc.interest;
    const earlier = base.months - sc.months;
    const quota = LOAN.pmt / NET_INCOME;
    // year table for the scenario
    const years = {};
    sc.rows.forEach((r) => { const yr = new Date(2026, 9 + r.m, 1).getFullYear(); years[yr] = years[yr] || { z: 0, t: 0 }; years[yr].z += r.z; years[yr].t += r.t; });
    $('#view').innerHTML = `
      <section class="vnw" aria-labelledby="dbT">
        <div class="tbd-head"><h2 id="dbT">Schulden</h2><span class="tbd-state"><span class="ok">${icon('check-circle', 'icon icon-sm')}Schuldenquote ${pct(quota)} · Ziel ≤ 30 %</span></span></div>
        <div class="tbd-fig">${nf0.format(LOAN.rest + CARD.bal)}<span class="cents">,00 €</span></div>
        ${chainHtml([
          { label: 'Kredit 6,32 %', val: eur(LOAN.rest, { cents: false }) },
          { op: '+', label: 'Kreditkarte', val: eur(CARD.bal, { cents: false }) },
          { op: '=', label: 'Restschuld', val: eur(LOAN.rest + CARD.bal, { cents: false }), result: true },
        ], 'Maßkette Restschuld')}
        <p class="vnote">Die Kreditkarte wird jeden Monat voll bezahlt und steht deshalb nicht in der Tilgungsreihenfolge.</p>
      </section>
      <section class="vcomp" aria-labelledby="sdT">
        <div class="tbd-head"><h2 id="sdT">Sondertilgung</h2><span class="tbd-state"><span class="ink">Wasserfall Stufe 6</span></span></div>
        <p class="vnote">Zins ${nf2.format(LOAN.rate * 100)} % liegt über 5 %: Sondertilgung kommt vor dem Investieren (R09).</p>
        <div class="field-row vfield"><label for="extraIn">Sondertilgung pro Monat</label>
          <div class="amount-field amount-field-sm"><span class="amount-sign" aria-hidden="true">+</span><input class="amount-input" id="extraIn" inputmode="decimal" value="${nf2.format(extra)}" autocomplete="off"><span class="amount-cur" aria-hidden="true">€</span></div>
          <span class="amount-hint" id="extraHint">Rechnen erlaubt, z. B. 300+50. Enter übernimmt.</span></div>
        <div class="kv" style="border-top:0"><span class="tech">Ohne Sondertilgung</span><span class="tech">Mit ${eur(extra, { cents: false })}</span></div>
        <div class="kv"><span>schuldenfrei ${monthLabel(base.months - 1)}</span><strong>${monthLabel(sc.months - 1)}</strong></div>
        <div class="kv"><span>Zinsen gesamt ${eur(base.interest, { cents: false })}</span><strong>${eur(sc.interest, { cents: false })}</strong></div>
        <div class="kv vsave"><span>${earlier} Monate früher frei</span><strong>${eur(saved, { cents: false })} Zinsen gespart</strong></div>
      </section>
      <section class="vchart" aria-labelledby="amT">
        <div class="head"><h2 id="amT">Restschuld</h2><span class="aside">Zins fest bis ${LOAN.fixedUntil}</span></div>
        <svg class="vline vline-s" id="debtChart" role="img" aria-label="Restschuld im Zeitverlauf ohne und mit Sondertilgung"></svg>
        <div class="legend" aria-hidden="true"><span><svg viewBox="0 0 26 8"><path class="l-actual" d="M0 4h26"/></svg>bisher</span><span><svg viewBox="0 0 26 8"><path class="l-plan" d="M0 4h26"/></svg>Plan ohne Sondertilgung</span><span><svg viewBox="0 0 26 8"><path class="l-forecast" d="M0 4h26"/></svg>mit ${eur(extra, { cents: false })} pro Monat</span></div>
      </section>
      <section class="vpos" aria-labelledby="ytT">
        <div class="head"><h2 id="ytT">Zins und Tilgung je Jahr</h2><span class="aside">mit Sondertilgung</span></div>
        <table class="ktable vtable vyears"><caption class="sr-only">Zins und Tilgung je Jahr</caption><thead><tr><th class="tech" scope="col">Jahr</th><th class="tech kc-num" scope="col">Zinsen</th><th class="tech kc-num" scope="col">Tilgung</th><th class="tech" scope="col">Anteil</th></tr></thead>
          <tbody>${Object.entries(years).map(([yr, v]) => `<tr><td>${yr}${yr === '2026' ? ' (ab Okt.)' : ''}</td><td class="kc-num kc-plain" data-label="Zinsen">${eur(v.z, { cents: false })}</td><td class="kc-num" data-label="Tilgung">${eur(v.t, { cents: false })}</td><td><span class="vsplit" aria-hidden="true"><i class="vs-z" style="width:${(v.z / (v.z + v.t)) * 100}%"></i><i class="vs-t" style="width:${(v.t / (v.z + v.t)) * 100}%"></i></span></td></tr>`).join('')}</tbody></table>
      </section>
      <section class="vplat" aria-labelledby="ccT">
        <div class="head"><h2 id="ccT">Kreditkarte</h2><span class="aside">Auslastung, Ziel ≤ 30 %</span></div>
        <ul class="vbars"><li><span class="vb-name">Kreditkarte · Bank A</span><span class="vb-bar"><i style="width:${(CARD.bal / CARD.limit) * 100}%"></i></span><span class="vb-val">${pct(CARD.bal / CARD.limit)}</span></li></ul>
        <p class="vnote">${eur(CARD.bal, { cents: false })} von ${eur(CARD.limit, { cents: false })} Limit · Abrechnung am 27., durch den Envelope „Kartenzahlung“ gedeckt.</p>
      </section>`;
    drawDebt(base, sc);
    const inp = $('#extraIn');
    const apply = () => {
      const v = evaluate(inp.value);
      if (!isFinite(v) || v < 0) { $('#extraHint').textContent = 'Bitte einen Betrag ab 0 eingeben.'; return; }
      extra = r2(v);
      renderDebts();
      $('#extraIn').focus();
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    inp.addEventListener('change', apply);
  }
  function drawDebt(base, sc) {
    const svg = $('#debtChart');
    const W = svg.clientWidth, H = svg.clientHeight;
    if (!W) return;
    const back = 12; // history months
    const hist = Array.from({ length: back + 1 }, (_, k) => {
      // reconstruct the past year from the same rate (backwards amortisation)
      let b = LOAN.rest;
      for (let j = 0; j < back - k; j++) b = (b + LOAN.pmt) / (1 + LOAN.rate / 12);
      return b;
    });
    const total = back + base.months;
    const L = 56, R = 16, T = 10, B = H - 24;
    const x = (m) => L + (m / total) * (W - L - R);
    const y = (v) => B - (v / (hist[0] * 1.08)) * (B - T);
    yTicks(0, hist[0] * 1.08).forEach((v) => { s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? 'axis' : 'graticule' }, svg); const t = s('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'svg-label' }, svg); t.textContent = kfmt(v); });
    s('path', { d: hist.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' '), class: 'l-actual' }, svg);
    s('path', { d: [`M${x(back)},${y(LOAN.rest)}`].concat(base.rows.map((r) => `L${x(back + r.m + 1)},${y(r.b)}`)).join(' '), class: 'l-plan' }, svg);
    const p = s('path', { d: [`M${x(back)},${y(LOAN.rest)}`].concat(sc.rows.map((r) => `L${x(back + r.m + 1)},${y(r.b)}`)).join(' '), class: 'l-forecast' }, svg);
    void p;
    s('line', { x1: x(back), x2: x(back), y1: T, y2: B, class: 'l-today' }, svg);
    const tt = s('text', { x: x(back), y: H - 6, 'text-anchor': 'middle', class: 'svg-label-line' }, svg); tt.textContent = 'heute';
    // payoff marks on the zero line
    let prevX = null;
    [[base.months, 'svg-label', 'ohne'], [sc.months, 'svg-label-line', 'mit']].forEach(([m, cls, lbl]) => {
      const px = x(back + m);
      const lift = prevX !== null && Math.abs(px - prevX) < 150 ? 18 : 0;
      prevX = px;
      s('path', { d: `M${px - 5},${B - 10} L${px + 5},${B - 10} L${px},${B - 1} Z`, class: 'kote' }, svg);
      const t = s('text', { x: px, y: B - 16 - lift, 'text-anchor': px > W - 90 ? 'end' : 'middle', class: cls }, svg); t.textContent = `${lbl}: ${monthLabel(m - 1)}`;
    });
    if (x(back) - x(0) > 110) { const t0 = s('text', { x: x(0), y: H - 6, class: 'svg-label' }, svg); t0.textContent = 'vor 12 Monaten'; }
  }

  function renderFreedom() {
    const target = FREE.annualSpend * 25;
    const share = INVESTED / target;
    // years to target with monthly saving and real return
    const i = FREE.ret / 12;
    let v = INVESTED, m = 0;
    const path = [v];
    while (v < target && m < 12 * 60) { v = v * (1 + i) + FREE.saving; m++; if (m % 12 === 0) path.push(v); }
    if (m % 12 !== 0) path.push(v);
    const years = m / 12;
    const yearDone = 2026 + Math.ceil(years);
    let v2 = INVESTED, m2 = 0;
    while (v2 < target && m2 < 12 * 60) { v2 = v2 * (1 + i) + FREE.saving + 100; m2++; }
    // Soll-Pfad: the plan from Okt 2023 that reaches the target in the goal year with a constant monthly saving
    const K0 = NW.length - 1; // months since Okt 2023 (today)
    const nGoal = (FREE.goalYear - 2023) * 12 - 9; // Okt 2023 … Jan of the goal year
    const need = (p0, n) => { const g = Math.pow(1 + i, n); return Math.max(0, ((target - p0 * g) * i) / (g - 1)); };
    const sollRate = need(INV_VALUES[0], nGoal);
    const soll = [INV_VALUES[0]];
    for (let k = 1; k <= nGoal; k++) soll.push(soll[k - 1] * (1 + i) + sollRate);
    const gap = INVESTED - soll[K0];
    const needToday = need(INVESTED, nGoal - K0);
    $('#view').innerHTML = `
      <section class="vnw" aria-labelledby="frT">
        <div class="tbd-head"><h2 id="frT">Freiheitszahl</h2><span class="tbd-state"><span class="ink">R16 · Ziel 100 %</span></span></div>
        <div class="tbd-fig">${nf1.format(share * 100)}<span class="cents"> %</span></div>
        ${chainHtml([
          { label: 'Investiert', val: eur(INVESTED, { cents: false }) },
          { op: '÷', label: '25 Jahresausgaben', val: eur(target, { cents: false }) },
          { op: '=', label: 'Freiheitszahl', val: `${nf1.format(share * 100)} %`, result: true },
        ], 'Maßkette Freiheitszahl')}
        <div class="vprog" aria-hidden="true"><i style="width:${Math.min(1, share) * 100}%"></i>${[25, 50, 75].map((p) => `<span style="left:${p}%"></span>`).join('')}</div>
        <p class="vnote">Bei 100 % tragen 4 % Entnahme im Jahr deine heutigen Ausgaben (${eur(FREE.annualSpend, { cents: false })} pro Jahr).</p>
      </section>
      <section class="vcomp" aria-labelledby="asT">
        <div class="tbd-head"><h2 id="asT">Annahmen</h2></div>
        <div class="field-row"><label for="frSave">Sparrate pro Monat</label>
          <div class="amount-field amount-field-sm"><span class="amount-sign" aria-hidden="true"></span><input class="amount-input" id="frSave" inputmode="decimal" autocomplete="off" value="${nf2.format(FREE.saving)}"><span class="amount-cur" aria-hidden="true">€</span></div>
          <span class="amount-hint" id="frHint">Rechnen erlaubt, z. B. 400+300. Enter übernimmt.</span></div>
        <div class="field-row"><label for="frGoal">Zieljahr</label><select class="select" id="frGoal">${[2045, 2050, 2055, 2060].map((y) => `<option value="${y}"${y === FREE.goalYear ? ' selected' : ''}>${y}</option>`).join('')}</select></div>
        <div class="field-row"><label for="frRet">Rendite nach Inflation</label><select class="select" id="frRet">${[0.03, 0.04, 0.05, 0.06].map((r) => `<option value="${r}"${r === FREE.ret ? ' selected' : ''}>${nf0.format(r * 100)} % p. a.</option>`).join('')}</select></div>
        <div class="kv" style="border-top:0"><span class="tech">Prognose</span><span></span></div>
        <div class="kv"><span>Ziel erreicht</span><strong>${yearDone}</strong></div>

        <div class="kv"><span>in</span><strong>${nf1.format(years)} Jahren</strong></div>
        <div class="kv vsave"><span>+100 € Sparrate pro Monat</span><strong>${nf1.format((m - m2) / 12)} Jahre früher</strong></div>
        <div class="kv" style="border-top:0;margin-top:10px"><span class="tech">Soll-Pfad bis ${FREE.goalYear}</span><span></span></div>
        <div class="kv"><span>Soll heute</span><strong>${eur(soll[K0], { cents: false })}</strong></div>
        <div class="kv"><span>${gap >= 0 ? 'Vor dem Soll-Pfad' : 'Hinter dem Soll-Pfad'}</span><strong class="${gap >= 0 ? 'txt-good' : 'txt-bad'}">${eur(gap, { cents: false, sign: true })}</strong></div>
        <div class="kv"><span>Nötige Sparrate ab heute</span><strong>${eur(needToday, { cents: false })} je Monat</strong></div>
      </section>
      <section class="vchart" aria-labelledby="fpT">
        <div class="head"><h2 id="fpT">Weg zum Ziel</h2><span class="aside">Ist seit Okt. 2023 · Soll-Pfad bis ${FREE.goalYear} · Prognose, keine Garantie</span></div>
        <svg class="vline vline-s" id="frChart" role="img" aria-label="Investiertes Vermögen: Ist seit Oktober 2023 und Prognose bis zum Ziel"></svg>
        <div class="legend" aria-hidden="true"><span><svg viewBox="0 0 26 8"><path class="l-actual" d="M0 4h26"/></svg>Ist investiertes Vermögen</span><span><svg viewBox="0 0 26 8"><path class="l-soll" d="M0 4h26"/></svg>Soll-Pfad: wo wir sein sollten (${eur(sollRate, { cents: false })} je Monat seit Okt 2023)</span><span><svg viewBox="0 0 26 8"><path class="l-forecast" d="M0 4h26"/></svg>Prognose ab heute</span><span><svg viewBox="0 0 26 8"><path class="l-goal" d="M0 4h26"/></svg>Ziel ${eur(target, { cents: false })}</span></div>
      </section>`;
    const svg = $('#frChart');
    const W = svg.clientWidth, H = svg.clientHeight;
    if (W) {
      // actual: invested value at each month end from the ledger
      const K = NW.length - 1;
      const hist = INV_VALUES.slice();
      hist[K] = INVESTED;
      // forecast month by month from today
      const fc = [INVESTED];
      let fv = INVESTED;
      for (let k = 1; k <= m; k++) { fv = fv * (1 + i) + FREE.saving; fc.push(fv); }
      const total = Math.max(K + m, nGoal);
      const L = 56, R = 16, T = 10, B = H - 24;
      const top = Math.max(target, fc[fc.length - 1]) * 1.08;
      const x = (k) => L + (k / Math.max(total, 1)) * (W - L - R);
      const y = (val) => B - (val / top) * (B - T);
      yTicks(0, top).forEach((val) => { s('line', { x1: L, x2: W - R, y1: y(val), y2: y(val), class: val === 0 ? 'axis' : 'graticule' }, svg); const t = s('text', { x: L - 8, y: y(val) + 4, 'text-anchor': 'end', class: 'svg-label' }, svg); t.textContent = kfmt(val); });
      s('line', { x1: L, x2: W - R, y1: y(target), y2: y(target), class: 'l-goal' }, svg);
      s('path', { d: soll.map((val, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(val).toFixed(1)}`).join(' '), class: 'l-soll' }, svg);
      s('circle', { cx: x(K), cy: y(soll[K]), r: 3, class: 'dot-soll' }, svg);
      const sg = s('text', { x: x(K) + 8, y: y(soll[K]) + (soll[K] > INVESTED ? -8 : 18), class: 'svg-label sk-lbl' }, svg); sg.textContent = `Soll ${eur(soll[K], { cents: false })}`;
      const gx = x(nGoal), gy = y(target);
      s('line', { x1: gx, x2: gx, y1: gy - 4, y2: gy + 4, class: 'axis' }, svg);
      const ph = s('path', { d: hist.map((val, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(val).toFixed(1)}`).join(' '), class: 'l-actual' }, svg);
      plotIn(ph);
      s('path', { d: fc.map((val, k) => `${k ? 'L' : 'M'}${x(K + k).toFixed(1)},${y(val).toFixed(1)}`).join(' '), class: 'l-forecast' }, svg);
      s('line', { x1: x(K), x2: x(K), y1: T, y2: B, class: 'l-today' }, svg);
      s('circle', { cx: x(K), cy: y(INVESTED), r: 4, class: 'dot-actual' }, svg);
      const tn = s('text', { x: x(K) + 8, y: y(INVESTED) + (soll[K] > INVESTED ? 18 : -8), class: 'svg-label-strong sk-lbl' }, svg); tn.textContent = `heute ${eur(INVESTED, { cents: false })}`;
      const px = x(K + m), py = y(target);
      s('path', { d: `M${px - 6},${py - 12} L${px + 6},${py - 12} L${px},${py - 1.5} Z`, class: 'kote' }, svg);
      const t = s('text', { x: px - 10, y: py - 16, 'text-anchor': 'end', class: 'svg-label-strong' }, svg); t.textContent = `Ziel ${yearDone}`;
      const t0 = s('text', { x: x(0), y: H - 6, class: 'svg-label' }, svg); t0.textContent = 'Okt 2023';
      const ts = s('text', { x: x(0), y: y(hist[0]) - 10, class: 'svg-label-strong' }, svg); ts.textContent = eur(hist[0], { cents: false });
      if (x(K) - x(0) > 90) { const tk = s('text', { x: x(K), y: H - 6, 'text-anchor': 'middle', class: 'svg-label-line' }, svg); tk.textContent = 'heute'; }
      const te = s('text', { x: x(total), y: H - 6, 'text-anchor': 'end', class: 'svg-label' }, svg); te.textContent = String(Math.max(yearDone, FREE.goalYear));
      if (Math.abs(x(K + m) - x(nGoal)) > 60) { const tg = s('text', { x: x(Math.min(K + m, nGoal)), y: H - 6, 'text-anchor': 'middle', class: 'svg-label' }, svg); tg.textContent = String(Math.min(yearDone, FREE.goalYear)); }
    }
    const fs = $('#frSave');
    const applySave = () => { const v = evaluate(fs.value); if (!isFinite(v) || v < 0) { $('#frHint').textContent = 'Bitte einen Betrag ab 0 eingeben.'; return; } if (v === FREE.saving) return; FREE.saving = v; renderFreedom(); $('#frSave').focus(); };
    fs.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applySave(); } });
    fs.addEventListener('change', applySave);
    $('#frRet').addEventListener('change', (e) => { FREE.ret = +e.target.value; renderFreedom(); $('#frRet').focus(); });
    $('#frGoal').addEventListener('change', (e) => { FREE.goalYear = +e.target.value; renderFreedom(); $('#frGoal').focus(); });
  }

  // ---------- Routing ----------
  function route() {
    const h = location.hash || '#nettovermoegen';
    const reg = ['#portfolio', '#schulden', '#freiheit'].includes(h) ? h.slice(1) : 'nettovermoegen';
    $$('[data-reg]').forEach((a) => { if (a.dataset.reg === reg) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.querySelector('main').dataset.reg = reg;
    ({ nettovermoegen: renderNetWorth, portfolio: renderPortfolio, schulden: renderDebts, freiheit: renderFreedom })[reg]();
    animateNext = false;
    const act = document.querySelector('.registers [aria-current="page"]');
    if (act) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  window.addEventListener('hashchange', () => { animateNext = true; route(); window.scrollTo({ top: 0 }); });
  $$('[data-period]').forEach((b) => b.addEventListener('click', () => {
    period = b.dataset.period;
    animateNext = true;
    $$('[data-period]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    route();
  }));

  // ---------- Shell (mirrors app.js) ----------
  let toastTimer = null;
  function toast(text) {
    $('#toastText').textContent = text;
    $('#toastUndo').hidden = true;
    $('#toast').classList.add('is-open');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').classList.remove('is-open'), 6000);
  }
  document.addEventListener('click', (e) => {
    let el;
    if (e.target.closest('[data-open-booking]')) { location.href = 'index.html#buchung'; return; }
    if (e.target.closest('[data-open="inbox"]')) { location.href = 'konten.html#posteingang'; return; }
    if ((el = e.target.closest('[data-soon]'))) { e.preventDefault(); toast(`„${el.dataset.soon}“ ist im Prototyp noch nicht gebaut.`); }
  });
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#search').focus(); } });
  const darkMQ = matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (document.documentElement.dataset.theme || (darkMQ.matches ? 'dark' : 'light')) === 'dark';
  function syncThemeBtns() {
    const d = isDark();
    [$('#themeBtn'), $('#themeBtnM')].forEach((b) => {
      if (!b) return;
      b.querySelector('use').setAttribute('href', d ? '#i-sun' : '#i-moon');
      const l = b.querySelector('.label');
      if (l) l.textContent = d ? 'Heller Zeichenfilm' : 'Dunkle Blaupause';
    });
  }
  const toggleTheme = () => { const next = isDark() ? 'light' : 'dark'; document.documentElement.dataset.theme = next; try { localStorage.setItem('fa-theme', next); } catch (err) { /* storage unavailable */ } syncThemeBtns(); };
  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#themeBtnM').addEventListener('click', toggleTheme);
  darkMQ.addEventListener('change', syncThemeBtns);
  syncThemeBtns();
  $('#collapseBtn').addEventListener('click', () => {
    const c = $('#app').classList.toggle('is-collapsed');
    $('#collapseBtn').setAttribute('aria-expanded', !c);
    try { localStorage.setItem('fa-collapsed', c ? '1' : ''); } catch (err) { /* storage unavailable */ }
  });
  try { if (localStorage.getItem('fa-collapsed')) $('#app').classList.add('is-collapsed'); } catch (err) { /* storage unavailable */ }
  $$('[data-inbox-count]').forEach((el) => { el.textContent = '9'; });
  let raf = 0;
  let lastW = 0;
  new ResizeObserver((entries) => {
    const w = Math.round(entries[0].contentRect.width);
    if (w === lastW) return;
    lastW = w;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { if (!document.activeElement || !document.activeElement.matches('input, select')) route(); });
  }).observe($('.sheet'));
  route();
})();
