/* Finanz-App prototype · Reports, group 4: Portfolio. How the investment decisions worked out.
   Decisions (Soll, Rebalancing, Sparpläne) live on Vermögen; these reports only look back. Sample data only. */
(() => {
  'use strict';

  const RC = window.RC;
  const {
    R, esc, icon, eur, pct, fig, chain, sw, sumK, nf0, nf1, nf2, MINUS, MONTHS, MONTHS_LONG, MONTHS_ALL,
    SPEND, INCOME, PRODUCTS, PV, BENCHES, RET, s, text, path, scaffold, bar, tip, labelShort, windowK, periodName, kfmt,
  } = RC;
  const $ = (sel, root = document) => root.querySelector(sel);
  const range = (a, b) => { const out = []; for (let k = Math.max(0, a); k <= b; k++) out.push(k); return out; };
  const KEST = 0.275;
  const DEPOTS = [...new Set(PRODUCTS.map((p) => p.depot))];
  const CLS = [...new Set(PRODUCTS.map((p) => p.cls))];
  const CLS_INK = { ETF: 'pk-1', Aktien: 'pk-2', Krypto: 'pk-3', P2P: 'pk-4' };
  const PRICE_NOW = { etfw: 111.86, etfem: 32.11, akta: 158.0, btc: 82524, eth: 2280, p2p: null };
  const SOLL = [ // allocation classes set in Einstellungen › Anlageklassen; decided on Vermögen
    { key: 'welt', name: 'Aktien Welt', soll: 0.8, of: (p) => p.id === 'etfw' },
    { key: 'em', name: 'Schwellenländer', soll: 0.12, of: (p) => p.id === 'etfem' },
    { key: 'spec', name: 'Spekulativ', soll: 0.08, of: (p) => ['akta', 'btc', 'eth', 'p2p'].includes(p.id) },
  ];

  // ---------- figures for a set of products over a month window ----------
  const valAt = (ps, k) => ps.reduce((a, p) => a + (k < 0 ? PV[p.id].start : PV[p.id].v[k]), 0);
  function stats(ps, ks) {
    const k0 = ks[0] - 1, k1 = ks[ks.length - 1];
    const S = valAt(ps, k0), E = valAt(ps, k1);
    const C = sumK(ks, (k) => ps.reduce((a, p) => a + PV[p.id].contrib[k], 0));
    const G = E - S - C;
    const rets = ks.map((k) => { let a = 0, b = 0; ps.forEach((p) => { const prev = k ? PV[p.id].v[k - 1] : PV[p.id].start; a += prev * PV[p.id].r[k]; b += prev; }); return b ? a / b : 0; });
    const tw = rets.reduce((a, r) => a * (1 + r), 1) - 1;
    // money-weighted (Modified Dietz), annualised beyond 12 months
    const n = ks.length;
    const wC = sumK(ks, (k) => ps.reduce((a, p) => a + PV[p.id].contrib[k], 0) * ((k1 - k + 0.5) / n));
    const md = G / Math.max(1, S + wC);
    const irr = n > 12 ? Math.pow(1 + md, 12 / n) - 1 : md;
    const mean = rets.reduce((a, b) => a + b, 0) / n;
    const vol = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / Math.max(1, n - 1)) * Math.sqrt(12);
    let peak = 1, idx = 1, mdd = 0;
    rets.forEach((r) => { idx *= 1 + r; peak = Math.max(peak, idx); mdd = Math.min(mdd, idx / peak - 1); });
    const bm = BENCHES.Weltindex;
    const bret = ks.map((k) => bm[k]);
    const bmean = bret.reduce((a, b) => a + b, 0) / n;
    const cov = rets.reduce((a, r, i) => a + (r - mean) * (bret[i] - bmean), 0) / Math.max(1, n - 1);
    const bvar = bret.reduce((a, r) => a + (r - bmean) ** 2, 0) / Math.max(1, n - 1);
    const annRet = Math.pow(1 + tw, 12 / n) - 1;
    const btw = bret.reduce((a, r) => a * (1 + r), 1) - 1;
    return { S, E, C, G, tw, irr, vol, mdd, beta: bvar ? cov / bvar : 0, sharpe: vol ? (annRet - 0.025) / vol : 0, rets, btw, best: Math.max(...rets), worst: Math.min(...rets), pos: rets.filter((r) => r > 0).length / n };
  }
  const indexLine = (rets) => { const out = [100]; rets.forEach((r) => out.push(out[out.length - 1] * (1 + r))); return out; };
  const pp = (x) => `${x < 0 ? MINUS : '+'}${nf1.format(Math.abs(x) * 100)} Pp`;
  const winKs = (period) => windowK(period, 35);
  const wname = (period) => (period === '3J' || period === 'Alles' ? 'seit Okt 2023' : period === 'YTD' ? 'seit Jahresbeginn' : period === '1M' ? 'letzter Monat' : period === '3M' ? 'letzte 3 Monate' : 'letzte 12 Monate');
  const decisionLink = `<a class="tb-link" href="vermoegen.html#portfolio">Entscheiden unter Vermögen › Portfolio ${icon('chevron', 'icon icon-xs')}</a>`;

  // ---------- product detail with its price history ----------
  function priceSeries(p) {
    // daily closes, 36 months, rebuilt from the monthly returns (market data via yfinance / Ariva in V1)
    const out = [];
    let sd = p.id.length * 97 + 7;
    const rnd = () => { sd = (sd * 9301 + 49297) % 233280; return sd / 233280 - 0.5; };
    let lvl = 1;
    const lv = [1];
    for (let k = 0; k < 36; k++) { lvl *= 1 + PV[p.id].r[k]; lv.push(lvl); }
    const scale = (PRICE_NOW[p.id] || 100) / lv[36];
    for (let k = 0; k < 36; k++) {
      const mo = MONTHS_ALL[k], dim = mo.partial ? 17 : new Date(mo.y, mo.m + 1, 0).getDate();
      const a = lv[k], b = lv[k + 1];
      const noise = Array.from({ length: dim }, () => rnd() * p.vol * 1.4);
      const drift = noise.reduce((x, y) => x + y, 0) / dim;
      let acc = 0;
      for (let d = 1; d <= dim; d++) { acc += noise[d - 1] - drift; const base = a + ((b - a) * d) / dim; out.push({ k, d, v: base * (1 + acc) * scale }); }
    }
    return out;
  }
  function openProduct(id) {
    const p = PRODUCTS.find((x) => x.id === id);
    const st = stats([p], range(0, 35));
    const st12 = stats([p], range(24, 35));
    const cost = RC.costOf(p);
    const series = PRICE_NOW[p.id] ? priceSeries(p) : null;
    RC.openPanel(p.name, `
      <p class="panel-sub">${esc(p.cls)} · ${esc(p.depot)} · ${esc(p.plat)}${PRICE_NOW[p.id] ? ` · Kurs ${eur(PRICE_NOW[p.id])}` : ' · manuell bewertet'}</p>
      <div class="lq-figs lq-2">
        <div><span class="tech">Wert</span><strong>${eur(p.now, { cents: false })}</strong><small>${pct(p.now / RC.PRODUCTS.reduce((a, x) => a + x.now, 0))} des Portfolios</small></div>
        <div><span class="tech">Kursgewinn</span><strong>${eur(RC.gainOf(p), { cents: false, sign: true })}</strong><small>Einstand ${eur(cost, { cents: false })}</small></div>
        <div><span class="tech">TTWROR 12 M</span><strong>${pct(st12.tw, true)}</strong><small>seit Okt 2023 ${pct(st.tw, true)}</small></div>
        <div><span class="tech">Volatilität p. a.</span><strong>${pct(st.vol)}</strong><small>max. Rückgang ${pct(st.mdd)}</small></div>
      </div>
      ${series ? `<svg class="rchart rchart-s pd-chart" id="pdChart" role="img" aria-label="Kursverlauf täglich seit Okt 2023 mit Käufen"></svg>
      <div class="legend" aria-hidden="true"><span><svg viewBox="0 0 26 8"><path class="l-actual l-daily" d="M0 4h26"/></svg>Schlusskurs täglich</span><span><i class="lg-buy"></i>Kauf (Sparplan)</span></div>` : '<p class="vnote">P2P-Kredite haben keinen Börsenkurs; der Wert kommt monatlich von der Plattform.</p>'}
      <p class="vnote">Kursdaten: täglich über yfinance, Ersatzquelle Ariva (Einstellungen › Datenquellen). Beispielwerte.</p>`, (body) => {
      const svg = body.querySelector('#pdChart');
      if (!svg || !series) return;
      requestAnimationFrame(() => {
        const n = series.length;
        const vals = series.map((x) => x.v);
        const g = scaffold(svg, n, Math.min(...vals), Math.max(...vals), { zero: false, L: 52, R: 10, T: 10, B: 22, yfmt: (x) => (x >= 1000 ? kfmt(x) : nf0.format(x)), pad: 0.06 });
        if (!g) return;
        path(svg, series.map((x, i) => [g.x(i), g.y(x.v)]), 'l-actual l-daily');
        series.forEach((x, i) => { if (x.d === 5 && PV[p.id].contrib[x.k] > 0) tip(s('circle', { cx: g.x(i), cy: g.y(x.v), r: 2.6, class: 'buy-dot' }, svg), `Kauf ${MONTHS_ALL[x.k].long}: ${eur(PV[p.id].contrib[x.k])}`); });
        [0, 12, 24].forEach((k) => { const i = series.findIndex((x) => x.k === k); text(svg, g.x(i), g.f.H - 6, labelShort(k, true), 'svg-label', 'start'); });
      });
    });
  }
  const prodLink = (p) => `<button type="button" class="prod-link" data-prod="${p.id}">${esc(p.name)}</button>`;
  const wireProducts = (v) => v.querySelectorAll('[data-prod]').forEach((b) => b.addEventListener('click', () => openProduct(b.dataset.prod)));

  // ---------- 4.1 Depots im Vergleich ----------
  R.pdepots = (v, st) => {
    const ks = winKs(st.period);
    const groups = DEPOTS.map((d) => ({ name: d, ps: PRODUCTS.filter((p) => p.depot === d) })).concat([{ name: 'Alle Depots', ps: PRODUCTS, all: true }]);
    groups.forEach((g) => { g.st = stats(g.ps, ks); g.plat = [...new Set(g.ps.map((p) => p.plat))].join(', '); });
    const total = groups[groups.length - 1].st.E;
    const rowsKpi = [
      ['Wert', (x) => eur(x.E, { cents: false })],
      ['Anteil', (x) => pct(x.E / total, false, 0)],
      ['Einzahlungen', (x) => eur(x.C, { cents: false })],
      ['Gewinn', (x) => `<span class="${x.G >= 0 ? 'txt-good' : 'txt-bad'}">${eur(x.G, { cents: false, sign: true })}</span>`],
      ['TTWROR', (x) => pct(x.tw, true)],
      ['IRR', (x) => pct(x.irr, true)],
      ['gegen Weltindex', (x) => `<span class="${x.tw >= x.btw ? 'txt-good' : 'txt-bad'}">${pp(x.tw - x.btw)}</span>`],
      ['Volatilität p. a.', (x) => pct(x.vol)],
      ['Max. Rückgang', (x) => pct(x.mdd)],
      ['Sharpe-Quote', (x) => nf2.format(x.sharpe)],
    ];
    v.innerHTML = `
      <section class="rs rs-wide" aria-labelledby="dT">
        <div class="tbd-head"><h2 id="dT">Depots · ${esc(wname(st.period))}</h2>${decisionLink}</div>
        <div class="depots">${groups.map((g, gi) => `<article class="depot${g.all ? ' is-all' : ''}">
          <div class="depot-head"><span class="rtb-pos">${g.all ? 'Σ' : gi + 1}</span><div><h3>${esc(g.name)}</h3><small>${esc(g.plat)}</small></div></div>
          <div class="depot-fig">${eur(g.st.E, { cents: false })}</div>
          <table class="depot-calc" aria-label="Rechnung ${esc(g.name)}"><tbody><tr><td>Anfang</td><td class="n">${eur(g.st.S, { cents: false })}</td></tr><tr><td>+ Einzahlungen</td><td class="n">${eur(g.st.C, { cents: false })}</td></tr><tr><td>${g.st.G >= 0 ? '+' : MINUS} Gewinn</td><td class="n ${g.st.G >= 0 ? 'txt-good' : 'txt-bad'}">${eur(Math.abs(g.st.G), { cents: false })}</td></tr><tr class="is-total"><td>= Wert</td><td class="n">${eur(g.st.E, { cents: false })}</td></tr></tbody></table>
          <div class="depot-perf"><div><span class="tech">TTWROR</span><strong>${pct(g.st.tw, true)}</strong></div><div><span class="tech">Weltindex</span><strong class="muted">${pct(g.st.btw, true)}</strong></div></div>
          <svg class="depot-chart" data-depot="${gi}" role="img" aria-label="${esc(g.name)} gegen Weltindex, indexiert"></svg>
          <ul class="depot-prods">${g.ps.map((p) => `<li>${prodLink(p)}<span>${eur(PV[p.id].v[35], { cents: false })}</span></li>`).join('')}</ul>
        </article>`).join('')}</div>
        <div class="legend" aria-hidden="true"><span><svg viewBox="0 0 26 8"><path class="l-actual" d="M0 4h26"/></svg>Depot, zeitgewichtet</span><span><svg viewBox="0 0 26 8"><path class="l-prev" d="M0 4h26"/></svg>Weltindex</span></div>
      </section>
      <section class="rs rs-wide" aria-labelledby="dK">
        <div class="tbd-head"><h2 id="dK">Kennzahlen nebeneinander</h2></div>
        <div class="rscroll rsticky"><table class="rtable rgrid"><thead><tr><th class="tech rg-first">Kennzahl</th>${groups.map((g) => `<th class="tech n">${esc(g.name)}</th>`).join('')}</tr></thead>
        <tbody>${rowsKpi.map(([l, f2]) => `<tr><th scope="row" class="rg-first">${l}</th>${groups.map((g) => `<td class="n${g.all ? ' rg-sum' : ''}">${f2(g.st)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <p class="vnote">TTWROR blendet Ein- und Auszahlungen aus und ist mit dem Index vergleichbar; IRR zeigt, was euer Geld mit euren Einzahlungszeitpunkten verdient hat${ks.length > 12 ? ' (pro Jahr)' : ''}. Sharpe mit 2,5 % sicherem Zins.</p>
      </section>`;
    wireProducts(v);
    v.querySelectorAll('.depot-chart').forEach((svg) => {
      const g0 = groups[+svg.dataset.depot];
      const a = indexLine(g0.st.rets), b = indexLine(ks.map((k) => BENCHES.Weltindex[k]));
      const g = scaffold(svg, a.length, Math.min(...a, ...b), Math.max(...a, ...b), { zero: false, L: 30, R: 6, T: 6, B: 6, yfmt: (x) => nf0.format(x), pad: 0.1 });
      if (!g) return;
      path(svg, b.map((x, i) => [g.x(i), g.y(x)]), 'l-prev');
      path(svg, a.map((x, i) => [g.x(i), g.y(x)]), 'l-actual');
    });
  };

  // ---------- sunburst: inner ring and outer ring as ink arcs ----------
  function arc(cx, cy, r0, r1, a0, a1) {
    const p = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
    return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`;
  }
  function sunburst(svg, inner, title, outerLabels = true) {
    svg.innerHTML = '';
    const W = svg.clientWidth, H = svg.clientHeight;
    if (!W) return;
    const cx = W / 2, cy = H / 2, R0 = Math.min(W, H) / 2 - 6;
    const r = [R0 * 0.34, R0 * 0.64, R0];
    const tot = inner.reduce((a, g) => a + g.v, 0);
    let a = 0;
    inner.forEach((g, gi) => {
      const a1 = a + (g.v / tot) * Math.PI * 2;
      tip(s('path', { d: arc(cx, cy, r[0], r[1] - 1.5, a + 0.004, a1 - 0.004), class: `sb-arc ${g.ink}` }, svg), `${g.name}: ${eur(g.v, { cents: false })} · ${pct(g.v / tot)}`);
      const mid = (a + a1) / 2, rr = (r[0] + r[1]) / 2;
      if (a1 - a > 0.5) text(svg, cx + rr * Math.sin(mid), cy - rr * Math.cos(mid) + 4, g.name, `svg-label-strong sb-lbl ${g.ink === 'pk-1' ? 'sb-lbl-inv' : ''}`, 'middle');
      let b = a;
      g.kids.forEach((kd) => {
        const b1 = b + (kd.v / tot) * Math.PI * 2;
        const el = s('path', { d: arc(cx, cy, r[1], r[2], b + 0.003, b1 - 0.003), class: `sb-arc sb-out ${g.ink}${kd.id ? ' is-link' : ''}` }, svg);
        tip(el, `${kd.name}: ${eur(kd.v, { cents: false })} · ${pct(kd.v / tot)}`);
        if (kd.id) { el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button'); el.setAttribute('aria-label', `${kd.name} öffnen`); el.addEventListener('click', () => openProduct(kd.id)); el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProduct(kd.id); } }); }
        const m2 = (b + b1) / 2, r2 = (r[1] + r[2]) / 2;
        if (outerLabels && b1 - b > 0.5) text(svg, cx + r2 * Math.sin(m2), cy - r2 * Math.cos(m2) + 4, kd.short || kd.name, 'svg-label sb-lbl', 'middle');
        b = b1;
      });
      a = a1;
    });
    text(svg, cx, cy - 4, title, 'svg-label', 'middle');
    text(svg, cx, cy + 14, kfmt(tot), 'svg-label-strong', 'middle');
  }

  // ---------- 4.2 Allocation ----------
  R.pallocation = (v) => {
    const total = PRODUCTS.reduce((a, p) => a + p.now, 0);
    const byCls = CLS.map((c) => ({ name: c, ink: CLS_INK[c], v: PRODUCTS.filter((p) => p.cls === c).reduce((a, p) => a + p.now, 0), kids: PRODUCTS.filter((p) => p.cls === c).map((p) => ({ id: p.id, name: p.name, short: p.name.replace('ETF ', ''), v: p.now })) }));
    const regions = {};
    PRODUCTS.forEach((p) => Object.entries(p.regions).forEach(([rg, sh]) => { (regions[rg] = regions[rg] || []).push({ id: p.id, name: p.name, short: p.name.replace('ETF ', ''), v: p.now * sh }); }));
    const byReg = Object.entries(regions).map(([name, kids], i) => ({ name, ink: `pk-${(i % 4) + 1}`, v: kids.reduce((a, x) => a + x.v, 0), kids })).sort((a, b) => b.v - a.v);
    const sollRows = SOLL.map((c) => { const ist = PRODUCTS.filter(c.of).reduce((a, p) => a + p.now, 0) / total; return { ...c, ist, d: ist - c.soll }; });
    v.innerHTML = `
      <section class="rs rs-wide" aria-labelledby="alT">
        <div class="tbd-head"><h2 id="alT">Woraus das Portfolio besteht</h2>${decisionLink}</div>
        <div class="sb-pair">
          <figure class="sb-fig"><svg class="sunburst" id="sbCls" role="img" aria-label="Sonnendiagramm: innen Anlageklasse, außen Produkt"></svg><figcaption>Innen Anlageklasse, außen Produkt. Ein Produkt anklicken öffnet den Kursverlauf.</figcaption></figure>
          <figure class="sb-fig"><svg class="sunburst" id="sbReg" role="img" aria-label="Sonnendiagramm: innen Region, außen Produkt"></svg><figcaption>Innen Region (ETF nach Länderanteil), außen Produkt. Details im Tooltip und in der Tabelle.</figcaption></figure>
        </div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Klasse und Produkt</th><th class="tech">Depot</th><th class="tech n">Wert</th><th class="tech n">Anteil</th><th class="tech n">12 Monate</th></tr></thead>
        ${byCls.map((c) => `<tbody><tr class="rp-grp"><td><i class="sw ${c.ink}" aria-hidden="true"></i><strong>${esc(c.name)}</strong></td><td></td><td class="n"><strong>${eur(c.v, { cents: false })}</strong></td><td class="n">${pct(c.v / total)}</td><td></td></tr>
          ${c.kids.map((kd) => { const p = PRODUCTS.find((x) => x.id === kd.id); return `<tr><td class="lv-1">${prodLink(p)}</td><td class="muted">${esc(p.depot)}</td><td class="n">${eur(p.now, { cents: false })}</td><td class="n">${pct(p.now / total)}</td><td class="n">${pct(stats([p], range(24, 35)).tw, true)}</td></tr>`; }).join('')}</tbody>`).join('')}</table></div>
      </section>
      <section class="rs rs-wide" aria-labelledby="alS">
        <div class="tbd-head"><h2 id="alS">Soll und Ist über die Zeit</h2></div>
        <svg class="rchart" id="alChart" role="img" aria-label="Anteile der Allocation-Klassen je Monat, Soll gestrichelt"></svg>
        <div class="legend" aria-hidden="true">${SOLL.map((c, i) => `<span><i class="lg-sq pk-${i + 1}"></i>${esc(c.name)} · Soll ${pct(c.soll, false, 0)}</span>`).join('')}<span><svg viewBox="0 0 26 8"><path class="l-plan" d="M0 4h26"/></svg>Soll-Grenzen</span></div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Klasse</th><th class="tech n">Soll</th><th class="tech n">Ist</th><th class="tech n">Abweichung</th><th class="tech">Regel</th></tr></thead>
        <tbody>${sollRows.map((c) => `<tr><td>${esc(c.name)}</td><td class="n">${pct(c.soll)}</td><td class="n"><strong>${pct(c.ist)}</strong></td><td class="n"><span class="${Math.abs(c.d) > 0.05 || Math.abs(c.d) > c.soll * 0.25 ? 'txt-bad' : ''}">${pp(c.d)}</span></td><td>${Math.abs(c.d) > 0.05 || Math.abs(c.d) > c.soll * 0.25 ? `<span class="status">${icon('alert')}außerhalb des Bands (R13${c.key === 'spec' ? ', R15' : ''})</span>` : `<span class="status ok">${icon('check-circle')}im Band</span>`}</td></tr>`).join('')}</tbody></table></div>
        <p class="vnote">Soll und Band stellst du in den Einstellungen ein; ob und wie umgeschichtet wird, entscheidest du unter Vermögen › Portfolio. Dieser Report zeigt nur, wie sich die Verteilung entwickelt hat.</p>
      </section>`;
    wireProducts(v);
    sunburst($('#sbCls'), byCls, 'Klassen');
    sunburst($('#sbReg'), byReg, 'Regionen', false);
    const svg = $('#alChart');
    const ks = range(0, 35);
    const shares = ks.map((k) => { const tot = valAt(PRODUCTS, k); return SOLL.map((c) => valAt(PRODUCTS.filter(c.of), k) / tot); });
    const g = scaffold(svg, ks.length, 0, 1, { yfmt: (x) => `${nf0.format(x * 100)} %`, labelAt: (i) => labelShort(i, i === 0), maxLabels: 9, pad: 0, L: 48 });
    if (!g) return;
    let acc = ks.map(() => 0);
    SOLL.forEach((c, ci) => {
      const top = acc.map((a, i) => a + shares[i][ci]);
      const d = top.map((val, i) => `${i ? 'L' : 'M'}${g.x(i).toFixed(1)},${g.y(val).toFixed(1)}`).join(' ') + ' ' + acc.map((val, i) => [i, val]).reverse().map(([i, val]) => `L${g.x(i).toFixed(1)},${g.y(val).toFixed(1)}`).join(' ') + 'Z';
      tip(s('path', { d, class: `area pk-${ci + 1}` }, svg), `${c.name}: heute ${pct(shares[35][ci])}`);
      acc = top;
    });
    let cum = 0;
    SOLL.slice(0, -1).forEach((c) => { cum += c.soll; s('line', { x1: g.f.L, x2: g.f.W - g.f.R, y1: g.y(cum), y2: g.y(cum), class: 'l-plan' }, svg); });
  };

  // ---------- 4.3 Einzahlungen und Wert ----------
  R.peinzahlungen = (v, st) => {
    const ks = winKs(st.period);
    const k0 = ks[0] - 1;
    const S = valAt(PRODUCTS, k0);
    const inv = [], val = [];
    let c = S;
    ks.forEach((k) => { c += PRODUCTS.reduce((a, p) => a + PV[p.id].contrib[k], 0); inv.push(c); val.push(valAt(PRODUCTS, k)); });
    const C = c - S, E = val[val.length - 1], G = E - S - C;
    const years = [2023, 2024, 2025, 2026].map((y) => {
      const yk = ks.filter((k) => MONTHS_ALL[k].y === y);
      if (!yk.length) return null;
      const a = valAt(PRODUCTS, yk[0] - 1), cc = sumK(yk, (k) => PRODUCTS.reduce((acc, p) => acc + PV[p.id].contrib[k], 0)), e = valAt(PRODUCTS, yk[yk.length - 1]);
      return { y, n: yk.length, a, cc, g: e - a - cc, e };
    }).filter(Boolean);
    v.innerHTML = `
      <section class="rs rs-wide" aria-labelledby="eiT">
        <div class="tbd-head"><h2 id="eiT">Eingezahlt und Wert · ${esc(wname(st.period))}</h2><span class="tbd-state"><span class="${G >= 0 ? 'ok' : 'ink'}">${icon(G >= 0 ? 'up' : 'down', 'icon icon-sm')}${eur(G, { cents: false, sign: true })} Marktgewinn</span></span></div>
        <div class="tbd-fig">${fig(E)}</div>
        ${chain([{ label: 'Wert am Anfang', val: eur(S, { cents: false }) }, { op: '+', label: 'Einzahlungen', val: eur(C, { cents: false }) }, { op: G >= 0 ? '+' : MINUS, label: 'Markt und Erträge', val: eur(Math.abs(G), { cents: false }) }, { op: '=', label: 'Wert heute', val: eur(E, { cents: false }), result: true }], 'Maßkette Einzahlungen und Wert')}
        <svg class="rchart rchart-l" id="eiChart" role="img" aria-label="Investiertes Kapital als Stufenlinie, Wert als Linie, Differenz darunter"></svg>
        <div class="legend" aria-hidden="true"><span><svg viewBox="0 0 26 8"><path class="l-actual" d="M0 4h26"/></svg>Wert</span><span><svg viewBox="0 0 26 8"><path class="l-invest" d="M0 4h26"/></svg>Investiertes Kapital (Anfang + Einzahlungen)</span><span><i class="lg-sq lg-gain"></i>Differenz = Marktgewinn</span></div>
      </section>
      <section class="rs rs-wide" aria-labelledby="eiJ">
        <div class="tbd-head"><h2 id="eiJ">Je Jahr</h2></div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Jahr</th><th class="tech n">Anfang</th><th class="tech n">Einzahlungen</th><th class="tech n">Markt und Erträge</th><th class="tech n">Ende</th><th class="tech n">Gewinn je eingezahltem Euro</th></tr></thead>
        <tbody>${years.map((y) => `<tr><td>${y.y}${y.n < 12 ? ` <small class="muted">${y.n} Monate</small>` : ''}</td><td class="n">${eur(y.a, { cents: false })}</td><td class="n">${eur(y.cc, { cents: false })}</td><td class="n"><span class="${y.g >= 0 ? 'txt-good' : 'txt-bad'}">${eur(y.g, { cents: false, sign: true })}</span></td><td class="n"><strong>${eur(y.e, { cents: false })}</strong></td><td class="n">${nf2.format(y.g / Math.max(1, y.a + y.cc / 2))} €</td></tr>`).join('')}</tbody></table></div>
        <p class="vnote">Einzahlungen = ETF-Sparplan und die Anteile der Sonderzahlungen (R12). „Gewinn je eingezahltem Euro“ bezieht den Gewinn auf das durchschnittlich gebundene Kapital.</p>
      </section>`;
    const svg = $('#eiChart');
    const H = svg.clientHeight, W = svg.clientWidth;
    if (!W) return;
    svg.innerHTML = '';
    // one time axis: month i spans [edge i, edge i+1]; levels sit on the month ends, bars in the month centre
    const split = H * 0.68;
    const n = ks.length;
    const L = 56, R2 = 92, T = 12;
    const bw = (W - L - R2) / n;
    const xe = (i) => L + i * bw;
    const xc = (i) => L + (i + 0.5) * bw;
    const lo = Math.min(S, ...inv, ...val) * 0.96, hi = Math.max(...inv, ...val) * 1.03;
    const y = (vv) => split - 12 - ((vv - lo) / (hi - lo)) * (split - 12 - T);
    RC.yTicks(lo, hi).forEach((t2) => { s('line', { x1: L, x2: W - R2, y1: y(t2), y2: y(t2), class: 'graticule' }, svg); text(svg, L - 8, y(t2) + 4, kfmt(t2), 'svg-label', 'end'); });
    const valPts = [[xe(0), y(S)]].concat(val.map((vv, i) => [xe(i + 1), y(vv)]));
    // invested capital steps up when the contribution is booked (start of the month) and stays level
    const invPts = [[xe(0), y(S)]];
    inv.forEach((vv, i) => { invPts.push([xe(i), y(vv)]); invPts.push([xe(i + 1), y(vv)]); });
    const f1 = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    // gain area green above the invested capital, red where the value dips below it (clip paths per side)
    const area = `M${valPts.map(f1).join(' L')} L${invPts.slice().reverse().map(f1).join(' L')} Z`;
    const invClip = `M${invPts.map(f1).join(' L')} L${xe(n)},${y(lo)} L${xe(0)},${y(lo)} Z`;
    const defs = s('defs', {}, svg);
    const cUp = s('clipPath', { id: 'eiUp' }, defs); s('path', { d: `M${invPts.map(f1).join(' L')} L${xe(n)},${T - 20} L${xe(0)},${T - 20} Z` }, cUp);
    const cDn = s('clipPath', { id: 'eiDn' }, defs); s('path', { d: invClip }, cDn);
    s('path', { d: area, class: 'gain-area', 'clip-path': 'url(#eiUp)' }, svg);
    s('path', { d: area, class: 'loss-area', 'clip-path': 'url(#eiDn)' }, svg);
    s('path', { d: `M${invPts.map(f1).join(' L')}`, class: 'l-invest' }, svg);
    s('path', { d: `M${valPts.map(f1).join(' L')}`, class: 'l-actual' }, svg);
    s('circle', { cx: xe(n), cy: y(E), r: 3.5, class: 'dot-actual' }, svg);
    let ya = y(E) + 4, yb = y(inv[n - 1]) + 4;
    if (Math.abs(ya - yb) < 16) { if (ya < yb) yb = ya + 16; else ya = yb + 16; }
    text(svg, xe(n) + 8, ya, `Wert ${kfmt(E)}`, 'svg-label-strong');
    text(svg, xe(n) + 8, yb, `eingezahlt ${kfmt(inv[n - 1])}`, 'svg-label');
    // band 2: market gain per month around zero, same months
    const mk = ks.map((k) => PRODUCTS.reduce((a, p) => a + PV[p.id].mkt[k], 0));
    const mmax = Math.max(...mk.map(Math.abs), 1);
    const zb = split + (H - 26 - split) / 2 + 6, bh = (H - 26 - split) / 2 - 8;
    s('line', { x1: L, x2: W - R2, y1: split, y2: split, class: 'axis' }, svg);
    text(svg, L, split + 14, 'Markt je Monat', 'svg-label-line');
    s('line', { x1: L, x2: W - R2, y1: zb, y2: zb, class: 'axis' }, svg);
    text(svg, L - 8, zb + 4, '0', 'svg-label', 'end');
    mk.forEach((m2, i) => bar(svg, xc(i), Math.max(2, bw * 0.5), zb, zb - (m2 / mmax) * bh, m2 >= 0 ? 'bar-pos' : 'bar-neg2', `${MONTHS_ALL[ks[i]].long}: ${eur(m2, { cents: false, sign: true })}`));
    const step = Math.max(1, Math.ceil(n / 9));
    for (let i = n - 1; i >= 0; i -= step) text(svg, xc(i), H - 6, labelShort(ks[i], i === 0 || MONTHS_ALL[ks[i]].m === 0), 'svg-label', 'middle');
  };

  // ---------- 4.4 Rendite und Kennzahlen ----------
  R.prendite = (v, st) => {
    const ks = winKs(st.period);
    const all = stats(PRODUCTS, ks);
    const clsStats = CLS.map((c) => ({ c, st: stats(PRODUCTS.filter((p) => p.cls === c), ks) }));
    const benches = ['Weltindex', 'USA-Index', 'Europaindex'].map((b) => ({ b, tw: ks.reduce((a, k) => a * (1 + BENCHES[b][k]), 1) - 1 }));
    const years = [2023, 2024, 2025, 2026];
    const allRets = MONTHS_ALL.map((mo) => mo.k);
    const kpis = [
      ['TTWROR', pct(all.tw, true), 'zeitgewichtet'], ['IRR', pct(all.irr, true), ks.length > 12 ? 'geldgewichtet, p. a.' : 'geldgewichtet'],
      ['Volatilität', pct(all.vol), 'p. a.'], ['Max. Rückgang', pct(all.mdd), 'vom Hoch'],
      ['Sharpe-Quote', nf2.format(all.sharpe), 'sicherer Zins 2,5 %'], ['Beta', nf2.format(all.beta), 'gegen Weltindex'],
      ['Gegen Weltindex', pp(all.tw - all.btw), 'Differenz TTWROR'], ['Positive Monate', pct(all.pos, false, 0), `${Math.round(all.pos * ks.length)} von ${ks.length}`],
      ['Bester Monat', pct(all.best, true), ''], ['Schlechtester Monat', pct(all.worst, true), ''],
    ];
    v.innerHTML = `
      <section class="rs rs-wide" aria-labelledby="reT">
        <div class="tbd-head"><h2 id="reT">Portfolio · ${esc(wname(st.period))}</h2><span class="tbd-state"><span class="${all.tw >= all.btw ? 'ok' : 'ink'}">${pp(all.tw - all.btw)} gegen den Weltindex</span></span></div>
        <div class="kpi-grid">${kpis.map(([l, val, sub]) => `<div><span class="tech">${l}</span><strong>${val}</strong><small>${esc(sub)}</small></div>`).join('')}</div>
        <svg class="rchart" id="reChart" role="img" aria-label="Portfolio indexiert gegen drei Indizes"></svg>
        <div class="legend" aria-hidden="true"><span><svg viewBox="0 0 26 8"><path class="l-actual" d="M0 4h26"/></svg>Portfolio</span>${benches.map((b, i) => `<span><svg viewBox="0 0 26 8"><path class="l-bench l-bench-${i + 1}" d="M0 4h26"/></svg>${esc(b.b)} ${pct(b.tw, true)}</span>`).join('')}</div>
      </section>
      <section class="rs rs-wide" aria-labelledby="reK">
        <div class="tbd-head"><h2 id="reK">Anlageklassen nebeneinander</h2></div>
        <svg class="rchart" id="reCls" role="img" aria-label="Anlageklassen indexiert"></svg>
        <div class="legend" aria-hidden="true">${clsStats.map((c, i) => `<span><svg viewBox="0 0 26 8"><path class="l-cls l-cls-${i + 1}" d="M0 4h26"/></svg>${esc(c.c)}</span>`).join('')}</div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Klasse und Produkt</th><th class="tech n">Wert</th><th class="tech n">TTWROR</th><th class="tech n">gegen Index</th><th class="tech n">Volatilität</th><th class="tech n">Max. Rückgang</th><th class="tech n">Sharpe</th></tr></thead>
        ${clsStats.map((c) => { const ps = PRODUCTS.filter((p) => p.cls === c.c); return `<tbody><tr class="rp-grp"><td><strong>${esc(c.c)}</strong></td><td class="n"><strong>${eur(c.st.E, { cents: false })}</strong></td><td class="n"><strong>${pct(c.st.tw, true)}</strong></td><td class="n"><span class="${c.st.tw >= c.st.btw ? 'txt-good' : 'txt-bad'}">${pp(c.st.tw - c.st.btw)}</span></td><td class="n">${pct(c.st.vol)}</td><td class="n">${pct(c.st.mdd)}</td><td class="n">${nf2.format(c.st.sharpe)}</td></tr>
          ${ps.length > 1 ? ps.map((p) => { const x = stats([p], ks); return `<tr><td class="lv-1">${prodLink(p)}</td><td class="n">${eur(x.E, { cents: false })}</td><td class="n">${pct(x.tw, true)}</td><td class="n"><span class="${x.tw >= x.btw ? 'txt-good' : 'txt-bad'}">${pp(x.tw - x.btw)}</span></td><td class="n">${pct(x.vol)}</td><td class="n">${pct(x.mdd)}</td><td class="n">${nf2.format(x.sharpe)}</td></tr>`; }).join('') : ''}</tbody>`; }).join('')}</table></div>
      </section>
      <section class="rs rs-wide" aria-labelledby="reH">
        <div class="tbd-head"><h2 id="reH">Monatsrenditen, Monat × Jahr</h2></div>
        <div class="rscroll"><table class="rtable rgrid rg-ret"><thead><tr><th class="tech rg-first">Jahr</th>${MONTHS.map((m) => `<th class="tech n">${m}</th>`).join('')}<th class="tech n rg-sum">Jahr</th><th class="tech n">Weltindex</th></tr></thead>
        <tbody>${years.map((y) => { let p1 = 1, pb = 1; const hs = { mean: 0, dev: Math.max(...allRets.map((k) => Math.abs(RET[k]))) }; const cells = MONTHS.map((_, m) => { const k = RC.idx(y, m); if (k < 0) return '<td class="n muted">–</td>'; p1 *= 1 + RET[k]; pb *= 1 + BENCHES.Weltindex[k]; return `<td ${RC.heatAttr(RET[k], hs, 'high', 0)}>${(RET[k] < 0 ? MINUS : '') + nf1.format(Math.abs(RET[k]) * 100)}</td>`; }).join(''); return `<tr><th scope="row" class="rg-first">${y}${y === 2023 ? ' <small class="muted">ab Okt</small>' : y === 2026 ? ' <small class="muted">bis 17.09.</small>' : ''}</th>${cells}<td class="n rg-sum"><strong>${pct(p1 - 1, true)}</strong></td><td class="n muted">${pct(pb - 1, true)}</td></tr>`; }).join('')}</tbody></table></div>
        <p class="vnote">Werte in Prozent. Grün = Gewinnmonat, Rot = Verlustmonat; je kräftiger, desto größer der Ausschlag.</p>
      </section>`;
    wireProducts(v);
    const draw = (svg, lines, clsOf, labels) => {
      const n = ks.length + 1;
      const allv = lines.flat();
      const g = scaffold(svg, n, Math.min(...allv), Math.max(...allv), { zero: false, yfmt: (x) => nf0.format(x), R: 96, L: 44, labelAt: (i) => (i === 0 ? '' : labelShort(ks[i - 1], i === 1)), maxLabels: 8, pad: 0.08 });
      if (!g) return;
      s('line', { x1: g.f.L, x2: g.f.W - g.f.R, y1: g.y(100), y2: g.y(100), class: 'axis' }, svg);
      const ends = [];
      lines.forEach((ln, i) => { path(svg, ln.map((x, j) => [g.x(j), g.y(x)]), clsOf(i)); ends.push({ y: g.y(ln[n - 1]) + 4, t: `${labels[i]} ${nf0.format(ln[n - 1])}`, i }); });
      ends.sort((a, b) => a.y - b.y).forEach((e, j, arr) => { if (j && e.y - arr[j - 1].y < 14) e.y = arr[j - 1].y + 14; text(svg, g.x(n - 1) + 8, e.y, e.t, e.i === 0 ? 'svg-label-strong' : 'svg-label'); });
    };
    draw($('#reChart'), [indexLine(all.rets)].concat(benches.map((b) => indexLine(ks.map((k) => BENCHES[b.b][k])))), (i) => (i ? `l-bench l-bench-${i}` : 'l-actual'), ['Portfolio', 'Welt', 'USA', 'Europa']);
    draw($('#reCls'), clsStats.map((c) => indexLine(c.st.rets)), (i) => `l-cls l-cls-${i + 1}`, clsStats.map((c) => c.c));
  };

  // ---------- 4.5 Kosten, Steuern, Erträge ----------
  R.psteuern = (v) => {
    const k12 = range(RC.LAST_FULL - 11, RC.LAST_FULL); // the same 12 months as Reports 2.6
    // distributions: the ETF income in the ledger is net of KESt; gross it up here
    const distNet = sumK(k12, (k) => ([2, 5, 8, 11].includes(MONTHS_ALL[k].m) ? INCOME[k].Kapitalerträge * 0.7 : 0));
    const p2pNet = sumK(k12, (k) => PV.p2p.v[k] * 0.0052 * (1 - KEST));
    const distGross = distNet / (1 - KEST), p2pGross = p2pNet / (1 - KEST);
    const ageTax = PV.etfw.v[35] * 0.009 * KEST; // ausschüttungsgleiche Erträge of the accumulating ETF (sample rate)
    const fees = { order: 12 * 1.5 + 2 * 4.9, spread: sumK(k12, (k) => (PV.btc.contrib[k] + PV.eth.contrib[k]) * 0.01), ter: PRODUCTS.reduce((a, p) => a + RC.terOf(p, k12), 0), fx: 0 };
    const feeSum = fees.order + fees.spread + fees.ter;
    const taxPaid = (distGross - distNet) + (p2pGross - p2pNet) + ageTax;
    const gross = distGross + p2pGross;
    const rows = PRODUCTS.map((p) => {
      const cost = RC.costOf(p), unreal = RC.gainOf(p);
      return { p, cost, unreal, latent: Math.max(0, unreal) * KEST, ter: RC.terOf(p, k12) };
    });
    const latent = rows.reduce((a, r) => a + r.latent, 0);
    v.innerHTML = `
      <section class="rs rs-main" aria-labelledby="stT">
        <div class="tbd-head"><h2 id="stT">Erträge nach Kosten und Steuern, 12 Monate</h2></div>
        <div class="tbd-fig">${fig(gross - taxPaid - feeSum)}</div>
        ${chain([{ label: 'Erträge brutto', val: eur(gross, { cents: false }) }, { op: MINUS, label: 'KESt', val: eur(taxPaid, { cents: false }) }, { op: MINUS, label: 'Gebühren und TER', val: eur(feeSum, { cents: false }) }, { op: '=', label: 'Netto', val: eur(gross - taxPaid - feeSum, { cents: false }), result: true }], 'Maßkette Kosten und Steuern')}
        <table class="rtable"><tbody>
          <tr class="rp-grp"><td colspan="2"><strong>Erträge brutto</strong></td><td class="n"><strong>${eur(gross)}</strong></td></tr>
          <tr><td class="col-pos">1.1</td><td>Ausschüttungen (ETF Schwellenländer, Aktie A)</td><td class="n">${eur(distGross)}</td></tr>
          <tr><td class="col-pos">1.2</td><td>P2P-Zinsen</td><td class="n">${eur(p2pGross)}</td></tr>
          <tr class="rp-grp"><td colspan="2"><strong>Steuern</strong></td><td class="n"><strong>${eur(-taxPaid)}</strong></td></tr>
          <tr><td class="col-pos">2.1</td><td>KESt 27,5 % auf Ausschüttungen und Zinsen</td><td class="n">${eur(-(distGross - distNet) - (p2pGross - p2pNet))}</td></tr>
          <tr><td class="col-pos">2.2</td><td>KESt auf ausschüttungsgleiche Erträge (ETF Welt, thesaurierend)</td><td class="n">${eur(-ageTax)}</td></tr>
          <tr class="rp-grp"><td colspan="2"><strong>Kosten</strong></td><td class="n"><strong>${eur(-feeSum)}</strong></td></tr>
          <tr><td class="col-pos">3.1</td><td>Ordergebühren Sparplan</td><td class="n">${eur(-fees.order)}</td></tr>
          <tr><td class="col-pos">3.2</td><td>Spread Krypto-Käufe (1 %)</td><td class="n">${eur(-fees.spread)}</td></tr>
          <tr><td class="col-pos">3.3</td><td>Fondskosten (TER, im Kurs)</td><td class="n">${eur(-fees.ter)}</td></tr>
        </tbody></table>
      </section>
      <section class="rs rs-side" aria-labelledby="stL">
        <div class="tbd-head"><h2 id="stL">Bei Verkauf fällig</h2></div>
        <div class="tbd-fig tbd-fig-s">${fig(latent)}</div>
        <p class="vnote">Latente KESt 27,5 % auf die Kursgewinne, wenn heute alles verkauft würde. Verluste werden im selben Jahr gegengerechnet (Verlustausgleich), Krypto seit 2022 ebenso mit 27,5 %. Beispielrechnung, keine Steuerberatung.</p>
        <dl class="rc-facts rc-facts-1">
          <div><dt class="tech">Kostenquote</dt><dd>${pct(feeSum / PRODUCTS.reduce((a, p) => a + p.now, 0), false, 2)}<small>Ziel ≤ 0,30 % (Konzept 8)</small></dd></div>
          <div><dt class="tech">Steuern in % der Erträge</dt><dd>${pct(taxPaid / gross, false, 0)}</dd></div>
        </dl>
      </section>
      <section class="rs rs-wide" aria-labelledby="stP">
        <div class="tbd-head"><h2 id="stP">Je Produkt</h2></div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Produkt</th><th class="tech n">Einstand</th><th class="tech n">Wert</th><th class="tech n">Kursgewinn</th><th class="tech n">latente KESt</th><th class="tech n">Fondskosten 12 M</th><th class="tech">Ertragsart</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${prodLink(r.p)}<small class="muted">${esc(r.p.depot)}</small></td><td class="n">${eur(r.cost, { cents: false })}</td><td class="n">${eur(r.p.now, { cents: false })}</td><td class="n"><span class="${r.unreal >= 0 ? 'txt-good' : 'txt-bad'}">${eur(r.unreal, { cents: false, sign: true })}</span></td><td class="n">${eur(-r.latent, { cents: false })}</td><td class="n">${r.p.ter ? `${eur(r.ter, { cents: false })}<small class="muted">TER ${pct(r.p.ter, false, 2)}</small>` : '–'}</td><td><small>${{ etfw: 'thesaurierend', etfem: 'ausschüttend', akta: 'Dividende', btc: 'Kursgewinn', eth: 'Kursgewinn', p2p: 'Zinsen' }[r.p.id]}</small></td></tr>`).join('')}
          <tr class="is-total"><td>Summe</td><td class="n">${eur(rows.reduce((a, r) => a + r.cost, 0), { cents: false })}</td><td class="n">${eur(rows.reduce((a, r) => a + r.p.now, 0), { cents: false })}</td><td class="n">${eur(rows.reduce((a, r) => a + r.unreal, 0), { cents: false, sign: true })}</td><td class="n">${eur(-latent, { cents: false })}</td><td class="n">${eur(rows.reduce((a, r) => a + r.ter, 0), { cents: false })}</td><td></td></tr></tbody></table></div>
      </section>`;
    wireProducts(v);
  };
})();
