/* Finanz-App prototype · Reports, group 4: Überblick. Sample data only. */
(() => {
  'use strict';

  const RC = window.RC;
  const {
    R, esc, icon, eur, pct, fig, chain, tri, sw, delta, sumK, nf0, nf1, nf2, MINUS, MONTHS, MONTHS_LONG, MONTHS_ALL, LAST_FULL,
    CATS, SPEND, PLAN, INCOME, INCOME_TYPES, SALARY, incomeOf, consumptionOf, classOf, NW, OWN, MKT, RET, RULES, PAYEE,
    s, text, path, scaffold, bar, tip, labelShort, windowK, periodName, CLASS_LABEL, heat, kfmt, priceAt,
  } = RC;
  const $ = (sel, root = document) => root.querySelector(sel);
  const range = (a, b) => { const out = []; for (let k = Math.max(0, a); k <= b; k++) out.push(k); return out; };
  const yearKs = (y) => MONTHS_ALL.filter((mo) => mo.y === y && mo.k <= LAST_FULL).map((mo) => mo.k);
  const CONS = CATS.filter((c) => c.cls !== 'future');

  // ---------- 5.1 Jahresreport (two printable sheets) ----------
  R.jahresreport = (v, st) => {
    const y = st.year, ks = yearKs(y), pks = yearKs(y - 1);
    const E = sumK(ks, incomeOf), K = sumK(ks, consumptionOf), Z = sumK(ks, (k) => classOf(k, 'future'));
    const nw0 = ks[0] ? NW[ks[0] - 1] : NW.start, nw1 = NW[ks[ks.length - 1]];
    const own = sumK(ks, (k) => OWN[k]), mkt = sumK(ks, (k) => MKT[k]);
    const partial = ks.length < 12;
    const cats = CONS.map((c) => ({ c, v: sumK(ks, (k) => SPEND[k][c.id]), p: pks.length ? sumK(pks, (k) => SPEND[k][c.id]) * (ks.length / pks.length) : null })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 10);
    const cls = { need: sumK(ks, (k) => classOf(k, 'need')), want: sumK(ks, (k) => classOf(k, 'want')), future: Z };
    const idx = y === 2026 ? 11 : y === 2025 ? 2 : 0;
    const rs = RULES.map((r) => r.hist[idx]);
    const ok = rs.filter((x) => x === 'ok').length;
    const finds = []; // [Befund, Betrag, Regel]
    const topM = ks.reduce((a, k) => (consumptionOf(k) > consumptionOf(a) ? k : a), ks[0]);
    finds.push([`Teuerster Monat: ${MONTHS_ALL[topM].long} (Konsum)`, eur(-consumptionOf(topM), { cents: false }), '–']);
    SALARY.forEach((sa, i) => { if (i && sa.from.startsWith(String(y))) finds.push([`Gehaltserhöhung ab ${MONTHS_LONG[+sa.from.slice(5) - 1]}, netto je Monat`, eur(sa.net - SALARY[i - 1].net, { sign: true }), '–']); });
    const sz = sumK(ks, (k) => INCOME[k].Sonderzahlung);
    if (sz) finds.push(['Sonderzahlungen, davon 70 % in ETF und Notgroschen', eur(sz, { cents: false, sign: true }), 'R12']);
    const pc = CATS.filter((c) => c.kind === 'fix' && !c.transfer && (c.price || []).some(([from], i) => i > 0 && from.startsWith(String(y))));
    if (pc.length) finds.push([`Preisänderungen: ${pc.map((c) => c.name).join(', ')}`, eur(pc.reduce((a, c) => { const i = c.price.findIndex(([from]) => from.startsWith(String(y))); return a + (c.price[i][1] - (i ? c.price[i - 1][1] : 0)) * 12; }, 0), { sign: true }) + ' p. a.', 'R10']);
    const best = ks.reduce((a, k) => (RET[k] > RET[a] ? k : a), ks[0]), worst = ks.reduce((a, k) => (RET[k] < RET[a] ? k : a), ks[0]);
    finds.push([`Depot: bester Monat ${MONTHS_ALL[best].long}, schwächster ${MONTHS_ALL[worst].long}`, `${pct(RET[best], true)} / ${pct(RET[worst], true)}`, '–']);
    const tb = (sheet) => RC.sheetTitle([['Benennung', 'Jahresreport', 'ps-tb-name'], ['Jahr', `${y}${partial ? ` · Jän–${MONTHS[MONTHS_ALL[ks[ks.length - 1]].m]}` : ''}`], ['Stand', '17.09.2026'], ['Zeichnungs-Nr.', `FA-R5.1-${y}`], ['Einheit', '€'], ['Blatt', `${sheet} / 2`]]);
    v.innerHTML = `<div class="psheet-wrap psheet-stack">
      <article class="psheet" aria-label="Jahresreport ${y}, Blatt 1">
        ${RC.sheetZones()}
        <div class="ps-body">
          <header class="ps-head">
            <div><h2>${y}${partial ? ` <small>bis ${MONTHS_ALL[ks[ks.length - 1]].long}</small>` : ''}</h2></div>
            <div class="ps-fig"><span class="tech">Nettovermögen</span><strong>${fig(nw1)}</strong><span>${eur(nw1 - nw0, { cents: false, sign: true })} im Jahr</span></div>
          </header>
          ${chain([{ label: 'Anfang', val: eur(nw0, { cents: false }) }, { op: '+', label: 'Eigenleistung', val: eur(own, { cents: false }) }, { op: mkt >= 0 ? '+' : MINUS, label: 'Markt', val: eur(Math.abs(mkt), { cents: false }) }, { op: '=', label: 'Ende', val: eur(nw1, { cents: false }), result: true }], 'Maßkette Nettovermögen im Jahr')}
          <div class="ps-kpis">
            <div><span class="tech">Einnahmen</span><strong>${eur(E, { cents: false })}</strong></div>
            <div><span class="tech">Konsum</span><strong>${eur(K, { cents: false })}</strong></div>
            <div><span class="tech">Zukunft</span><strong>${eur(Z, { cents: false })}</strong></div>
            <div><span class="tech">Sparquote</span><strong>${pct((E - K) / E)}</strong></div>
            <div><span class="tech">Rendite Depot</span><strong>${pct(ks.reduce((a, k) => a * (1 + RET[k]), 1) - 1, true)}</strong></div>
          </div>
          <div class="ps-grid ps-grid-1">
            <section class="ps-sec"><h3 class="ps-h"><span>A</span>Cashflow je Monat</h3><svg class="ps-chart" id="jrCf" role="img" aria-label="Einnahmen als Linie, Konsum als Säulen, je Monat"></svg>
              <div class="legend" aria-hidden="true"><span><i class="lg-sq sw-need"></i>Bedarf</span><span><i class="lg-sq sw-want"></i>Wunsch</span><span><svg viewBox="0 0 26 8"><path class="l-actual" d="M0 4h26"/></svg>Einnahmen</span></div></section>
            <section class="ps-sec"><h3 class="ps-h"><span>B</span>Nettovermögen</h3><svg class="ps-chart ps-chart-s" id="jrNw" role="img" aria-label="Nettovermögen am Monatsende"></svg></section>
            <section class="ps-sec"><h3 class="ps-h"><span>C</span>Stückliste der Monate</h3>
              <table class="ps-cats ps-months"><thead><tr><th class="tech">Monat</th><th class="tech n">Einnahmen</th><th class="tech n">Konsum</th><th class="tech n">Zukunft</th><th class="tech n">Sparquote</th><th class="tech n">Nettovermögen</th></tr></thead>
              <tbody>${ks.map((k) => `<tr><td>${MONTHS_LONG[MONTHS_ALL[k].m]}</td><td class="n">${nf0.format(incomeOf(k))}</td><td class="n">${nf0.format(consumptionOf(k))}</td><td class="n">${nf0.format(classOf(k, 'future'))}</td><td class="n">${pct((incomeOf(k) - consumptionOf(k)) / incomeOf(k), false, 0)}</td><td class="n">${nf0.format(NW[k])}</td></tr>`).join('')}
                <tr class="is-total"><td>Summe</td><td class="n">${nf0.format(E)}</td><td class="n">${nf0.format(K)}</td><td class="n">${nf0.format(Z)}</td><td class="n">${pct((E - K) / E, false, 0)}</td><td class="n">${nf0.format(nw1)}</td></tr></tbody></table></section>
          </div>
          ${tb(1)}
        </div>
      </article>
      <article class="psheet" aria-label="Jahresreport ${y}, Blatt 2">
        ${RC.sheetZones()}
        <div class="ps-body">
          <header class="ps-head"><div><h2>${y} · Ausgaben und Regeln</h2></div></header>
          <div class="ps-grid">
            <section class="ps-sec ps-top"><h3 class="ps-h"><span>D</span>Größte Kategorien</h3>
              <table class="ps-cats"><tbody>${cats.map((x) => `<tr><td>${sw(x.c.cls)}${esc(x.c.name)}</td><td class="ps-bar"><i style="width:${(x.v / cats[0].v) * 100}%"></i></td><td class="n">${eur(x.v, { cents: false })}</td><td class="n">${x.p ? `<small>${pct(x.v / x.p - 1, true, 0)}</small>` : ''}</td></tr>`).join('')}</tbody></table>
              <p class="ps-note">${pks.length ? `Rechts: Veränderung zu ${y - 1}${partial || pks.length < 12 ? ', auf gleiche Monatszahl umgerechnet' : ''}.` : ''}</p></section>
            <section class="ps-sec"><h3 class="ps-h"><span>E</span>Verteilung 50/30/20</h3>${RC.split523(RC.alloc(ks))}</section>
            <section class="ps-sec"><h3 class="ps-h"><span>F</span>Finanz-Check zum Jahresende</h3>
              <div class="ps-kpi"><strong>${ok}</strong><span>von 16 Regeln erfüllt</span></div>
              <div class="chk-cells ps-cells">${rs.map((c) => `<span class="cell cell-${c}"></span>`).join('')}</div>
              <p class="ps-note">Verletzt: ${RULES.filter((r, i) => rs[i] === 'bad').map((r) => `${r.id} ${esc(r.name)}`).join(', ') || 'keine'}</p></section>
            <section class="ps-sec ps-wide"><h3 class="ps-h"><span>G</span>Kategorie × Monat</h3>
              ${RC.rowsTable(cats.map((x) => ({ label: x.c.name, kind: 'cat', sw: x.c.cls, vals: Array.from({ length: 12 }, (_, m) => { const kk = RC.idx(y, m); return kk >= 0 && kk <= LAST_FULL ? SPEND[kk][x.c.id] : null; }) })), MONTHS, { total: true, cls: 'ps-heat' })}
              <p class="ps-note">Tönung je Zeile: der teuerste Monat einer Kategorie ist am dunkelsten.</p></section>
            <section class="ps-sec ps-wide ps-rev"><h3 class="ps-h"><span>H</span>Revisionen des Jahres</h3>
              ${RC.revTable(finds.slice(0, 6), 'Keine Auffälligkeiten.')}</section>
          </div>
          ${tb(2)}
        </div>
      </article></div>`;
    const svg = $('#jrCf');
    const g = scaffold(svg, 12, 0, Math.max(...ks.map(incomeOf), ...ks.map(consumptionOf)), { labelAt: (i) => MONTHS[i], L: 44, maxLabels: 12 });
    if (g) {
      ks.forEach((k) => { const m = MONTHS_ALL[k].m, n = classOf(k, 'need'), w = classOf(k, 'want'); bar(svg, g.x(m), g.bw * 0.56, g.y(0), g.y(n), 'f-need'); bar(svg, g.x(m), g.bw * 0.56, g.y(n), g.y(n + w), 'f-want'); });
      path(svg, ks.map((k) => [g.x(MONTHS_ALL[k].m), g.y(incomeOf(k))]), 'l-actual');
    }
    const svg2 = $('#jrNw');
    const vals = [nw0, ...ks.map((k) => NW[k])];
    const g2 = scaffold(svg2, 13, Math.min(...vals), Math.max(...vals), { zero: false, labelAt: (i) => (i === 0 ? 'Start' : MONTHS[i - 1]), L: 44, maxLabels: 7, pad: 0.1 });
    if (g2) { path(svg2, vals.map((x, i) => [g2.x(i), g2.y(x)]), 'l-actual'); s('circle', { cx: g2.x(vals.length - 1), cy: g2.y(nw1), r: 3.5, class: 'dot-actual' }, svg2); }
  };

  // ---------- 5.2 Finanz-Check-Verlauf ----------
  // Stage model (user decision 29.09.2026): rules from I Will Teach You to Be Rich (IWT), Get Good with Money (GGWM),
  // Your Money or Your Life (YMOYL) and Everyday Millionaires (EM), by net worth up to 10.000 / 100.000 / 1 Mio. €.
  const STAGES = [
    { no: 1, name: 'Fundament', from: 0, to: 10000, rules: [
      ['Nudel-Budget kennen: das Nötigste je Monat', 'GGWM', 'ok', '2.340 € je Monat'],
      ['Starter-Notgroschen: 1 Monat Nudel-Budget', 'GGWM', 'ok', 'erreicht'],
      ['Kreditkarte immer voll zurückzahlen', 'IWT · R06', 'ok', 'Saldo gedeckt'],
      ['Automatisieren: am Gehaltstag verteilen', 'IWT · R04', 'ok', 'aktiv'],
    ] },
    { no: 2, name: 'Aufbau', from: 10000, to: 100000, rules: [
      ['15 % des Bruttoeinkommens investieren', 'EM', 'warn', '11,5 % · fehlen 2.700 € im Jahr'],
      ['Notgroschen 3 bis 6 Monate Bedarf', 'GGWM · R02', 'bad', '2,4 Monate'],
      ['Bewusster Ausgabenplan: Fix 50–60 %, Investieren ≥ 10 %, Genuss 20–35 %', 'IWT', 'ok', () => { const al = RC.alloc(range(LAST_FULL - 11, LAST_FULL)); const p = ['need', 'want', 'future'].map((c) => Math.round((al[c] / al.income) * 100)); const rest = 100 - p[0] - p[1] - p[2]; return `Bedarf ${p[0]} %, Wunsch ${p[1]} %, Zukunft ${p[2]} %, ${rest < 0 ? `aus Guthaben ${MINUS}${-rest}` : `übrig ${rest}`} % (12 M, Zwölftel)`; }],
      ['Kredite über 5 % Zins zuerst tilgen', 'EM · R09', 'ok', 'Sondertilgung 300 €'],
      ['Kein Konsum- oder Autokredit', 'EM', 'ok', 'keiner offen'],
      ['Echten Stundenlohn kennen: Ausgaben in Lebenszeit', 'YMOYL', 'ok', '29 € je Stunde'],
      ['Versicherungen vollständig: Haushalt, Haftpflicht, Berufsunfähigkeit', 'GGWM', 'warn', 'Berufsunfähigkeit fehlt'],
    ] },
    { no: 3, name: 'Freiheit', from: 100000, to: 1000000, rules: [
      ['Crossover Point: 4 % Kapitalertrag deckt die Ausgaben', 'YMOYL · R16', null, 'heute 8,9 %'],
      ['Kostenquote ≤ 0,3 %, Rebalancing im Band', 'IWT · R13', null, ''],
      ['Testament und Vorsorgevollmacht', 'GGWM', null, ''],
      ['Steuern gestalten: Verlustausgleich, Freibeträge', 'EM', null, ''],
    ] },
  ];
  R.finanzcheck = (v) => {
    const nw = NW[35];
    const cur = STAGES.find((x) => nw >= x.from && nw < x.to) || STAGES[STAGES.length - 1];
    const next = STAGES.find((x) => x.no === cur.no + 1);
    const prog = (nw - cur.from) / (cur.to - cur.from);
    const stl2 = { ok: ['check-circle', 'erfüllt', 'ok'], warn: ['alert', 'offen', ''], bad: ['alert-circle', 'verletzt', 'bad'] };
    const cnt = (i) => RULES.filter((r) => r.hist[i] === 'ok').length;
    const now = { ok: cnt(11), warn: RULES.filter((r) => r.hist[11] === 'warn').length, bad: RULES.filter((r) => r.hist[11] === 'bad').length };
    const ks = range(24, 35);
    const order = { bad: 0, warn: 1, ok: 2 };
    const rules = RULES.slice().sort((a, b) => order[a.hist[11]] - order[b.hist[11]] || a.id.localeCompare(b.id));
    const since = (r) => { let i = 11; while (i > 0 && r.hist[i - 1] === r.hist[11]) i--; return i === 0 ? 'seit über 12 Monaten' : `seit ${MONTHS_ALL[ks[i]].long}`; };
    const act = { R02: 'Notgroschen-Rate von 300 € auf 450 € erhöhen, bis 3 Monate erreicht sind.', R15: 'Keine neuen Käufe in Krypto, P2P, Einzelaktien; Sparplan nur ETF.', R01: 'Wunsch-Envelopes im Oktober um 60 € kürzen.', R03: 'Puffer im Giro aufbauen, Überschüsse erst ab 30 Tagen Geldalter abziehen.', R13: 'Nächste Sparrate vollständig in Schwellenländer.' };
    const stl = { ok: ['check-circle', 'erfüllt', 'ok'], warn: ['alert', 'Warnung', ''], bad: ['alert-circle', 'verletzt', 'bad'] };
    v.innerHTML = `
      <section class="rs rs-wide" aria-labelledby="fcS">
        <div class="tbd-head"><h2 id="fcS">Stufe ${cur.no} von 3: ${esc(cur.name)}</h2><span class="tbd-state"><span class="ink">Nettovermögen ${eur(nw, { cents: false })}</span></span></div>
        <div class="stages">${STAGES.map((x) => `<div class="stage${x === cur ? ' is-cur' : x.no < cur.no ? ' is-done' : ''}"><strong><span class="rtb-pos">${x.no}</span> ${esc(x.name)}</strong><small>${x.from ? `ab ${eur(x.from, { cents: false })}` : 'Start'} bis ${eur(x.to, { cents: false })}</small>${x === cur ? `<span class="gbar gbar-s"><i style="width:${Math.round(prog * 100)}%"></i></span><small>${pct(prog, false, 0)} · noch ${eur(cur.to - nw, { cents: false })}</small>` : ''}</div>`).join('')}</div>
        <div class="stage-rules">
          <div><h3 class="tech">Regeln dieser Stufe</h3><table class="rtable"><tbody>${cur.rules.map(([r, src, stt, val]) => { const [ic, l, c] = stl2[stt]; return `<tr><td><strong>${esc(r)}</strong><small class="muted">${esc(src)}</small></td><td>${esc(typeof val === 'function' ? val() : val)}</td><td><span class="status ${c}">${icon(ic)}${l}</span></td></tr>`; }).join('')}</tbody></table></div>
          ${next ? `<div><h3 class="tech">Als Nächstes: Stufe ${next.no} ${esc(next.name)}</h3><ul class="stage-next">${next.rules.map(([r, src, , val]) => `<li><strong>${esc(r)}</strong><small class="muted">${esc(src)}${val ? ` · ${esc(val)}` : ''}</small></li>`).join('')}</ul></div>` : ''}
        </div>
        <p class="vnote">Regeln aus I Will Teach You to Be Rich (IWT), Get Good with Money (GGWM), Your Money or Your Life (YMOYL) und Everyday Millionaires (EM), in den Einstellungen änderbar. Haltung: Kein Report bewertet eine Ausgabe als Fehler; Regeln zeigen den Abstand zum Ziel.</p>
      </section>
      <section class="rs rs-main" aria-labelledby="fcT">
        <div class="tbd-head"><h2 id="fcT">Heute</h2><span class="tbd-state"><span class="${now.bad ? 'neg-alert' : 'ok'}">${icon(now.bad ? 'alert-circle' : 'check-circle', 'icon icon-sm')}${now.bad} verletzt, ${now.warn} Warnung</span></span></div>
        <div class="tbd-fig">${now.ok}<span class="cents"> von 16 erfüllt</span></div>
        <div class="chk-cells fc-cells" role="img" aria-label="${now.ok} erfüllt, ${now.warn} Warnung, ${now.bad} verletzt">${RULES.map((r) => `<span class="cell cell-${r.hist[11]}" title="${r.id} ${esc(r.name)}"></span>`).join('')}</div>
        <svg class="rchart rchart-s" id="fcChart" role="img" aria-label="Anzahl erfüllter Regeln je Monatsende"></svg>
      </section>
      <section class="rs rs-side" aria-labelledby="fcA">
        <div class="tbd-head"><h2 id="fcA">Maßnahmen</h2></div>
        <table class="rev-table"><tbody>${rules.filter((r) => r.hist[11] !== 'ok').map((r, i) => `<tr class="${r.hist[11] === 'bad' ? 'rev-row is-urgent' : 'rev-row'}"><td class="rev-mark">${tri(String.fromCharCode(65 + i))}</td><td class="rev-what"><strong>${r.id} ${esc(r.name)}</strong><span>${esc(act[r.id] || 'Schwelle prüfen.')}</span></td></tr>`).join('')}</tbody></table>
      </section>
      <section class="rs rs-wide" aria-labelledby="fcL">
        <div class="tbd-head"><h2 id="fcL">Regelwerk R01–R16, 12 Monatsenden</h2></div>
        <div class="rscroll"><table class="rtable fc-table"><thead><tr><th class="tech">Regel</th><th class="tech">Stand</th><th class="tech">Schwelle</th><th class="tech">Verlauf ${esc(labelShort(ks[0], true))} bis heute</th><th class="tech">Status</th></tr></thead>
        <tbody>${rules.map((r) => { const [ic, l, c] = stl[r.hist[11]]; return `<tr><td><span class="rtb-pos">${r.id}</span><strong>${esc(r.name)}</strong></td><td>${esc(r.val)}</td><td class="muted">${esc(r.goal)}</td>
          <td><span class="fc-strip" role="img" aria-label="Verlauf: ${r.hist.map((h) => stl[h][1]).join(', ')}">${r.hist.map((h, i) => `<span class="cell cell-${h}" title="${MONTHS_ALL[ks[i]].long}: ${stl[h][1]}"></span>`).join('')}</span></td>
          <td><span class="status ${c}">${icon(ic)}${l}</span><small class="muted fc-since">${since(r)}</small></td></tr>`; }).join('')}</tbody></table></div>
        <p class="vnote">Schwellen sind Vorschläge aus dem Regelwerk und unter Einstellungen änderbar; jede Regel lässt sich abschalten.</p>
      </section>`;
    const svg = $('#fcChart');
    const vals = ks.map((_, i) => cnt(i));
    const g = scaffold(svg, 12, 0, 16, { yfmt: (x) => nf0.format(x), labelAt: (i) => labelShort(ks[i]), L: 32 });
    if (!g) return;
    s('path', { d: vals.map((x, i) => `${i ? 'L' : 'M'}${(g.x(i) - g.bw / 2).toFixed(1)},${g.y(x).toFixed(1)} L${(g.x(i) + g.bw / 2).toFixed(1)},${g.y(x).toFixed(1)}`).join(' '), class: 'l-actual' }, svg);
    s('line', { x1: g.f.L, x2: g.f.W - g.f.R, y1: g.y(16), y2: g.y(16), class: 'l-plan' }, svg);
    text(svg, g.x(11) + g.bw / 2, g.y(vals[11]) - 8, `${vals[11]} erfüllt`, 'svg-label-strong', 'end');
  };

  // ---------- 5.3 Explorer ----------
  const DIMS = { kategorie: 'Kategorie', gruppe: 'Gruppe', klasse: 'Klasse', empfaenger: 'Empfänger', einnahme: 'Einnahmenart' };
  const MEAS = { summe: 'Summe', avg: 'Ø je Monat', anzahl: 'Anzahl Zahlungen' };
  const COLS = { monat: 'Monat', quartal: 'Quartal', jahr: 'Jahr', keine: 'keine' };
  const PRESETS = [
    { name: 'Wunsch je Quartal', dim: 'kategorie', cls: 'want', cols: 'quartal', period: '3J', meas: 'summe' },
    { name: 'Gruppen je Monat', dim: 'gruppe', cls: 'alle', cols: 'monat', period: '1J', meas: 'summe' },
    { name: 'Bons je Empfänger', dim: 'empfaenger', cls: 'alle', cols: 'jahr', period: '3J', meas: 'anzahl' },
    { name: 'Einnahmen je Jahr', dim: 'einnahme', cls: 'alle', cols: 'jahr', period: 'Alles', meas: 'summe' },
  ];
  const loadViews = () => { try { return JSON.parse(localStorage.getItem('fa-explorer') || '[]'); } catch (err) { return []; } };
  const saveViews = (xs) => { try { localStorage.setItem('fa-explorer', JSON.stringify(xs)); } catch (err) { /* storage unavailable */ } };
  function explore(q) {
    const ks = windowK(q.period);
    const colsOf = () => {
      if (q.cols === 'keine') return [{ label: 'Zeitraum', ks }];
      const m = new Map();
      ks.forEach((k) => {
        const mo = MONTHS_ALL[k];
        const key = q.cols === 'monat' ? mo.key : q.cols === 'quartal' ? `Q${Math.floor(mo.m / 3) + 1} ${String(mo.y).slice(2)}` : String(mo.y);
        if (!m.has(key)) m.set(key, { label: q.cols === 'monat' ? labelShort(k, true) : key, ks: [] });
        m.get(key).ks.push(k);
      });
      return [...m.values()];
    };
    const cls = (c) => q.cls === 'alle' || c.cls === q.cls;
    let rows = [];
    if (q.dim === 'kategorie') rows = CATS.filter(cls).map((c) => ({ label: c.name, sw: c.cls, fn: (k) => SPEND[k][c.id] }));
    if (q.dim === 'gruppe') rows = [...new Set(CATS.filter(cls).map((c) => c.group))].map((gname) => ({ label: gname, fn: (k) => CATS.filter((c) => cls(c) && c.group === gname).reduce((a, c) => a + SPEND[k][c.id], 0) }));
    if (q.dim === 'klasse') rows = ['need', 'want', 'future'].filter((c) => q.cls === 'alle' || c === q.cls).map((c) => ({ label: CLASS_LABEL[c], sw: c, fn: (k) => classOf(k, c) }));
    if (q.dim === 'einnahme') rows = INCOME_TYPES.map((t) => ({ label: t, fn: (k) => INCOME[k][t] }));
    if (q.dim === 'empfaenger') {
      const names = [...new Set(ks.flatMap((k) => Object.keys(PAYEE[k])))];
      rows = names.map((n) => ({ label: n, fn: (k) => (PAYEE[k][n] ? (q.meas === 'anzahl' ? PAYEE[k][n].n : PAYEE[k][n].amt) : 0) }));
    }
    const cols = colsOf();
    rows = rows.map((r) => {
      const vals = cols.map((c) => { const x = sumK(c.ks, r.fn); return q.meas === 'avg' ? x / c.ks.length : x; });
      const tot = q.meas === 'avg' ? sumK(ks, r.fn) / ks.length : sumK(ks, r.fn);
      return { ...r, vals, tot };
    }).filter((r) => r.tot > 0).sort((a, b) => b.tot - a.tot);
    return { cols, rows, ks };
  }
  R.explorer = (v, st) => {
    st.ex = st.ex || { ...PRESETS[0] };
    const q = st.ex;
    if (q.meas === 'anzahl' && q.dim !== 'empfaenger') q.meas = 'summe';
    const { cols, rows } = explore(q);
    const views = loadViews();
    const fmt = (x) => (q.meas === 'anzahl' ? nf0.format(x) : nf0.format(Math.round(x)));
    const sel = (id, label, map, cur, dis = []) => `<label class="ex-f"><span class="tech">${label}</span><select class="select select-sm" id="${id}">${Object.entries(map).map(([k, l]) => `<option value="${k}"${k === cur ? ' selected' : ''}${dis.includes(k) ? ' disabled' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const isView = (x) => ['dim', 'cls', 'cols', 'period', 'meas'].every((key) => x[key] === q[key]);
    const colTot = cols.map((_, i) => rows.reduce((a, r) => a + r.vals[i], 0));
    rows.forEach((r) => { r.max = Math.max(...r.vals); });
    v.innerHTML = `
      <section class="rs rs-wide" aria-labelledby="exT">
        <div class="tbd-head"><h2 id="exT">Gespeicherte Ansichten</h2></div>
        <div class="chips ex-views" role="group" aria-label="Gespeicherte Ansichten">
          ${PRESETS.map((p, i) => `<button type="button" class="chip" data-preset="${i}" aria-pressed="${isView(p)}">${icon('bookmark', 'icon icon-xs')}${esc(p.name)}</button>`).join('')}
          ${views.map((p, i) => `<span class="chip-pair"><button type="button" class="chip" data-view="${i}" aria-pressed="${isView(p)}">${icon('bookmark', 'icon icon-xs')}${esc(p.name)}</button><button type="button" class="chip-x" data-delview="${i}" aria-label="Ansicht ${esc(p.name)} löschen">${icon('x', 'icon icon-xs')}</button></span>`).join('')}
        </div>
        <div class="ex-bar">
          ${sel('exDim', 'Zeilen', DIMS, q.dim)}
          ${sel('exCls', 'Klasse', { alle: 'alle', need: 'Bedarf', want: 'Wunsch', future: 'Zukunft' }, q.cls)}
          ${sel('exMeas', 'Kennzahl', MEAS, q.meas, q.dim === 'empfaenger' ? [] : ['anzahl'])}
          ${sel('exCols', 'Spalten', COLS, q.cols)}
          ${sel('exPer', 'Zeitraum', { '1M': '1M', '3M': '3M', YTD: 'YTD', '1J': '1J', '3J': '3J', Alles: 'Alles' }, q.period)}
          <form class="ex-save" id="exSave"><label class="ex-f"><span class="tech">Ansicht speichern</span><input class="input input-sm" id="exName" placeholder="Name" maxlength="40" autocomplete="off"></label><button class="btn btn-ghost btn-sm" type="submit">${icon('bookmark')}Speichern</button></form>
        </div>
      </section>
      <section class="rs rs-wide" aria-labelledby="exR">
        <div class="tbd-head"><h2 id="exR">${esc(MEAS[q.meas])} je ${esc(DIMS[q.dim])}${q.cols !== 'keine' ? ` und ${esc(COLS[q.cols])}` : ''} · ${esc(periodName(q.period))}</h2><span class="tbd-state"><span class="ink">${rows.length} Zeilen</span></span></div>
        <div class="rscroll rsticky"><table class="rtable rgrid"><thead><tr><th class="tech rg-first">${esc(DIMS[q.dim])}</th>${cols.map((c) => `<th class="tech n">${esc(c.label)}</th>`).join('')}${cols.length > 1 ? '<th class="tech n rg-sum">Gesamt</th>' : ''}</tr></thead>
        <tbody>${rows.map((r) => `<tr><th scope="row" class="rg-first">${r.sw ? sw(r.sw) : ''}${esc(r.label)}</th>${(() => { const hs = RC.heatStats(r.vals); return r.vals.map((x) => `<td ${x ? RC.heatAttr(x, hs, q.dim === 'einnahme' ? 'high' : 'low') : 'class="n"'}>${x ? fmt(x) : '<span class="muted">·</span>'}</td>`).join(''); })()}${cols.length > 1 ? `<td class="n rg-sum"><strong>${fmt(r.tot)}</strong></td>` : ''}</tr>`).join('') || `<tr><td colspan="${cols.length + 2}" class="muted">Keine Werte für diese Auswahl.</td></tr>`}
          ${rows.length > 1 && q.meas !== 'avg' ? `<tr class="rk-sum"><th scope="row" class="rg-first">Summe</th>${colTot.map((x) => `<td class="n"><strong>${fmt(x)}</strong></td>`).join('')}${cols.length > 1 ? `<td class="n rg-sum"><strong>${fmt(colTot.reduce((a, b) => a + b, 0))}</strong></td>` : ''}</tr>` : ''}</tbody></table></div>
        <p class="vnote">Beträge in Euro, gerundet; Farbe je Zeile gegen ihren Durchschnitt (Rot = teurer, Grün = günstiger; bei Einnahmen umgekehrt). Gespeicherte Ansichten liegen im Prototyp nur in diesem Browser.</p>
      </section>`;
    const set = (key, val) => { q[key] = val; RC.rerender(); };
    [['exDim', 'dim'], ['exCls', 'cls'], ['exMeas', 'meas'], ['exCols', 'cols'], ['exPer', 'period']].forEach(([id, key]) => $(`#${id}`).addEventListener('change', (e) => { set(key, e.target.value); $(`#${id}`).focus(); }));
    v.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => { st.ex = { ...PRESETS[+b.dataset.preset] }; RC.rerender(); $(`[data-preset="${b.dataset.preset}"]`).focus(); }));
    v.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { st.ex = { ...loadViews()[+b.dataset.view] }; RC.rerender(); $(`[data-view="${b.dataset.view}"]`).focus(); }));
    v.querySelectorAll('[data-delview]').forEach((b) => b.addEventListener('click', () => { const xs = loadViews(); const [gone] = xs.splice(+b.dataset.delview, 1); saveViews(xs); RC.rerender(); RC.toast(`Ansicht „${gone.name}“ gelöscht.`); }));
    $('#exSave').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#exName').value.trim();
      if (!name) { $('#exName').focus(); RC.toast('Bitte einen Namen für die Ansicht eingeben.'); return; }
      const xs = loadViews(); xs.push({ name, dim: q.dim, cls: q.cls, cols: q.cols, period: q.period, meas: q.meas }); saveViews(xs);
      RC.rerender(); RC.toast(`Ansicht „${name}“ gespeichert.`);
    });
  };

  // ---------- 5.4 Kontakte-Abrechnung ----------
  const CONTACTS = [
    { name: 'M. Muster', role: 'Mitbewohner · Beitrag Miete läuft als Einnahme', rows: [
      ['04.08.26', 'Anteil Supermarkt', 38.6], ['18.08.26', 'Anteil Strom Q3', 52.5], ['24.08.26', 'Anteil Lieferdienst', 12.45],
      ['31.08.26', 'Ausgleich per Überweisung', -103.55], ['09.09.26', 'Anteil Supermarkt', 42.1], ['17.09.26', 'Anteil Supermarkt', 42.1],
    ], start: 0 },
    { name: 'E. Beispiel', role: 'Privatdarlehen', rows: [
      ['12.05.26', 'Darlehen ausgezahlt', 600], ['30.06.26', 'Rückzahlung', -100], ['31.07.26', 'Rückzahlung', -100], ['31.08.26', 'Rückzahlung', -100], ['15.09.26', 'Rückzahlung', -100],
    ], start: 0 },
    { name: 'K. Probe', role: 'Reisegruppe Sommer', rows: [
      ['05.08.26', 'Anteil Ferienhaus (1/3)', 600], ['05.08.26', 'Anteil Mietauto (1/3)', 146.4], ['20.08.26', 'Anteil Einkauf vor Ort', -58.2], ['02.09.26', 'Überweisung', -400],
    ], start: 0 },
  ];
  R.kontakte = (v) => {
    const cs = CONTACTS.map((c) => { let b = c.start; const rows = c.rows.map((r) => { b += r[2]; return { d: r[0], t: r[1], a: r[2], b }; }); return { ...c, rows, bal: b }; });
    const recv = cs.filter((c) => c.bal > 0).reduce((a, c) => a + c.bal, 0), pay = cs.filter((c) => c.bal < 0).reduce((a, c) => a + c.bal, 0);
    const initials = (n) => n.split(' ').map((p) => p[0]).join('');
    v.innerHTML = `
      <section class="rs rs-wide" aria-labelledby="ktT">
        <div class="tbd-head"><h2 id="ktT">Offen</h2><span class="tbd-state"><span class="ink">${cs.length} Kontakte</span></span></div>
        <div class="tbd-fig">${fig(recv + pay)}</div>
        ${chain([{ label: 'Forderungen', val: eur(recv) }, { op: MINUS, label: 'Verbindlichkeiten', val: eur(Math.abs(pay)) }, { op: '=', label: 'Saldo', val: eur(recv + pay), result: true }], 'Maßkette Kontakte')}
        <ul class="kt-jump">${cs.map((x, i) => `<li><a href="#kt${i}" data-jump="kt${i}"><span class="avatar kt-av" aria-hidden="true">${esc(initials(x.name))}</span><span><strong>${esc(x.name)}</strong><small>${eur(x.bal)} · ${x.bal > 0.004 ? 'schuldet dir' : x.bal < -0.004 ? 'du schuldest' : 'ausgeglichen'}</small></span></a></li>`).join('')}</ul>
      </section>
      ${cs.map((c, i) => `<section class="rs rs-wide kt-sheet" id="kt${i}" aria-labelledby="ktH${i}">
        <div class="tbd-head"><h2 id="ktH${i}"><span class="avatar kt-av" aria-hidden="true">${esc(initials(c.name))}</span>Kontoblatt ${esc(c.name)} <small class="muted">${esc(c.role)}</small></h2>
          <div class="rtools"><strong class="kt-sum">${eur(c.bal)}</strong><button class="btn btn-ghost btn-sm" type="button" data-soon="Abrechnung senden">${icon('transfer')}Abrechnung senden</button><button class="btn btn-primary btn-sm" type="button" data-settle="${i}"${Math.abs(c.bal) < 0.005 ? ' disabled' : ''}>${icon('check')}Ausgleich buchen</button></div></div>
        <div class="kt-grid">
          <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Datum</th><th class="tech">Vorgang</th><th class="tech n">Betrag</th><th class="tech n">Saldo</th></tr></thead>
          <tbody>${c.start ? `<tr class="muted"><td>30.06.26</td><td>Übertrag</td><td class="n"></td><td class="n">${eur(c.start)}</td></tr>` : ''}${c.rows.map((r) => `<tr><td>${r.d}</td><td>${esc(r.t)}</td><td class="n">${eur(r.a, { sign: true })}</td><td class="n"><strong>${eur(r.b)}</strong></td></tr>`).join('')}</tbody></table></div>
          <svg class="rchart rchart-s kt-chart" data-kt="${i}" role="img" aria-label="Saldo mit ${esc(c.name)} je Buchung"></svg>
        </div>
      </section>`).join('')}
      <p class="vnote rs-wide">Plus = der Kontakt schuldet dir, Minus = er hat bezahlt oder du schuldest. Anteile entstehen beim Aufteilen einer Buchung; Zahlungen des Kontakts ordnet der Nachtlauf zu.</p>`;
    v.querySelectorAll('[data-settle]').forEach((b) => b.addEventListener('click', () => { const c = cs[+b.dataset.settle]; RC.toast(`Ausgleich über ${eur(c.bal)} mit ${c.name} vorgemerkt (Prototyp, keine echte Buchung).`); }));
    v.querySelectorAll('[data-jump]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); const el = document.getElementById(a.dataset.jump); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.querySelector('h2').setAttribute('tabindex', '-1'); el.querySelector('h2').focus({ preventScroll: true }); }));
    v.querySelectorAll('.kt-chart').forEach((svg) => {
      const c = cs[+svg.dataset.kt];
      const vals = [c.start, ...c.rows.map((r) => r.b)];
      const g = scaffold(svg, vals.length, Math.min(...vals), Math.max(...vals), { L: 48, labelAt: (i) => (i === 0 ? 'Start' : c.rows[i - 1].d.slice(0, 6)), maxLabels: 4 });
      if (!g) return;
      s('path', { d: vals.map((x, i) => `${i ? 'L' : 'M'}${(g.x(i) - g.bw / 2).toFixed(1)},${g.y(x).toFixed(1)} L${(g.x(i) + g.bw / 2).toFixed(1)},${g.y(x).toFixed(1)}`).join(' '), class: 'l-actual' }, svg);
      s('circle', { cx: g.x(vals.length - 1) + g.bw / 2, cy: g.y(c.bal), r: 3.5, class: 'dot-actual' }, svg);
    });
  };

  // ---------- 5.5 Zeitraumvergleich ----------
  const MODES = {
    vm: { label: 'Monat gegen Vormonat', a: [LAST_FULL], b: [LAST_FULL - 1] },
    vj: { label: 'Monat gegen Vorjahresmonat', a: [LAST_FULL], b: [LAST_FULL - 12] },
    ytd: { label: 'Jahr bis heute gegen Vorjahr', a: range(RC.idx(2026, 0), LAST_FULL), b: range(RC.idx(2025, 0), LAST_FULL - 12) },
    r12: { label: '12 Monate gegen die 12 davor', a: range(LAST_FULL - 11, LAST_FULL), b: range(LAST_FULL - 23, LAST_FULL - 12) },
  };
  const name = (ks) => (ks.length === 1 ? MONTHS_ALL[ks[0]].long : `${labelShort(ks[0], true)} bis ${labelShort(ks[ks.length - 1], true)}`);
  R.vergleich = (v, st) => {
    st.cmp = st.cmp || 'vj';
    const M = MODES[st.cmp];
    const A = (fn) => sumK(M.a, fn), B = (fn) => sumK(M.b, fn);
    const rows = CONS.map((c) => ({ c, a: A((k) => SPEND[k][c.id]), b: B((k) => SPEND[k][c.id]) })).map((x) => ({ ...x, d: x.a - x.b })).filter((x) => x.a || x.b).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
    const maxD = Math.max(...rows.map((x) => Math.abs(x.d)), 1);
    const Ea = A(incomeOf), Eb = B(incomeOf), Ka = A(consumptionOf), Kb = B(consumptionOf);
    v.innerHTML = `
      <section class="rs rs-wide" aria-labelledby="vgT">
        <div class="tbd-head"><h2 id="vgT">${esc(name(M.a))} gegen ${esc(name(M.b))}</h2>
          <div class="seg seg-wrap" role="group" aria-label="Vergleich">${Object.entries(MODES).map(([k, m]) => `<button type="button" data-cmp="${k}" aria-pressed="${st.cmp === k}">${esc(m.label)}</button>`).join('')}</div></div>
        <div class="lq-figs">
          <div><span class="tech">Konsum</span><strong>${fig(Ka)}</strong><small>${delta(Ka - Kb)} ${Kb ? pct(Ka / Kb - 1, true) : ''}</small></div>
          <div><span class="tech">Einnahmen</span><strong>${fig(Ea)}</strong><small>${delta(Ea - Eb)} ${Eb ? pct(Ea / Eb - 1, true) : ''}</small></div>
          <div><span class="tech">Sparquote</span><strong>${pct((Ea - Ka) / Ea)}</strong><small>vorher ${pct((Eb - Kb) / Eb)}</small></div>
        </div>
        ${chain([{ label: 'Konsum vorher', val: eur(Kb, { cents: false }) }, { op: rows.filter((x) => x.d > 0).length ? '+' : MINUS, label: 'mehr', val: eur(rows.filter((x) => x.d > 0).reduce((a, x) => a + x.d, 0), { cents: false }) }, { op: MINUS, label: 'weniger', val: eur(Math.abs(rows.filter((x) => x.d < 0).reduce((a, x) => a + x.d, 0)), { cents: false }) }, { op: '=', label: 'Konsum jetzt', val: eur(Ka, { cents: false }), result: true }], 'Maßkette Zeitraumvergleich')}
      </section>
      <section class="rs rs-wide" aria-labelledby="vgB">
        <div class="tbd-head"><h2 id="vgB">Veränderung je Kategorie</h2><span class="tbd-state"><span class="ink">sortiert nach Ausschlag</span></span></div>
        <div class="dv-head" aria-hidden="true"><span></span><span class="tech">weniger</span><span class="tech">mehr</span><span></span></div>
        <ul class="dv">${rows.map((x) => `<li><span class="dv-name">${sw(x.c.cls)}${esc(x.c.name)}</span>
          <span class="dv-track"><i class="${x.d < 0 ? 'is-less' : 'is-more'}" style="width:${(Math.abs(x.d) / maxD) * 50}%"></i></span>
          <span class="dv-val"><strong>${eur(x.d, { cents: false, sign: true })}</strong><small>${eur(x.b, { cents: false })} → ${eur(x.a, { cents: false })}</small></span></li>`).join('')}</ul>
        <p class="vnote">Balken um die Mittellinie: rechts mehr ausgegeben, links weniger. Zukunft (ETF, Notgroschen) ist nicht enthalten.</p>
      </section>`;
    v.querySelectorAll('[data-cmp]').forEach((b) => b.addEventListener('click', () => { st.cmp = b.dataset.cmp; RC.rerender(); $(`[data-cmp="${st.cmp}"]`).focus(); }));
  };
})();
