/* Finanz-App prototype · Reports, group 3: Zukunft und Vermögen. Sample data only. */
(() => {
  'use strict';

  const RC = window.RC;
  const {
    R, esc, icon, eur, pct, fig, chain, sw, delta, sumK, nf0, nf1, nf2, MINUS, MONTHS, MONTHS_LONG, MONTHS_ALL, LAST_FULL,
    CATS, SPEND, PLAN, INCOME, incomeOf, consumptionOf, classOf, NW, INV, OWN, MKT, NOW, TYPES, structure, RET, BENCH, DIVIDENDS,
    priceAt, s, text, path, scaffold, bar, tip, labelShort, windowK, periodName, CLASS_LABEL, heat, kfmt, yTicks,
  } = RC;
  const $ = (sel, root = document) => root.querySelector(sel);
  const range = (a, b) => { const out = []; for (let k = Math.max(0, a); k <= b; k++) out.push(k); return out; };
  const KEY_NOW = MONTHS_ALL[35].key;

  // ---------- Forecast of the budget accounts (Giro, Karte, Bargeld), day by day from 17.09.2026 ----------
  const TODAY = new Date(2026, 8, 17);
  const START = NOW.giro + NOW.karte; // 1.617 − 450
  const SWEEP = 5600;
  const periodicEvents = [ // month, day, category, amount — paid from the sinking funds (Tagesgeld)
    [11, 10, 'weihnachten', 800], [0, 15, 'hhvers', 486], [1, 10, 'reisen', 1400], [2, 20, 'kfzservice', 580],
    [3, 12, 'geschenke', 90], [4, 15, 'reisen', 600], [6, 12, 'geschenke', 120], [7, 5, 'reisen', 3000], [9, 12, 'geschenke', 100],
  ];
  // planned events: sample plans of the household (settings in V1, entered here in the report)
  const DEFAULT_EVENTS = [
    { id: 'e1', name: 'Kinderzimmer einrichten', key: '2026-12', day: 5, amt: -2500 },
    { id: 'e2', name: 'Kinderwagen', key: '2027-01', day: 10, amt: -900 },
    { id: 'e3', name: 'Papamonat: kein Gehalt', key: '2027-02', day: 28, amt: -3812 },
    { id: 'e4', name: 'Familienzeitbonus (Schätzung)', key: '2027-03', day: 10, amt: 1600 },
  ];
  const CANCEL = ['ki2', 'zeitung'];
  const PROJ_NET = sumK(range(LAST_FULL - 11, LAST_FULL), (k) => RC.PROJECTS.reduce((acc, p) => acc + RC.PROJ[k][p.id].inc - RC.PROJ[k][p.id].cost, 0)) / 12;
  // levers the plan can pull when it gets tight
  const LEVERS = [
    { id: 'xmas', name: 'Weihnachtsgeld ganz auf die Budget-Konten', note: 'statt 50 % ETF und 20 % Notgroschen (R12 aussetzen)' },
    { id: 'pause', name: 'ETF-Sparplan Dez bis Feb aussetzen', note: '3 × 400 €, danach weiter' },
    { id: 'cancel', name: 'Kündigen: KI-Bildtool und Zeitung', note: 'ab November, siehe Verträge und Abos' },
  ];
  function forecast({ varFactor = 1, events = [], levers = {} } = {}) {
    const days = [];
    const months = {}; // key → { start, inc, fix, vari, ev, end, low }
    let bal = START;
    // the Sondertilgung is paid from the Tagesgeld reserve built from the special payments (R09, R12)
    const fixed = CATS.filter((c) => c.kind === 'fix' && priceAt(c, KEY_NOW) > 0 && c.id !== 'sondertilgung');
    const varCats = CATS.filter((c) => c.kind === 'var');
    for (let d = 0; d <= 365; d++) {
      const dt = new Date(2026, 8, 17 + d);
      const y = dt.getFullYear(), m = dt.getMonth(), day = dt.getDate();
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      const dim = new Date(y, m + 1, 0).getDate();
      const mo = months[key] || (months[key] = { key, start: bal, inc: 0, fix: 0, vari: 0, ev: 0, sweep: 0, low: bal });
      const ev = []; // [name, amount on the budget accounts, amount paid elsewhere, balance after]
      const pay = (name, amt, show, bucket) => { bal += amt; mo[bucket] += amt; if (show) ev.push([name, amt, 0, bal]); };
      if (d > 0) {
        const planM = varCats.reduce((a, c) => a + c.base * Math.pow(1 + c.trend, (35 + d / 30) / 12) * ((c.season && c.season[m]) || 1), 0);
        const dv = (planM * varFactor) / dim;
        bal -= dv; mo.vari -= dv;
        fixed.forEach((c) => {
          if (c.due !== Math.min(day, dim) || (y === 2026 && m === 8 && c.due <= 17)) return;
          if (levers.cancel && CANCEL.includes(c.id) && key >= '2026-11') return;
          if (levers.pause && c.id === 'investieren' && ['2026-12', '2027-01', '2027-02'].includes(key)) { ev.push(['ETF-Sparplan ausgesetzt', 0, 400, null]); return; }
          pay(c.name, -priceAt(c, KEY_NOW), priceAt(c, KEY_NOW) >= 250, 'fix');
        });
        if (day === 15 && [11, 2, 5, 8].includes(m)) pay('Ausschüttung ETF', 340, true, 'inc');
        // side projects: their average net result of the last 12 months, on the 20th
        if (day === 20) pay('Nebeneinkünfte (Projekte, Ø)', PROJ_NET, false, 'inc');
        if (day === 3) ev.push(['Sondertilgung aus Tagesgeld', 0, 300, null]);
        periodicEvents.forEach(([pm, pd, id, amt]) => { if (pm === m && pd === day) ev.push([`${RC.catById(id).name} aus Rücklage`, 0, amt, null]); });
        events.forEach((e) => { if (e.key === key && Math.min(e.day, dim) === day) pay(e.name, e.amt, true, 'ev'); });
        if (day === dim) {
          pay('Gehalt', y === 2027 && m >= 3 ? 3880 : 3812, true, 'inc');
          pay('Mietanteil M. Muster', 800, true, 'inc');
          if (m === 10 || m === 5) {
            const sz = (y === 2027 ? 5750 : 5650) * 0.772;
            if (levers.xmas && m === 10) pay('Weihnachtsgeld, ganz', sz, true, 'inc');
            else pay(m === 10 ? 'Weihnachtsgeld, 30 % frei' : 'Urlaubszuschuss, 30 % frei', sz * 0.3, true, 'inc');
          }
        }
        // waterfall stage 8: on the 2nd, whatever exceeds the month's needs plus a buffer goes to the Tagesgeld;
        // planned expenses of the next 4 months stay on the budget accounts
        if (day === 2) {
          const until = `${new Date(y, m + 4, 1).getFullYear()}-${String(new Date(y, m + 4, 1).getMonth() + 1).padStart(2, '0')}`;
          const keep = SWEEP + events.filter((e) => e.amt < 0 && e.key >= key && e.key < until).reduce((a, e) => a - e.amt, 0);
          if (bal > keep) pay('Überschuss → Tagesgeld', -(bal - keep), true, 'sweep');
        }
      }
      mo.low = Math.min(mo.low, bal); mo.end = bal;
      days.push({ d, dt, bal, ev, key });
    }
    return { days, months: Object.values(months) };
  }
  const FC0 = forecast({ events: DEFAULT_EVENTS }).days;
  const low90 = FC0.slice(0, 91).reduce((a, x) => (x.bal < a.bal ? x : a));
  const r07 = RC.RULES.find((r) => r.id === 'R07');
  if (r07) r07.val = `Tiefpunkt ${eur(low90.bal, { cents: false })}`;
  RC.forecastLow = low90;
  const fdate = (dt) => `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getFullYear()).slice(2)}`;
  const keyLong = (key) => `${MONTHS_LONG[+key.slice(5) - 1]} ${key.slice(0, 4)}`;

  // ---------- 3.1 Liquiditätsprognose ----------
  R.liquiditaet = (v, st) => {
    st.fcRange = st.fcRange || 182;
    st.events = st.events || DEFAULT_EVENTS.map((e) => ({ ...e }));
    st.levers = st.levers || {};
    const n = st.fcRange;
    const withEv = forecast({ events: st.events, levers: st.levers });
    const buffer = forecast({ events: st.events, levers: st.levers, varFactor: 1.1 });
    const noEv = forecast({ levers: st.levers });
    const base = withEv.days.slice(0, n + 1), buf = buffer.days.slice(0, n + 1), plain = noEv.days.slice(0, n + 1);
    const lowOf = (arr) => arr.reduce((a, x) => (x.bal < a.bal ? x : a));
    const low = lowOf(base), lowB = lowOf(buf), lowP = lowOf(plain);
    const six = withEv.months.slice(0, 7), sixB = buffer.months.slice(0, 7);
    // month lows within the same horizon as the verdict (6 months to the 17th)
    const lowIn = (days) => { const m2 = {}; days.slice(0, 183).forEach((x) => { m2[x.key] = Math.min(m2[x.key] ?? Infinity, x.bal); }); return m2; };
    const lowE = lowIn(withEv.days), lowBu = lowIn(buffer.days);
    const endIn = {}; withEv.days.slice(0, 183).forEach((x) => { endIn[x.key] = x.bal; });
    const horizonEnd = withEv.days[182].dt;
    const low6 = lowOf(withEv.days.slice(0, 183)), low6B = lowOf(buffer.days.slice(0, 183));
    const verdict = low6B.bal >= 0 ? { cls: 'ok', icon: 'check-circle', text: 'Geht sich aus, auch mit 10 % Puffer.' }
      : low6.bal >= 0 ? { cls: 'warn', icon: 'alert', text: `Geht sich knapp aus: ohne Puffer ja, mit 10 % Puffer fehlen im ${keyLong(low6B.key)} ${eur(-low6B.bal, { cents: false })}.` }
        : { cls: 'bad', icon: 'alert-circle', text: `Geht sich nicht aus: im ${keyLong(low6.key)} fehlen ${eur(-low6.bal, { cents: false })}.` };
    const leverGain = (id) => { const f = forecast({ events: st.events, levers: { ...st.levers, [id]: !st.levers[id] } }); return lowOf(f.days.slice(0, 183)).bal - low6.bal; };
    const monthOpts = Array.from({ length: 12 }, (_, i) => { const d = new Date(2026, 9 + i, 1); const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; return RC.opt(key, keyLong(key), ''); }).join('');
    // movements per month: opening balance, big movements and planned events, the rest folded into one line, closing balance
    const blocks = [];
    let blk = null;
    base.forEach((x, i) => {
      if (!blk || blk.key !== x.key) { if (blk) blocks.push(blk); blk = { key: x.key, start: i ? base[i - 1].bal : START, rows: [], big: 0 }; }
      x.ev.forEach(([name, amt, info, after]) => {
        const planned = st.events.some((e) => e.name === name);
        if (info) { blk.rows.push({ dt: x.dt, name, info }); return; }
        if (Math.abs(amt) >= 250 || planned) { blk.rows.push({ dt: x.dt, name, amt, after, planned }); blk.big += amt; }
      });
      blk.end = x.bal; blk.last = x.dt;
    });
    if (blk) blocks.push(blk);
    v.innerHTML = `
      <section class="rs rs-wide" aria-labelledby="lT">
        <div class="tbd-head"><h2 id="lT">Budget-Konten · nächste ${n === 90 ? '90 Tage' : n === 182 ? '6 Monate' : '12 Monate'}</h2>
          <div class="seg" role="group" aria-label="Prognosezeitraum">${[[90, '90 Tage'], [182, '6 Monate'], [365, '12 Monate']].map(([d, l]) => `<button type="button" data-fc="${d}" aria-pressed="${n === d}">${l}</button>`).join('')}</div></div>
        <div class="verdict verdict-${verdict.cls}">${icon(verdict.icon)}<div><strong>${esc(verdict.text)}</strong><small>6 Monate bis ${fdate(withEv.days[182].dt)} · mit ${st.events.length} geplanten Ereignissen${Object.values(st.levers).some(Boolean) ? ` und ${Object.values(st.levers).filter(Boolean).length} Stellschraube${Object.values(st.levers).filter(Boolean).length > 1 ? 'n' : ''}` : ''}</small></div></div>
        <div class="lq-figs">
          <div><span class="tech">Tiefpunkt mit Ereignissen</span><strong class="${low.bal < 0 ? 'neg-alert' : ''}">${fig(low.bal)}</strong><small>am ${fdate(low.dt)} · Ziel ≥ 0 € (R07)</small></div>
          <div><span class="tech">Mit 10 % Puffer</span><strong>${lowB.bal < 0 ? icon('alert', 'icon icon-sm') : ''}${fig(lowB.bal)}</strong><small>variable Ausgaben +10 %</small></div>
          <div><span class="tech">Ohne Ereignisse</span><strong>${fig(lowP.bal)}</strong><small>Tiefpunkt am ${fdate(lowP.dt)}</small></div>
          <div><span class="tech">Heute</span><strong>${fig(START)}</strong><small>Giro, Kreditkarte, Bargeld</small></div>
        </div>
        <svg class="rchart rchart-l" id="lChart" role="img" aria-label="Prognose des Saldos der Budget-Konten mit geplanten Ereignissen, Puffer und Tiefpunkt"></svg>
        <div class="legend" aria-hidden="true">
          <span><svg viewBox="0 0 26 8"><path class="l-forecast" d="M0 4h26"/></svg>Prognose mit Ereignissen</span>
          <span><i class="lg-sq lg-band"></i>10 % Puffer auf variable Ausgaben</span>
          <span><svg viewBox="0 0 26 8"><path class="l-prev" d="M0 4h26"/></svg>ohne Ereignisse</span>
          <span><svg viewBox="0 0 12 10"><path class="kote" d="M1 1h10L6 9Z"/></svg>Tiefpunkt</span>
          <span><i class="lg-ev"></i>geplantes Ereignis</span>
        </div>
      </section>
      <section class="rs rs-main" aria-labelledby="lE">
        <div class="tbd-head"><h2 id="lE">Geplante Ereignisse</h2></div>
        <table class="rtable lq-events"><thead><tr><th class="tech">Monat</th><th class="tech">Ereignis</th><th class="tech n">Betrag</th><th><span class="sr-only">Entfernen</span></th></tr></thead>
        <tbody>${st.events.slice().sort((a, b) => (a.key < b.key ? -1 : 1)).map((e) => `<tr><td>${keyLong(e.key)}</td><td>${esc(e.name)}</td><td class="n"><strong>${eur(e.amt, { cents: false, sign: true })}</strong></td><td class="n"><button class="icon-btn" type="button" data-evdel="${e.id}" aria-label="${esc(e.name)} entfernen">${icon('x')}</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Keine Ereignisse geplant.</td></tr>'}</tbody></table>
        <form class="ev-add" id="evAdd">
          <label class="ex-f"><span class="tech">Ereignis</span><input class="input input-sm ev-name" id="evName" placeholder="z. B. Autoreparatur" maxlength="50" autocomplete="off"></label>
          <label class="ex-f"><span class="tech">Monat</span><select class="select select-sm" id="evKey">${monthOpts}</select></label>
          <label class="ex-f"><span class="tech">Art</span><select class="select select-sm" id="evKind"><option value="-1">Ausgabe</option><option value="1">Einnahme</option></select></label>
          <label class="ex-f"><span class="tech">Betrag</span><span class="amount-field amount-field-sm"><input class="amount-input" id="evAmt" inputmode="decimal" placeholder="0" autocomplete="off"><span class="amount-cur">€</span></span></label>
          <button class="btn btn-ghost btn-sm" type="submit">${icon('plus')}Ereignis</button>
        </form>
        <p class="vnote">Einmalige Ausgaben und Einnahmen, auch Ausfälle (Papamonat ohne Gehalt). Sonderzahlungen kommen automatisch aus dem Gehalt.</p>
      </section>
      <section class="rs rs-side" aria-labelledby="lH">
        <div class="tbd-head"><h2 id="lH">Stellschrauben</h2></div>
        <ul class="levers">${LEVERS.map((l) => { const g = leverGain(l.id); return `<li><label class="lever"><input type="checkbox" data-lever="${l.id}"${st.levers[l.id] ? ' checked' : ''}><span><strong>${esc(l.name)}</strong><small>${esc(l.note)}</small></span><span class="lever-gain ${st.levers[l.id] ? 'txt-good' : ''}">${st.levers[l.id] ? 'aktiv' : `${eur(g, { cents: false, sign: true })}`}</span></label></li>`; }).join('')}</ul>
        <p class="vnote">Rechts: um so viel hebt die Stellschraube den Tiefpunkt der nächsten 6 Monate. Der Notgroschen bleibt unangetastet (R02).</p>
      </section>
      <section class="rs rs-wide" aria-labelledby="lM">
        <div class="tbd-head"><h2 id="lM">Vorausschau je Monat</h2><span class="tbd-state"><span class="ink">bis ${fdate(horizonEnd)}</span></span></div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Monat</th><th class="tech n">Anfang</th><th class="tech n">Einnahmen</th><th class="tech n">Fix und Zukunft</th><th class="tech n">Variabel (Plan)</th><th class="tech n">Ereignisse</th><th class="tech n">Überschuss → Tagesgeld</th><th class="tech n">Ende</th><th class="tech n">Tiefpunkt</th><th class="tech n">mit Puffer</th></tr></thead>
        <tbody>${six.map((m2, i) => `<tr><td>${keyLong(m2.key)}${i === 0 ? ' <small class="muted">ab 17.</small>' : ''}</td><td class="n">${eur(m2.start, { cents: false })}</td><td class="n">${eur(m2.inc, { cents: false, sign: true })}</td><td class="n">${eur(m2.fix, { cents: false })}</td><td class="n">${eur(m2.vari, { cents: false })}</td><td class="n">${m2.ev ? `<strong>${eur(m2.ev, { cents: false, sign: true })}</strong>` : '<span class="muted">–</span>'}</td><td class="n">${m2.sweep ? eur(m2.sweep, { cents: false }) : '<span class="muted">–</span>'}</td><td class="n"><strong>${eur(endIn[m2.key] ?? m2.end, { cents: false })}</strong>${i === 6 ? '<small class="muted">am 17.</small>' : ''}</td><td class="n"><span class="${lowE[m2.key] < 0 ? 'neg-alert' : ''}">${eur(lowE[m2.key], { cents: false })}</span></td><td class="n"><span class="${lowBu[m2.key] < 0 ? 'txt-bad' : 'muted'}">${eur(lowBu[m2.key], { cents: false })}</span></td></tr>`).join('')}</tbody></table></div>
      </section>
      <section class="rs rs-wide" aria-labelledby="lB">
        <div class="tbd-head"><h2 id="lB">Große Bewegungen je Monat</h2></div>
        <div class="rscroll"><table class="rtable lq-moves"><thead><tr><th class="tech">Datum</th><th class="tech">Bewegung</th><th class="tech n">Betrag</th><th class="tech n">Saldo danach</th></tr></thead>
        ${blocks.map((b) => `<tbody><tr class="rp-grp"><td colspan="3"><strong>${keyLong(b.key)}</strong></td><td class="n">${eur(b.start, { cents: false })}</td></tr>
          ${b.rows.map((e) => `<tr class="${e.planned ? 'is-event' : ''}"><td>${fdate(e.dt)}</td><td>${e.planned ? '<i class="lg-ev" aria-hidden="true"></i>' : ''}${esc(e.name)}${e.info ? '<small class="muted"> · nicht auf den Budget-Konten</small>' : ''}</td><td class="n">${e.info ? `<span class="muted">${eur(-e.info, { cents: false })}</span>` : eur(e.amt, { cents: false, sign: true })}</td><td class="n">${e.info ? '<span class="muted">–</span>' : eur(e.after, { cents: false })}</td></tr>`).join('')}
          <tr class="is-plan"><td>${fdate(b.last)}</td><td>Variable Ausgaben und kleine Zahlungen im Monat</td><td class="n">${eur(b.end - b.start - b.big, { cents: false, sign: true })}</td><td class="n"><strong>${eur(b.end, { cents: false })}</strong></td></tr></tbody>`).join('')}
        </table></div>
        <p class="vnote">Je Monat: Anfang, Bewegungen ab 250 € und geplante Ereignisse, der Rest als eine Zeile, Ende. Erwartete Zahlungen, variable Kategorien nach Plan, Gehalt und Mietanteil des Mitbewohners am Monatsletzten. Periodische Ausgaben kommen aus den Rücklagen am Tagesgeld. Überschüsse über ${eur(SWEEP, { cents: false })} wandern am 2. aufs Tagesgeld, geplante Ausgaben der nächsten 4 Monate bleiben stehen.</p>
      </section>`;
    v.querySelectorAll('[data-fc]').forEach((b) => b.addEventListener('click', () => { st.fcRange = +b.dataset.fc; RC.rerender(); $(`[data-fc="${st.fcRange}"]`).focus(); }));
    v.querySelectorAll('[data-lever]').forEach((c) => c.addEventListener('change', () => { st.levers[c.dataset.lever] = c.checked; RC.rerender(); $(`[data-lever="${c.dataset.lever}"]`).focus(); }));
    v.querySelectorAll('[data-evdel]').forEach((b) => b.addEventListener('click', () => { const e = st.events.find((x) => x.id === b.dataset.evdel); st.events = st.events.filter((x) => x !== e); RC.rerender(); RC.toast(`„${e.name}“ entfernt.`); }));
    $('#evAdd').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#evName').value.trim(), amt = +String($('#evAmt').value).replace(/\./g, '').replace(',', '.');
      if (!name) { $('#evName').focus(); RC.toast('Bitte das Ereignis benennen.'); return; }
      if (!(amt > 0)) { $('#evAmt').focus(); RC.toast('Bitte einen Betrag über 0 eingeben.'); return; }
      st.events.push({ id: 'u' + Date.now(), name, key: $('#evKey').value, day: 15, amt: amt * +$('#evKind').value });
      RC.rerender(); RC.toast(`„${name}“ eingeplant.`);
    });
    const svg = $('#lChart');
    svg.innerHTML = '';
    const f = RC.frame(svg, { L: 56, R: 82, T: 14, B: 26 });
    if (!f.W) return;
    const all = base.map((x) => x.bal).concat(buf.map((x) => x.bal), plain.map((x) => x.bal));
    const lo = Math.min(0, ...all), hi = Math.max(...all);
    const pad = (hi - lo) * 0.08;
    const x = (d) => f.L + (d / n) * f.iw;
    const y = (val) => f.B - ((val - (lo - pad)) / (hi + pad - (lo - pad))) * (f.B - f.T);
    RC.gridY(svg, f, lo - pad, hi + pad, y, kfmt);
    s('path', { d: base.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(p.bal).toFixed(1)}`).join(' ') + ' ' + buf.slice().reverse().map((p) => `L${x(p.d).toFixed(1)},${y(p.bal).toFixed(1)}`).join(' ') + 'Z', class: 'fc-band' }, svg);
    path(svg, plain.map((p) => [x(p.d), y(p.bal)]), 'l-prev');
    path(svg, base.map((p) => [x(p.d), y(p.bal)]), 'l-forecast');
    // planned events as ticks on the forecast line
    base.forEach((p) => p.ev.forEach(([name]) => { if (st.events.some((e) => e.name === name)) { tip(s('rect', { x: x(p.d) - 4, y: y(p.bal) - 4, width: 8, height: 8, class: 'ev-mark' }, svg), name); } }));
    s('circle', { cx: x(0), cy: y(START), r: 4, class: 'dot-actual' }, svg);
    text(svg, f.W - f.R + 6, y(base[n].bal) + 4, eur(base[n].bal, { cents: false }), 'svg-label-strong');
    text(svg, f.W - f.R + 6, y(plain[n].bal) + 4 + (Math.abs(y(plain[n].bal) - y(base[n].bal)) < 14 ? 14 : 0), 'ohne Ereign.', 'svg-label');
    const ly = y(low.bal);
    s('path', { d: `M${x(low.d) - 6},${ly - 16}h12l-6,10Z`, class: 'kote' }, svg);
    s('line', { x1: x(low.d), x2: x(low.d), y1: ly - 6, y2: ly, class: 'axis' }, svg);
    text(svg, Math.min(Math.max(x(low.d), f.L + 60), f.W - f.R - 60), ly + 24, `Tiefpunkt ${eur(low.bal, { cents: false })}`, `${low.bal < 0 ? 'svg-label-red' : 'svg-label-line'} sk-lbl`, 'middle');
    const step = n === 90 ? 14 : n === 182 ? 30 : 61;
    for (let d = 0; d <= n; d += step) { const dt = withEv.days[d].dt; text(svg, x(d), f.H - 6, n === 90 ? `${dt.getDate()}.${dt.getMonth() + 1}.` : `${MONTHS[dt.getMonth()]} ${String(dt.getFullYear()).slice(2)}`, 'svg-label', d ? 'middle' : 'start'); }
  };

  // ---------- 3.2 Cashflow-Verlauf ----------
  R.cashflow = (v, st) => {
    const ks0 = windowK(st.period);
    const ks = ks0.length < 6 ? range(LAST_FULL - 11, LAST_FULL) : ks0;
    const E = sumK(ks0, incomeOf), K = sumK(ks0, consumptionOf);
    const pos = ks0.filter((k) => incomeOf(k) > consumptionOf(k)).length;
    v.innerHTML = `
      <section class="rs rs-wide" aria-labelledby="cfT">
        <div class="tbd-head"><h2 id="cfT">Nettocashflow · ${esc(periodName(st.period))}</h2><span class="tbd-state"><span class="${E > K ? 'ok' : 'ink'}">${icon(E > K ? 'check-circle' : 'alert', 'icon icon-sm')}${pos} von ${ks0.length} Monaten positiv</span></span></div>
        <div class="tbd-fig">${fig(E - K)}</div>
        ${chain([{ label: 'Einnahmen', val: eur(E, { cents: false }) }, { op: MINUS, label: 'Konsumausgaben', val: eur(K, { cents: false }) }, { op: '=', label: 'Nettocashflow', val: eur(E - K, { cents: false }), result: true }], 'Maßkette Nettocashflow')}
        <svg class="rchart" id="cfTop" role="img" aria-label="Ausgaben als Säulen, Einnahmen als Linie"></svg>
        <svg class="rchart rchart-xs" id="cfNet" role="img" aria-label="Nettocashflow je Monat als Balken um Null"></svg>
        <div class="legend" aria-hidden="true">
          <span><i class="lg-sq sw-need"></i>Bedarf</span><span><i class="lg-sq sw-want"></i>Wunsch</span>
          <span><svg viewBox="0 0 26 8"><path class="l-actual" d="M0 4h26"/></svg>Einnahmen</span>
          <span><i class="lg-sq lg-mkt"></i>Nettocashflow</span>
        </div>
        <p class="vnote">Umbuchungen und Zukunft (ETF, Notgroschen, Sondertilgung) zählen nicht als Ausgabe; sie sind Teil des Nettocashflows.</p>
      </section>
      <section class="rs rs-wide" aria-labelledby="cfL">
        <div class="tbd-head"><h2 id="cfL">Je Monat</h2></div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Monat</th><th class="tech n">Einnahmen</th><th class="tech n">Bedarf</th><th class="tech n">Wunsch</th><th class="tech n">Nettocashflow</th><th class="tech n">davon in Zukunft</th></tr></thead>
        <tbody>${ks0.slice().reverse().map((k) => `<tr><td>${esc(MONTHS_ALL[k].long)}</td><td class="n">${eur(incomeOf(k), { cents: false })}</td><td class="n">${eur(classOf(k, 'need'), { cents: false })}</td><td class="n">${eur(classOf(k, 'want'), { cents: false })}</td><td class="n"><strong>${eur(incomeOf(k) - consumptionOf(k), { cents: false, sign: true })}</strong></td><td class="n">${eur(classOf(k, 'future'), { cents: false })}</td></tr>`).join('')}</tbody></table></div>
      </section>`;
    const svg = $('#cfTop');
    const inc = ks.map(incomeOf);
    const g = scaffold(svg, ks.length, 0, Math.max(...inc, ...ks.map(consumptionOf)), { labelAt: (i) => labelShort(ks[i]), B: 22 });
    if (!g) return;
    ks.forEach((k, i) => {
      const n = classOf(k, 'need'), w = classOf(k, 'want');
      bar(svg, g.x(i), g.bw * 0.56, g.y(0), g.y(n), 'f-need', `Bedarf ${MONTHS_ALL[k].long}: ${eur(n)}`);
      bar(svg, g.x(i), g.bw * 0.56, g.y(n), g.y(n + w), 'f-want', `Wunsch ${MONTHS_ALL[k].long}: ${eur(w)}`);
    });
    path(svg, ks.map((k, i) => [g.x(i), g.y(inc[i])]), 'l-actual');
    ks.forEach((k, i) => s('circle', { cx: g.x(i), cy: g.y(inc[i]), r: 2.5, class: 'dot-actual' }, svg));
    const svg2 = $('#cfNet');
    const net = ks.map((k) => incomeOf(k) - consumptionOf(k));
    const g2 = scaffold(svg2, ks.length, Math.min(...net), Math.max(...net), { B: 8, T: 8 });
    if (!g2) return;
    net.forEach((x, i) => bar(svg2, g2.x(i), g2.bw * 0.56, g2.y(0), g2.y(x), x >= 0 ? 'bar-mkt' : 'bar-neg', `${MONTHS_ALL[ks[i]].long}: ${eur(x, { sign: true })}`));
  };

  // ---------- 3.3 Vermögensverläufe ----------
  const TYPE_FILL = { depot: 'f-depot', krypto: 'f-krypto', p2p: 'f-p2p', tagesgeld: 'f-tagesgeld', giro: 'f-giro', kredit: 'f-debt', karte: 'f-debt2' };
  R.vermoegen = (v, st) => {
    let ks = windowK(st.period, 35);
    if (ks.length < 12) ks = range(24, 35);
    const k0 = ks[0] - 1 >= 0 ? ks[0] - 1 : null;
    const startNW = k0 == null ? NW.start : NW[k0];
    const own = sumK(ks, (k) => OWN[k]), mkt = sumK(ks, (k) => MKT[k]);
    const S = ks.map(structure);
    const first = k0 == null ? S[0] : structure(k0), now = S[S.length - 1];
    const firstLbl = k0 == null ? labelShort(ks[0], true) : `Ende ${labelShort(k0, true)}`;
    v.innerHTML = `
      <section class="rs rs-wide" aria-labelledby="vT">
        <div class="tbd-head"><h2 id="vT">Nettovermögen · ${esc(labelShort(ks[0], true))} bis heute</h2><span class="tbd-state"><span class="ok">${icon('up', 'icon icon-sm')}${eur(NW[35] - startNW, { cents: false, sign: true })}</span></span></div>
        <div class="tbd-fig">${fig(NW[35])}</div>
        ${chain([{ label: 'Anfang', val: eur(startNW, { cents: false }) }, { op: '+', label: 'Eigenleistung', val: eur(own, { cents: false }) }, { op: mkt >= 0 ? '+' : MINUS, label: 'Markt', val: eur(Math.abs(mkt), { cents: false }) }, { op: '=', label: 'heute', val: eur(NW[35], { cents: false }), result: true }], 'Maßkette Nettovermögen')}
        <svg class="rchart rchart-l" id="vChart" role="img" aria-label="Vermögen nach Kontotyp gestapelt, Schulden unter Null, Nettovermögen als Linie"></svg>
        <div class="legend" aria-hidden="true">
          ${TYPES.map((t) => `<span><i class="lg-sq sw-${t.key}"></i>${esc(t.name)}</span>`).join('')}
          <span><svg viewBox="0 0 26 8"><path class="l-actual" d="M0 4h26"/></svg>Nettovermögen</span>
        </div>
        <p class="vnote">Eigenleistung = Einnahmen minus Konsum plus reguläre Tilgung. Markt = Kursveränderung der Anlagen. Schulden sind unter der Nulllinie gestrichelt abgetragen.</p>
      </section>
      <section class="rs rs-wide" aria-labelledby="vS">
        <div class="tbd-head"><h2 id="vS">Struktur</h2></div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Kontotyp</th><th class="tech n">${esc(firstLbl)}</th><th class="tech n">heute</th><th class="tech n">Veränderung</th><th class="tech n">Anteil heute</th></tr></thead>
        <tbody>${TYPES.map((t) => { const a = first[t.key]; return `<tr><td>${sw(t.key)}${esc(t.name)}</td><td class="n">${eur(a, { cents: false })}</td><td class="n"><strong>${eur(now[t.key], { cents: false })}</strong></td><td class="n">${delta(now[t.key] - a)}</td><td class="n">${t.debt ? '<span class="muted">Schuld</span>' : pct(now[t.key] / TYPES.filter((x) => !x.debt).reduce((acc, x) => acc + now[x.key], 0))}</td></tr>`; }).join('')}
          <tr class="is-total"><td>Nettovermögen</td><td class="n">${eur(startNW, { cents: false })}</td><td class="n"><strong>${eur(NW[35], { cents: false })}</strong></td><td class="n">${delta(NW[35] - startNW)}</td><td class="n"></td></tr></tbody></table></div>
      </section>`;
    const svg = $('#vChart');
    const pos = TYPES.filter((t) => !t.debt), neg = TYPES.filter((t) => t.debt);
    const hi = Math.max(...S.map((r) => pos.reduce((a, t) => a + r[t.key], 0)));
    const lo = Math.min(...S.map((r) => neg.reduce((a, t) => a + r[t.key], 0)));
    const g = scaffold(svg, ks.length, lo, hi, { labelAt: (i) => labelShort(ks[i], i === 0), R: 70 });
    if (!g) return;
    const layer = (types, sign) => {
      let acc = S.map(() => 0);
      types.forEach((t) => {
        const top = S.map((r, i) => acc[i] + r[t.key]);
        const d = top.map((val, i) => `${i ? 'L' : 'M'}${g.x(i).toFixed(1)},${g.y(val).toFixed(1)}`).join(' ') + ' ' + acc.map((val, i) => [i, val]).reverse().map(([i, val]) => `L${g.x(i).toFixed(1)},${g.y(val).toFixed(1)}`).join(' ') + 'Z';
        tip(s('path', { d, class: `area ${TYPE_FILL[t.key]}` }, svg), `${t.name}: ${eur(S[S.length - 1][t.key], { cents: false })}`);
        acc = top;
      });
      return sign;
    };
    layer(pos, 1); layer(neg, -1);
    s('line', { x1: g.f.L, x2: g.f.W - g.f.R, y1: g.y(0), y2: g.y(0), class: 'axis' }, svg);
    path(svg, ks.map((k, i) => [g.x(i), g.y(NW[k])]), 'l-actual l-nw');
    const n = ks.length - 1;
    s('circle', { cx: g.x(n), cy: g.y(NW[35]), r: 4, class: 'dot-actual' }, svg);
    text(svg, g.x(n) + 8, g.y(NW[35]) + 4, kfmt(NW[35]), 'svg-label-strong');
  };

  // ---------- 3.4 Jahresvorschau Zahlungen ----------
  R.vorschau = (v) => {
    const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(2026, 9 + i, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
    const rows = [];
    CATS.filter((c) => c.kind === 'fix' && priceAt(c, KEY_NOW) > 0).forEach((c) => rows.push({ c, vals: months.map(() => priceAt(c, KEY_NOW)) }));
    CATS.filter((c) => c.kind === 'periodic').forEach((c) => rows.push({ c, vals: months.map(({ y, m }) => periodicEvents.filter(([pm, , id]) => id === c.id && pm === m).reduce((a, e) => a + e[3], 0)) }));
    const order = ['need', 'want', 'future'];
    rows.sort((a, b) => order.indexOf(a.c.cls) - order.indexOf(b.c.cls) || (a.c.kind === 'periodic') - (b.c.kind === 'periodic') || b.vals[0] - a.vals[0]);
    const tot = months.map((_, i) => rows.reduce((a, r) => a + r.vals[i], 0));
    const periodic = rows.filter((r) => r.c.kind === 'periodic');
    const perSum = periodic.reduce((a, r) => a + r.vals.reduce((x, y) => x + y, 0), 0);
    const sumY = tot.reduce((a, b) => a + b, 0);
    const maxI = tot.indexOf(Math.max(...tot));
    v.innerHTML = `
      <section class="rs rs-wide" aria-labelledby="yT">
        <div class="tbd-head"><h2 id="yT">Okt 2026 bis Sep 2027</h2><span class="tbd-state"><span class="ink">teuerster Monat: ${MONTHS_LONG[months[maxI].m]} ${months[maxI].y}</span></span></div>
        <div class="tbd-fig">${fig(sumY)}</div>
        ${chain([{ label: 'Fix und Zukunft', val: eur(sumY - perSum, { cents: false }) }, { op: '+', label: 'Periodisch', val: eur(perSum, { cents: false }) }, { op: '=', label: '12 Monate', val: eur(sumY, { cents: false }), result: true }, { op: '÷', label: '12', val: eur(sumY / 12, { cents: false }) }], 'Maßkette Jahresvorschau')}
        <svg class="rchart" id="yChart" role="img" aria-label="Erwartete Zahlungen je Monat, periodische hervorgehoben"></svg>
        <div class="legend" aria-hidden="true"><span><i class="lg-sq lg-own"></i>Fix und Zukunft</span><span><i class="lg-sq sw-bound"></i>Periodisch, aus Rücklage</span><span><svg viewBox="0 0 26 8"><path class="l-plan" d="M0 4h26"/></svg>Ø je Monat</span></div>
        <p class="vnote">Sinking Funds (R05): ${eur(perSum / 12, { cents: false })} je Monat zurücklegen, dann ist jede periodische Zahlung bei Fälligkeit gedeckt.</p>
      </section>
      <section class="rs rs-wide" aria-labelledby="yK">
        <div class="tbd-head"><h2 id="yK">Zahlungskalender</h2></div>
        <div class="rscroll rsticky"><table class="rtable rgrid rg-cal"><thead><tr><th class="tech rg-first">Zahlung</th><th class="tech">Tag</th>${months.map(({ y, m }) => `<th class="tech n">${MONTHS[m]}${m === 0 ? ' ' + String(y).slice(2) : ''}</th>`).join('')}<th class="tech n rg-sum">Summe</th></tr></thead>
        <tbody>${rows.map((r) => { const mx = Math.max(...r.vals); return `<tr><th scope="row" class="rg-first">${sw(r.c.cls)}${esc(r.c.name)}</th><td class="muted">${r.c.due ? r.c.due + '.' : 'jährl.'}</td>${r.vals.map((x) => (x ? `<td class="n${r.c.kind === 'periodic' ? ' hc hc-per' : ''}"${r.c.kind === 'periodic' ? ` style="${heat(0.9)}"` : ''}>${nf0.format(Math.round(x))}</td>` : '<td class="n muted">·</td>')).join('')}<td class="n rg-sum"><strong>${nf0.format(Math.round(r.vals.reduce((a, b) => a + b, 0)))}</strong></td></tr>`; }).join('')}
          <tr class="rk-sum"><th scope="row" class="rg-first">Summe</th><td></td>${tot.map((x) => `<td class="n"><strong>${nf0.format(Math.round(x))}</strong></td>`).join('')}<td class="n rg-sum"><strong>${nf0.format(Math.round(sumY))}</strong></td></tr></tbody></table></div>
      </section>`;
    const svg = $('#yChart');
    const g = scaffold(svg, 12, 0, Math.max(...tot), { labelAt: (i) => `${MONTHS[months[i].m]}${months[i].m === 0 ? ' ' + String(months[i].y).slice(2) : ''}` });
    if (!g) return;
    months.forEach((_, i) => {
      const per = periodic.reduce((a, r) => a + r.vals[i], 0);
      bar(svg, g.x(i), g.bw * 0.56, g.y(0), g.y(tot[i] - per), 'bar-own', `Fix ${eur(tot[i] - per, { cents: false })}`);
      if (per) bar(svg, g.x(i), g.bw * 0.56, g.y(tot[i] - per), g.y(tot[i]), 'f-bound', `Periodisch ${eur(per, { cents: false })}`);
      text(svg, g.x(i), g.y(tot[i]) - 6, kfmt(tot[i]), i === maxI ? 'svg-label-strong' : 'svg-label', 'middle');
    });
    s('line', { x1: g.f.L, x2: g.f.W - g.f.R, y1: g.y(sumY / 12), y2: g.y(sumY / 12), class: 'l-plan' }, svg);
  };

  // ---------- 3.5 Sparziele-Fortschritt ----------
  const GOALS = [
    { name: 'Urlaub Sommer 2027', cat: 'Reisen', have: 540, target: 3000, due: [2027, 6], rate: 250, start: [2026, 8] },
    { name: 'Neues Fahrrad', cat: 'Anschaffungen', have: 450, target: 1200, due: [2027, 3], rate: 100, start: [2026, 3] },
    { name: 'Weihnachten 2026', cat: 'Weihnachten', have: 520, target: 800, due: [2026, 11], rate: 70, start: [2026, 0] },
    { name: 'Kfz-Service 2027', cat: 'Kfz-Service', have: 290, target: 580, due: [2027, 2], rate: 50, start: [2026, 3] },
    { name: 'Haushaltsversicherung 2027', cat: 'Haushaltsversicherung', have: 330, target: 486, due: [2027, 0], rate: 40, start: [2026, 1] },
  ];
  R.sparziele = (v) => {
    const sinking = GOALS.reduce((a, x) => a + x.have, 0);
    const ng = NOW.tagesgeld - sinking;
    const k12 = range(LAST_FULL - 11, LAST_FULL);
    const needBase = sumK(k12, (k) => CATS.filter((c) => c.cls === 'need' && c.kind !== 'periodic' && c.id !== 'kreditrate').reduce((a, c) => a + SPEND[k][c.id], 0)) / 12;
    const months = ng / needBase;
    const monthsTo = ([y, m]) => (y - 2026) * 12 + m - 8; // from September 2026
    const rows = GOALS.map((x) => {
      const left = Math.max(0, x.target - x.have);
      const mt = Math.max(1, monthsTo(x.due));
      const need = left / mt;
      const total = monthsTo(x.due) - monthsTo(x.start);
      const soll = x.target * Math.min(1, Math.max(0, (monthsTo([2026, 8]) - monthsTo(x.start)) / total));
      const eta = x.rate > 0 ? Math.ceil(left / x.rate) : Infinity;
      const etaD = new Date(2026, 8 + eta, 1);
      return { ...x, left, need, soll, onTrack: x.rate >= need - 0.5, eta: `${MONTHS[etaD.getMonth()]} ${etaD.getFullYear()}` };
    });
    const bar3 = (have, target, soll) => `<div class="gbar" role="img" aria-label="${eur(have, { cents: false })} von ${eur(target, { cents: false })}"><i style="width:${Math.min(100, (have / target) * 100)}%"></i>${soll != null ? `<span class="gbar-soll" style="left:${(soll / target) * 100}%"></span>` : ''}</div>`;
    v.innerHTML = `
      <section class="rs rs-main" aria-labelledby="zT">
        <div class="tbd-head"><h2 id="zT">Notgroschen</h2><span class="tbd-state"><span class="neg-alert">${icon('alert-circle', 'icon icon-sm')}unter Minimum 3 Monate (R02)</span></span></div>
        <div class="tbd-fig">${nf1.format(months)}<span class="cents"> Monate Bedarf</span></div>
        ${chain([{ label: 'Notgroschen', val: eur(ng, { cents: false }) }, { op: '÷', label: 'Bedarf je Monat', val: eur(needBase, { cents: false }) }, { op: '=', label: 'Reichweite', val: `${nf1.format(months)} Monate`, result: true }], 'Maßkette Notgroschen')}
        <div class="ngscale">
          ${bar3(ng, needBase * 6, null)}
          <div class="ngticks"><span style="left:0">0</span><span style="left:50%">3 Monate · Minimum</span><span style="left:100%">6 Monate · Ziel</span></div>
        </div>
        <p class="vnote">Bis zum Minimum fehlen ${eur(needBase * 3 - ng, { cents: false })}, bis zum Ziel ${eur(needBase * 6 - ng, { cents: false })}. Mit 300 € im Monat ist das Minimum im ${(() => { const d = new Date(2026, 8 + Math.ceil((needBase * 3 - ng) / 300), 1); return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`; })()} erreicht.</p>
      </section>
      <section class="rs rs-side" aria-labelledby="zS">
        <div class="tbd-head"><h2 id="zS">Tagesgeld aufgeteilt</h2></div>
        <ul class="vbars rbars">${[{ name: 'Notgroschen', v: ng }].concat(GOALS.map((x) => ({ name: x.name, v: x.have }))).map((x, i, arr) => `<li><span class="vb-name">${esc(x.name)}</span><span class="vb-bar"><i style="width:${(x.v / arr[0].v) * 100}%"></i></span><span class="vb-val">${eur(x.v, { cents: false })}</span></li>`).join('')}</ul>
        <p class="vnote">Summe ${eur(NOW.tagesgeld, { cents: false })} = Kontostand Tagesgeld.</p>
      </section>
      <section class="rs rs-wide" aria-labelledby="zL">
        <div class="tbd-head"><h2 id="zL">Sparziele</h2><span class="tbd-state"><span class="ink">${rows.filter((r) => r.onTrack).length} von ${rows.length} im Plan</span></span></div>
        <div class="goals">${rows.map((r, i) => `<div class="goal">
          <div class="goal-head"><span class="rtb-pos">${i + 1}</span><strong>${esc(r.name)}</strong><small>${esc(r.cat)} · fällig ${MONTHS[r.due[1]]} ${r.due[0]}</small></div>
          ${bar3(r.have, r.target, r.soll)}
          <div class="goal-figs"><span><strong>${eur(r.have, { cents: false })}</strong> von ${eur(r.target, { cents: false })}</span>
            <span>${r.onTrack ? `<span class="status ok">${icon('check-circle')}im Plan · fertig ${r.eta}</span>` : `<span class="status">${icon('alert')}${eur(r.need - r.rate, { cents: false })} je Monat mehr nötig</span>`}</span>
            <span class="muted">${eur(r.rate, { cents: false })} je Monat · nötig ${eur(r.need, { cents: false })}</span></div>
        </div>`).join('')}</div>
        <p class="vnote">Senkrechte Marke = Soll heute bei gleichmäßigem Sparen seit Beginn.</p>
      </section>`;
  };
})();
