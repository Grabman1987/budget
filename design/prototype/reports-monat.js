/* Finanz-App prototype · Reports, group 1: Monat und Einkommen. Sample data only. */
(() => {
  'use strict';

  const RC = window.RC;
  const {
    R, esc, icon, eur, pct, fig, chain, tri, sw, delta, sumK, nf0, nf1, MINUS, MONTHS, MONTHS_ALL, LAST_FULL,
    CATS, SPEND, PLAN, INCOME, INCOME_TYPES, PAYROLL, VPI, SALARY, salaryAt, incomeOf, consumptionOf, classOf,
    NW, OWN, MKT, RULES, AGE, s, text, path, scaffold, bar, tip, sankey, labelShort, windowK, periodName, CLASS_LABEL, heat, csvNum,
  } = RC;
  const $ = (sel, root = document) => root.querySelector(sel);
  const CLASSES = ['need', 'want', 'future'];
  const INC_CLS = { Gehalt: 'gehalt', Sonderzahlung: 'sonder', 'Beiträge von Kontakten': 'beitrag', Nebeneinkünfte: 'neben', Kapitalerträge: 'kap', Erstattungen: 'erst', Geschenke: 'gesch' };
  const mlong = (k) => MONTHS_ALL[k].long + (MONTHS_ALL[k].partial ? ' · bis 17.' : '');
  const range = (a, b) => { const out = []; for (let k = Math.max(0, a); k <= b; k++) out.push(k); return out; };
  const stepPath = (vals, x, y, bw) => vals.map((v, i) => `${i ? 'L' : 'M'}${(x(i) - bw / 2).toFixed(1)},${y(v).toFixed(1)} L${(x(i) + bw / 2).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  // Drawing-sheet frame with zone marks (1–6 across, A–F down); shared with the Jahresreport
  RC.sheetZones = () => {
    const n = [1, 2, 3, 4, 5, 6].map((i) => `<span>${i}</span>`).join('');
    const l = ['A', 'B', 'C', 'D', 'E', 'F'].map((i) => `<span>${i}</span>`).join('');
    return `<div class="ps-zones" aria-hidden="true"><div class="pz-h pz-top">${n}</div><div class="pz-h pz-bot">${n}</div><div class="pz-v pz-left">${l}</div><div class="pz-v pz-right">${l}</div></div>`;
  };
  RC.sheetTitle = (cells) => `<footer class="ps-tb">${cells.map(([label, val, cls]) => `<div class="ps-tb-cell${cls ? ' ' + cls : ''}"><span class="tech">${label}</span><strong>${val}</strong></div>`).join('')}</footer>`;
  // 50/30/20 on assigned money (RC.alloc): periodic costs and special payments as twelfths, so the parts add up to 100 %
  RC.split523 = (al) => {
    const base = al.income, spend = al.need + al.want + al.future, tot = Math.max(base, spend);
    const w = (x) => `${((Math.max(0, x) / tot) * 100).toFixed(2)}%`;
    const p = { need: Math.round((al.need / base) * 100), want: Math.round((al.want / base) * 100), future: Math.round((al.future / base) * 100) };
    const rest = 100 - p.need - p.want - p.future;
    return `<div class="b523">
      <div class="b523-bar">${CLASSES.map((c) => `<span class="sw-${c}" style="width:${w(al[c])}"></span>`).join('')}${al.rest > 0 ? `<span class="b523-rest" style="width:${w(al.rest)}"></span>` : ''}
        <i class="b523-mark" style="left:${((base * 0.5) / tot) * 100}%"></i><i class="b523-mark" style="left:${((base * 0.8) / tot) * 100}%"></i>${spend > base ? `<i class="b523-mark b523-full" style="left:${(base / tot) * 100}%"></i>` : ''}</div>
      <div class="b523-leg">${CLASSES.map((c, i) => `<span>${sw(c)}${CLASS_LABEL[c]} <strong>${p[c]} %</strong><small>${eur(al[c], { cents: false })} · Soll ${[50, 30, 20][i]}</small></span>`).join('')}
        <span><i class="sw sw-rest" aria-hidden="true"></i>${rest >= 0 ? 'Übrig' : 'Aus Guthaben'} <strong>${rest < 0 ? MINUS : ''}${Math.abs(rest)} %</strong><small>${eur(al.rest, { cents: false })}</small></span></div>
      <p class="b523-note">Zusammen 100 % von ${eur(base, { cents: false })} Einnahmen als Zwölftel. Periodische Kosten, Sonderzahlungen und ihre Umbuchungen zählen je Monat mit einem Zwölftel, deshalb weichen die Beträge vom Zahlungsmonat ab.</p>
    </div>`;
  };
  RC.revTable = (rows, empty) => `<table class="rev-table ps-revt"><thead><tr><th class="tech">Rev.</th><th class="tech">Befund</th><th class="tech n">Betrag</th><th class="tech">Regel</th></tr></thead><tbody>${rows.map(([f, amt, rule], i) => `<tr><td class="rev-mark">${tri(String.fromCharCode(65 + i))}</td><td>${esc(f)}</td><td class="n">${amt}</td><td class="tech">${rule}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">${empty}</td></tr>`}</tbody></table>`;

  // ---------- 1.1 Monats-One-Pager ----------
  R.onepager = (v, st) => {
    const k = st.k, mo = MONTHS_ALL[k], pk = Math.max(0, k - 1);
    const E = incomeOf(k), K = consumptionOf(k), Z = classOf(k, 'future');
    const saved = E - K, rest = saved - Z;
    const cls = { need: classOf(k, 'need'), want: classOf(k, 'want'), future: Z };
    const nwPrev = k ? NW[k - 1] : NW.start;
    const cats = CATS.filter((c) => c.cls !== 'future').map((c) => ({ c, v: SPEND[k][c.id], p: SPEND[pk][c.id] })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    const top = cats.slice(0, 8), maxV = top.length ? top[0].v : 1;
    const budg = CATS.filter((c) => c.cls !== 'future' && PLAN[k][c.id] > 0).map((c) => ({ c, ist: SPEND[k][c.id], plan: PLAN[k][c.id] }));
    const over = budg.filter((b) => b.ist > b.plan + 1).sort((a, b) => (b.ist - b.plan) - (a.ist - a.plan));
    const idx = Math.max(0, k - 24);
    const rs = RULES.map((r) => r.hist[Math.min(11, idx)]);
    const cnt = { ok: rs.filter((x) => x === 'ok').length, warn: rs.filter((x) => x === 'warn').length, bad: rs.filter((x) => x === 'bad').length };

    const finds = []; // [Befund, Betrag, Regel]
    if (mo.partial) finds.push(['Laufender Monat bis 17.09.: Gehalt und Beitrag Miete folgen am 30.', eur(salaryAt(mo.key).net + 800, { cents: false, sign: true }), 'R04']);
    if (INCOME[k].Sonderzahlung) finds.push(['Sonderzahlung verteilt: 50 % ETF, 20 % Notgroschen, Rest frei', eur(INCOME[k].Sonderzahlung, { cents: false, sign: true }), 'R12']);
    if (k && salaryAt(mo.key).net !== salaryAt(MONTHS_ALL[k - 1].key).net) finds.push(['Gehaltserhöhung, netto je Monat', eur(salaryAt(mo.key).net - salaryAt(MONTHS_ALL[k - 1].key).net, { sign: true }), '–']);
    CATS.filter((c) => c.kind === 'fix' && (c.price || []).some(([from], i) => i > 0 && from === mo.key)).forEach((c) => {
      finds.push([`${c.name} teurer: ${eur(RC.priceAt(c, MONTHS_ALL[k - 1].key))} → ${eur(RC.priceAt(c, mo.key))} je Monat`, eur((RC.priceAt(c, mo.key) - RC.priceAt(c, MONTHS_ALL[k - 1].key)) * 12, { sign: true }) + ' p. a.', 'R10']);
    });
    CATS.filter((c) => c.kind === 'periodic' && SPEND[k][c.id] > 0).forEach((c) => finds.push([`${c.name} fällig, aus der Rücklage bezahlt`, eur(-SPEND[k][c.id], { cents: false }), 'R05']));
    const jump = cats.filter((x) => x.c.kind === 'var').map((x) => ({ ...x, d: x.v - x.p })).sort((a, b) => b.d - a.d)[0];
    if (jump && jump.d > 40) finds.push([`${jump.c.name} über ${MONTHS_ALL[pk].long}`, eur(jump.d, { cents: false, sign: true }), '–']);
    if (over.length) finds.push([`${over.length} ${over.length === 1 ? 'Kategorie' : 'Kategorien'} über Plan, am meisten ${over[0].c.name}`, eur(over[0].ist - over[0].plan, { sign: true }), '–']);
    const yymm = `${String(mo.y).slice(2)}${String(mo.m + 1).padStart(2, '0')}`;

    v.innerHTML = `<div class="psheet-wrap">
      <article class="psheet" aria-label="Monats-One-Pager ${esc(mo.long)}">
        ${RC.sheetZones()}
        <div class="ps-body">
          <header class="ps-head">
            <div><h2>${esc(mo.long)}${mo.partial ? ' <small>laufend</small>' : ''}</h2></div>
            <div class="ps-fig"><span class="tech">Gespart</span><strong>${fig(saved)}</strong><span>Sparquote ${E > 0 ? pct(saved / E) : '–'}</span></div>
          </header>
          ${chain([
            { label: 'Einnahmen', val: eur(E, { cents: false }) },
            { op: MINUS, label: 'Konsum', val: eur(K, { cents: false }) },
            { op: '=', label: 'Gespart', val: eur(saved, { cents: false }), result: true },
            { op: MINUS, label: 'Zukunft', val: eur(Z, { cents: false }) },
            { op: '=', label: rest >= 0 ? 'Übrig' : 'Aus Guthaben', val: eur(rest, { cents: false }) },
          ], 'Maßkette des Monats')}
          <div class="ps-grid">
            <section class="ps-sec ps-523"><h3 class="ps-h"><span>A</span>Verteilung 50/30/20</h3>${RC.split523(RC.alloc([k]))}</section>
            <section class="ps-sec ps-nw"><h3 class="ps-h"><span>B</span>Nettovermögen</h3>
              <div class="ps-nwfig"><strong>${eur(NW[k], { cents: false })}</strong>${delta(NW[k] - nwPrev)}</div>
              <svg class="ps-mini" id="psNw" role="img" aria-label="Nettovermögen der letzten 12 Monate"></svg>
              <p class="ps-note">Eigenleistung ${eur(OWN[k], { cents: false, sign: true })} · Markt ${eur(MKT[k], { cents: false, sign: true })}</p>
            </section>
            <section class="ps-sec ps-top"><h3 class="ps-h"><span>C</span>Größte Ausgaben</h3>
              <table class="ps-cats"><tbody>${top.map((x) => `<tr><td>${sw(x.c.cls)}${esc(x.c.name)}</td><td class="ps-bar"><i style="width:${(x.v / maxV) * 100}%"></i></td><td class="n">${eur(x.v, { cents: false })}</td><td class="n">${delta(x.v - x.p)}</td></tr>`).join('')}</tbody></table>
              <p class="ps-note">Veränderung gegenüber ${esc(MONTHS_ALL[pk].long)}.</p>
            </section>
            <section class="ps-sec ps-bud"><h3 class="ps-h"><span>D</span>Plan</h3>
              <div class="ps-kpi"><strong>${over.length}</strong><span>von ${budg.length} Kategorien über Plan</span></div>
              <ul class="ps-over">${over.slice(0, 4).map((b) => `<li><span>${esc(b.c.name)}</span><span class="n">${eur(b.ist, { cents: false })} <small>/ ${eur(b.plan, { cents: false })}</small></span></li>`).join('') || '<li class="muted">Keine Überschreitung.</li>'}</ul>
            </section>
            <section class="ps-sec ps-chk"><h3 class="ps-h"><span>E</span>Finanz-Check</h3>
              <div class="ps-kpi"><strong>${cnt.ok}</strong><span>von 16 Regeln erfüllt</span></div>
              <div class="chk-cells ps-cells" role="img" aria-label="${cnt.ok} erfüllt, ${cnt.warn} Warnung, ${cnt.bad} verletzt">${rs.map((c) => `<span class="cell cell-${c}"></span>`).join('')}</div>
              <p class="ps-note">${cnt.warn} Warnung · ${cnt.bad} verletzt: ${RULES.filter((r, i) => rs[i] === 'bad').map((r) => esc(r.name)).join(', ') || 'keine'}</p>
            </section>
            <section class="ps-sec ps-wide"><h3 class="ps-h"><span>F</span>Ausgaben im Monatsverlauf</h3>
              <svg class="ps-chart ps-pace" id="psPace" role="img" aria-label="Kumulierte Ausgaben je Tag gegen Plan und Vormonat"></svg>
              <div class="legend" aria-hidden="true"><span><svg viewBox="0 0 26 8"><path class="l-actual" d="M0 4h26"/></svg>Ist, kumuliert</span><span><svg viewBox="0 0 26 8"><path class="l-plan" d="M0 4h26"/></svg>Plan</span><span><svg viewBox="0 0 26 8"><path class="l-prev" d="M0 4h26"/></svg>${esc(MONTHS_ALL[pk].long)}</span></div>
            </section>
            <section class="ps-sec ps-wide ps-rev"><h3 class="ps-h"><span>G</span>Revisionen des Monats</h3>
              ${RC.revTable(finds.slice(0, 5), 'Ein ruhiger Monat.')}
            </section>
          </div>
          ${RC.sheetTitle([['Benennung', 'Monats-One-Pager', 'ps-tb-name'], ['Monat', esc(mo.long)], ['Stand', '17.09.2026'], ['Zeichnungs-Nr.', `FA-R1.1-${yymm}`], ['Einheit', '€'], ['Blatt', '1 / 1']])}
        </div>
      </article></div>`;

    const svg = $('#psNw');
    const ks = range(k - 11, k);
    const g = scaffold(svg, ks.length, Math.min(...ks.map((i) => NW[i])), Math.max(...ks.map((i) => NW[i])), { zero: false, L: 40, R: 8, T: 6, B: 20, pad: 0.12, labelAt: (i) => labelShort(ks[i]), maxLabels: 4 });
    if (!g) return;
    path(svg, ks.map((i, j) => [g.x(j), g.y(NW[i])]), 'l-actual');
    s('circle', { cx: g.x(ks.length - 1), cy: g.y(NW[k]), r: 3.5, class: 'dot-actual' }, svg);
    // F: cumulative spending per day (consumption, without Zukunft), plan and previous month
    const cur = dailyCum(k), prv = k ? dailyCum(k - 1) : null;
    const pv = $('#psPace');
    const hiP = Math.max(cur.plan[cur.dim], cur.act[cur.last], prv ? prv.act[prv.last] : 0);
    const gp = scaffold(pv, cur.dim, 0, hiP, { L: 44, R: 60, T: 10, B: 22, labelAt: (i) => ((i + 1) % 5 === 0 || i === 0 ? `${i + 1}.` : ''), maxLabels: 31 });
    if (!gp) return;
    const stepD = (arr, n) => { let d = `M${gp.f.L},${gp.y(0)}`; for (let i = 1; i <= n; i++) d += ` L${(gp.x(i - 1) - gp.bw / 2).toFixed(1)},${gp.y(arr[i]).toFixed(1)} L${(gp.x(i - 1) + gp.bw / 2).toFixed(1)},${gp.y(arr[i]).toFixed(1)}`; return d; };
    if (prv) s('path', { d: stepD(prv.act, Math.min(prv.last, cur.dim)), class: 'l-prev' }, pv);
    s('path', { d: stepD(cur.plan, cur.dim), class: 'l-plan' }, pv);
    s('path', { d: stepD(cur.act, cur.last), class: 'l-actual' }, pv);
    const endX = gp.x(cur.last - 1) + gp.bw / 2;
    s('circle', { cx: endX, cy: gp.y(cur.act[cur.last]), r: 3.5, class: 'dot-actual' }, pv);
    text(pv, endX + 6, gp.y(cur.act[cur.last]) - 6, RC.kfmt(cur.act[cur.last]), 'svg-label-strong');
    text(pv, gp.f.W - gp.f.R + 6, gp.y(cur.plan[cur.dim]) + 4, `Plan ${RC.kfmt(cur.plan[cur.dim])}`, 'svg-label');
  };
  function dailyCum(k) {
    const mo = MONTHS_ALL[k];
    const dim = new Date(mo.y, mo.m + 1, 0).getDate(), last = mo.partial ? 17 : dim;
    const act = new Array(dim + 1).fill(0), plan = new Array(dim + 1).fill(0);
    let sd = k * 97 + 13;
    const rnd = () => { sd = (sd * 9301 + 49297) % 233280; return sd / 233280; };
    CATS.filter((c) => c.cls !== 'future').forEach((c) => {
      const ist = SPEND[k][c.id], pl = PLAN[k][c.id];
      if (c.kind === 'fix') { const d = Math.min(c.due, dim); act[d] += ist; plan[d] += pl; } else if (c.kind === 'periodic') { act[Math.min(8, last)] += ist; plan[8] += pl; } else {
        const w = Array.from({ length: last }, () => 0.35 + rnd());
        const sw2 = w.reduce((a, b) => a + b, 0);
        w.forEach((x, i) => { act[i + 1] += (ist * x) / sw2; });
        for (let d = 1; d <= dim; d++) plan[d] += pl / dim;
      }
    });
    for (let d = 1; d <= dim; d++) { act[d] += act[d - 1]; plan[d] += plan[d - 1]; }
    return { act, plan, dim, last };
  }

  // ---------- 1.2 Gehaltsreport ----------
  // payslip lines like the salary workbook: allowances, the two social-security and tax blocks, other deductions
  const RAISES = { '2024-04': { kv: 0.03, bs: 0 }, '2025-04': { kv: 0.0165, bs: 0 }, '2026-04': { kv: 0.012, bs: 0.0097 } };
  const slip = (k) => {
    const mo = MONTHS_ALL[k], x = salaryAt(mo.key);
    const zul = [['Telearbeitspauschale', mo.key >= '2024-01' ? 26.4 : 0], ['Fahrtkostenzuschuss', 30]];
    const zsum = zul.reduce((a, z) => a + z[1], 0);
    const sv = RC.r2(x.gross * 0.1812);
    const other = [['Gewerkschaftsbeitrag', RC.r2(Math.min(x.gross * 0.01, 44))], ['Betriebsratsumlage', 6], ['Essen Kantine', 42]];
    const osum = other.reduce((a, o) => a + o[1], 0);
    const lst = RC.r2(x.gross - sv - osum - x.net);
    const special = mo.m === 5 || mo.m === 10 ? { name: mo.m === 5 ? 'Urlaubszuschuss' : 'Weihnachtsremuneration', gross: x.gross, sv: RC.r2(x.gross * 0.1712), net: INCOME[k].Sonderzahlung } : null;
    if (special) special.lst = RC.r2(special.gross - special.sv - special.net);
    return { k, gross: x.gross, base: RC.r2(x.gross - zsum), zul, sv, lst, other, osum, net: x.net, special, expected: mo.partial };
  };
  RC.slip = slip;
  const yearsOf = () => [2024, 2025, 2026].map((y) => {
    const ks = MONTHS_ALL.filter((mo) => mo.y === y && !mo.partial).map((mo) => mo.k);
    const ps = ks.map(slip);
    const gross = ps.reduce((a, p) => a + p.gross + (p.special ? p.special.gross : 0), 0);
    const net = ps.reduce((a, p) => a + p.net + (p.special ? p.special.net : 0), 0);
    const sz = ps.reduce((a, p) => a + (p.special ? p.special.gross : 0), 0);
    return { y, n: ks.length, gross, net, sz, ks, ms: ks.map((k) => MONTHS_ALL[k].m) };
  });
  // gross of the previous year over the same calendar months (for part years)
  const sameMonths = (pv, ms) => { const ks = pv.ks.filter((k) => ms.includes(MONTHS_ALL[k].m)); if (ks.length < ms.length) return null; return ks.reduce((a, k) => { const s2 = slip(k); return a + s2.gross + (s2.special ? s2.special.gross : 0); }, 0); };
  R.gehalt = (v, st) => {
    const k = st.k, mo = MONTHS_ALL[k], p = slip(k);
    const share = (x) => `${((x / p.gross) * 100).toFixed(1).replace('.', ',')} %`;
    const raises = [];
    for (let i = 1; i < SALARY.length; i++) {
      const a = SALARY[i - 1], b = SALARY[i];
      const y = +b.from.slice(0, 4);
      const nom = b.net / a.net - 1, gnom = b.gross / a.gross - 1;
      raises.push({ from: b.from, gross: b.gross, net: b.net, nom, gnom, ...RAISES[b.from], vpi: VPI[y], real: (1 + nom) / (1 + VPI[y]) - 1 });
    }
    const years = yearsOf();
    // monthly payout per calendar year, like the workbook dashboard
    const grid = MONTHS.map((mn, m) => years.map((yy) => { const i = RC.idx(yy.y, m); if (i < 0 || MONTHS_ALL[i].partial) return null; const s2 = slip(i); return s2.net + (s2.special ? s2.special.net : 0); }));
    const yl = years.length;
    v.innerHTML = `
      <section class="rs rs-main" aria-labelledby="gT">
        <div class="tbd-head"><h2 id="gT">Auszahlung ${esc(mo.long)}</h2>
          <div class="rtools"><span class="tbd-state">${p.expected ? `<span class="ink">${icon('clock', 'icon icon-sm')}erwartet am 30.09.</span>` : `<span class="ok">${icon('check-circle', 'icon icon-sm')}eingegangen am 30.</span>`}</span>
          <button class="btn btn-primary btn-sm" type="button" id="slipAdd">${icon('plus')}Gehaltszettel hinzufügen</button></div></div>
        <div class="tbd-fig">${fig(p.net + (p.special ? p.special.net : 0))}</div>
        ${chain([
          { label: 'Brutto', val: eur(p.gross) },
          { op: MINUS, label: 'Sozialversicherung', val: eur(p.sv) },
          { op: MINUS, label: 'Lohnsteuer', val: eur(p.lst) },
          { op: MINUS, label: 'Sonstige Abzüge', val: eur(p.osum) },
          { op: '=', label: 'Auszahlung laufend', val: eur(p.net), result: true },
        ], 'Maßkette Brutto zu Auszahlung')}
        <div class="gsplit" role="img" aria-label="Brutto aufgeteilt: Auszahlung ${share(p.net)}, Sozialversicherung ${share(p.sv)}, Lohnsteuer ${share(p.lst)}, sonstige Abzüge ${share(p.osum)}">
          <span class="gs-net" style="width:${(p.net / p.gross) * 100}%"><b>Auszahlung ${share(p.net)}</b></span>
          <span class="gs-sv" style="width:${(p.sv / p.gross) * 100}%"><b>SV ${share(p.sv)}</b></span>
          <span class="gs-lst" style="width:${(p.lst / p.gross) * 100}%"><b>LSt ${share(p.lst)}</b></span>
          <span class="gs-oth" style="width:${(p.osum / p.gross) * 100}%"></span>
        </div>
        ${p.special ? `<div class="gspecial"><h3>${esc(p.special.name)}</h3>${chain([
          { label: 'Brutto', val: eur(p.special.gross) }, { op: MINUS, label: 'SV', val: eur(p.special.sv) }, { op: MINUS, label: 'LSt 6 %', val: eur(p.special.lst) }, { op: '=', label: 'Auszahlung', val: eur(p.special.net), result: true },
        ], 'Maßkette Sonderzahlung')}<p class="vnote">Sonderzahlungen sind begünstigt besteuert; nach R12 fließen 50 % ins ETF und 20 % in den Notgroschen.</p></div>` : ''}
      </section>
      <section class="rs rs-side" aria-labelledby="gZ">
        <div class="tbd-head"><h2 id="gZ">Gehaltszettel ${esc(MONTHS[mo.m])} ${mo.y}</h2></div>
        <table class="rtable rslip"><tbody>
          <tr class="rp-grp"><td class="col-pos">1</td><td><strong>Bezüge</strong></td><td class="n"><strong>${eur(p.gross + (p.special ? p.special.gross : 0))}</strong></td></tr>
          <tr><td class="col-pos">1.1</td><td>Gehalt</td><td class="n">${eur(p.base)}</td></tr>
          ${p.zul.filter((z) => z[1]).map((z, i) => `<tr><td class="col-pos">1.${i + 2}</td><td>${esc(z[0])}</td><td class="n">${eur(z[1])}</td></tr>`).join('')}
          ${p.special ? `<tr><td class="col-pos">1.${p.zul.filter((z) => z[1]).length + 2}</td><td>${esc(p.special.name)}</td><td class="n">${eur(p.special.gross)}</td></tr>` : ''}
          <tr class="rp-grp"><td class="col-pos">2</td><td><strong>Abzüge</strong></td><td class="n"><strong>${eur(-(p.sv + p.lst + p.osum + (p.special ? p.special.sv + p.special.lst : 0)))}</strong></td></tr>
          <tr><td class="col-pos">2.1</td><td>SV laufend</td><td class="n">${eur(-p.sv)}</td></tr>
          ${p.special ? `<tr><td class="col-pos">2.2</td><td>SV Sonderzahlung</td><td class="n">${eur(-p.special.sv)}</td></tr>` : ''}
          <tr><td class="col-pos">2.${p.special ? 3 : 2}</td><td>LSt laufend</td><td class="n">${eur(-p.lst)}</td></tr>
          ${p.special ? `<tr><td class="col-pos">2.4</td><td>LSt Sonderzahlung</td><td class="n">${eur(-p.special.lst)}</td></tr>` : ''}
          ${p.other.map((o, i) => `<tr><td class="col-pos">2.${(p.special ? 5 : 3) + i}</td><td>${esc(o[0])}</td><td class="n">${eur(-o[1])}</td></tr>`).join('')}
          <tr class="is-total"><td></td><td>Auszahlung</td><td class="n">${eur(p.net + (p.special ? p.special.net : 0))}</td></tr>
        </tbody></table>
        <p class="vnote">${p.expected ? 'Voraussichtlicher Zettel; der echte ersetzt ihn beim Hinzufügen.' : 'Abgelegt in Dropbox › Finanzen › Einkommen › Gehalt.'}</p>
      </section>
      <section class="rs rs-wide" aria-labelledby="gV">
        <div class="tbd-head"><h2 id="gV">Verlauf seit Okt 2023</h2></div>
        <svg class="rchart" id="gChart" role="img" aria-label="Brutto und Auszahlung je Monat, Gehaltserhöhungen markiert"></svg>
        <div class="legend" aria-hidden="true">
          <span><svg viewBox="0 0 26 8"><path class="l-actual" d="M0 4h26"/></svg>Auszahlung laufend</span>
          <span><svg viewBox="0 0 26 8"><path class="l-gross" d="M0 4h26"/></svg>Brutto</span>
          <span><svg viewBox="0 0 12 10"><path class="kote" d="M1 1h10L6 9Z"/></svg>Gehaltserhöhung</span>
        </div>
      </section>
      <section class="rs rs-wide" aria-labelledby="gM">
        <div class="tbd-head"><h2 id="gM">Auszahlung je Monat und Jahr</h2></div>
        <div class="rscroll"><table class="rtable rgrid"><thead><tr><th class="tech rg-first">Monat</th>${years.map((yy) => `<th class="tech n">${yy.y}</th>`).join('')}<th class="tech n rg-sum">${years[yl - 1].y} zu ${years[yl - 2].y}</th></tr></thead>
        <tbody>${MONTHS.map((mn, m) => { const row = grid[m]; const a = row[yl - 1], b = row[yl - 2]; return `<tr><th scope="row" class="rg-first">${RC.MONTHS_LONG[m]}</th>${row.map((x) => `<td class="n">${x == null ? '<span class="muted">–</span>' : nf0.format(Math.round(x))}</td>`).join('')}<td class="n rg-sum">${a != null && b ? `<span class="dl ${a >= b ? 'dl-good' : 'dl-bad'}">${pct(a / b - 1, true)}</span>` : '<span class="muted">–</span>'}</td></tr>`; }).join('')}
          <tr class="rk-sum"><th scope="row" class="rg-first">Summe</th>${years.map((yy) => `<td class="n">${nf0.format(Math.round(yy.net))}</td>`).join('')}<td class="n rg-sum">${(() => { const a = years[yl - 1], b = years[yl - 2]; const bs = b.ks.filter((k) => a.ms.includes(MONTHS_ALL[k].m)).reduce((x, k) => { const s2 = slip(k); return x + s2.net + (s2.special ? s2.special.net : 0); }, 0); return `<span class="dl ${a.net >= bs ? 'dl-good' : 'dl-bad'}">${pct(a.net / bs - 1, true)}</span><small class="muted">gleiche Monate</small>`; })()}</td></tr></tbody></table></div>
      </section>
      <section class="rs rs-wide" aria-labelledby="gJ">
        <div class="tbd-head"><h2 id="gJ">Jahresgehälter</h2></div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Jahr</th><th class="tech n">Brutto p. a.</th><th class="tech n">davon Sonderzahlungen</th><th class="tech n">Zuwachs zum Vorjahr</th><th class="tech n">Zuwachsrate</th><th class="tech n">Auszahlung p. a.</th><th class="tech n">Abzugsquote</th></tr></thead>
        <tbody>${years.map((yy, i) => { const pv = years[i - 1]; const same = pv ? sameMonths(pv, yy.ms) : null; return `<tr><td>${yy.y}${yy.n < 12 ? ` <small class="muted">${yy.n} Monate</small>` : ''}</td><td class="n"><strong>${eur(yy.gross, { cents: false })}</strong></td><td class="n">${eur(yy.sz, { cents: false })}</td><td class="n">${same ? eur(yy.gross - same, { cents: false, sign: true }) + (yy.n < 12 ? `<small class="muted">gleiche Monate ${pv.y}</small>` : '') : '<span class="muted">–</span>'}</td><td class="n">${same ? `<span class="dl ${yy.gross >= same ? 'dl-good' : 'dl-bad'}">${pct(yy.gross / same - 1, true)}</span>` : '<span class="muted">–</span>'}</td><td class="n">${eur(yy.net, { cents: false })}</td><td class="n">${nf1.format((1 - yy.net / yy.gross) * 100)} %</td></tr>`; }).join('')}</tbody></table></div>
      </section>
      <section class="rs rs-wide" aria-labelledby="gR">
        <div class="tbd-head"><h2 id="gR">Gehaltserhöhungen gegen Inflation</h2></div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Ab</th><th class="tech n">Brutto</th><th class="tech n">Kollektiverhöhung</th><th class="tech n">Biennalsprung</th><th class="tech n">Auszahlung</th><th class="tech n">Auszahlung nominal</th><th class="tech n">VPI im Jahr</th><th class="tech n">Auszahlung real</th></tr></thead>
        <tbody>${raises.map((r) => `<tr><td>${MONTHS[+r.from.slice(5) - 1]} ${r.from.slice(0, 4)}</td><td class="n">${eur(r.gross, { cents: false })}</td><td class="n">${pct(r.kv, true)}</td><td class="n">${r.bs ? pct(r.bs, true) : '<span class="muted">–</span>'}</td><td class="n">${eur(r.net, { cents: false })}</td><td class="n">${pct(r.nom, true)}</td><td class="n">${pct(r.vpi)}</td><td class="n"><strong><span class="dl ${r.real >= 0 ? 'dl-good' : 'dl-bad'}">${pct(r.real, true)}</span></strong></td></tr>`).join('')}</tbody></table></div>
        <p class="vnote">Real = Erhöhung der Auszahlung bereinigt um den Verbraucherpreisindex des Jahres (Beispielwerte). Die eigene Inflation steht im Report 2.4.</p>
      </section>`;

    $('#slipAdd').addEventListener('click', () => openSlip(k));
    const svg = $('#gChart');
    const ks = range(0, 35);
    const vals = ks.map((i) => slip(i));
    const g = scaffold(svg, ks.length, 0, Math.max(...vals.map((x) => x.gross)), { labelAt: (i) => labelShort(i, i === 0), maxLabels: 9, T: 26 });
    if (!g) return;
    s('path', { d: stepPath(vals.map((x) => x.gross), g.x, g.y, g.bw), class: 'l-gross' }, svg);
    s('path', { d: stepPath(vals.map((x) => x.net), g.x, g.y, g.bw), class: 'l-actual' }, svg);
    s('rect', { x: g.x(k) - g.bw / 2, y: g.f.T - 14, width: g.bw, height: g.f.B - g.f.T + 14, class: 'hl-band' }, svg);
    SALARY.slice(1).forEach((sa) => {
      const i = MONTHS_ALL.findIndex((m2) => m2.key === sa.from);
      const yy = g.y(sa.net) - 8;
      s('path', { d: `M${g.x(i) - g.bw / 2 - 5},${yy - 8}h10l-5,8Z`, class: 'kote' }, svg);
      text(svg, g.x(i) - g.bw / 2, yy - 12, eur(sa.net, { cents: false }), 'svg-label-line', 'middle');
    });
  };

  // "Gehaltszettel hinzufügen": upload (lands in Dropbox in V1) or enter the lines column by column
  const parseNum = (s2) => { const x = String(s2 || '').trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.'); return x ? +x : 0; };
  function openSlip(k) {
    const mo = MONTHS_ALL[Math.min(k + (MONTHS_ALL[k].partial ? 0 : 1), 35)];
    const f = (id, label, val = '') => `<label class="slip-f"><span>${esc(label)}</span><span class="amount-field amount-field-sm"><input class="amount-input" id="${id}" inputmode="decimal" autocomplete="off" value="${val}"><span class="amount-cur">€</span></span></label>`;
    RC.openPanel('Gehaltszettel hinzufügen', `
      <p class="panel-sub">Für ${esc(mo.long)}. Hochladen oder Wert für Wert eingeben; beides landet im Gehaltsreport.</p>
      <div class="seg slip-seg" role="group" aria-label="Art der Erfassung"><button type="button" data-slip="up" aria-pressed="true">PDF hochladen</button><button type="button" data-slip="manual" aria-pressed="false">Werte eingeben</button></div>
      <div id="slipUp" class="slip-pane">
        <label class="slip-drop"><input type="file" id="slipFile" accept=".pdf,.png,.jpg,.jpeg"><span>${icon('download')}<strong>Datei wählen</strong><small>PDF oder Foto des Gehaltszettels</small></span></label>
        <p class="vnote" id="slipFileNote">Ablage: Dropbox › Finanzen › Einkommen › Gehalt › ${mo.key} Gehaltszettel.pdf. Die Werte werden ausgelesen und dir zum Prüfen vorgelegt.</p>
      </div>
      <div id="slipManual" class="slip-pane" hidden>
        <h3 class="slip-h tech">1 Bezüge</h3>
        ${f('sGeh', 'Gehalt')}${f('sZul', 'Zulagen (Telearbeit, Fahrtkosten)')}${f('sUeb', 'Überstunden und Zuschläge')}${f('sSz', 'Sonderzahlung')}
        <h3 class="slip-h tech">2 Abzüge</h3>
        ${f('sSv', 'SV laufend')}${f('sSvSz', 'SV Sonderzahlung')}${f('sLst', 'LSt laufend')}${f('sLstSz', 'LSt Sonderzahlung')}${f('sSon', 'Sonstige Abzüge (Gewerkschaft, Betriebsrat, Essen)')}
        <h3 class="slip-h tech">3 Kontrolle</h3>
        ${f('sAus', 'Auszahlung laut Zettel')}
        <div class="slip-sum" id="slipSum"></div>
      </div>
      <div class="panel-actions"><button class="btn btn-ghost" type="button" data-close>Abbrechen</button><button class="btn btn-primary" type="button" id="slipSave">${icon('check')}Ablegen</button></div>`, (body) => {
      const setMode = (m) => { body.querySelectorAll('[data-slip]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.slip === m)); body.querySelector('#slipUp').hidden = m !== 'up'; body.querySelector('#slipManual').hidden = m !== 'manual'; };
      body.querySelectorAll('[data-slip]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.slip)));
      const file = body.querySelector('#slipFile');
      file.addEventListener('change', () => { if (file.files[0]) body.querySelector('#slipFileNote').textContent = `${file.files[0].name} · wird abgelegt unter Dropbox › Finanzen › Einkommen › Gehalt › ${mo.key} Gehaltszettel${file.files[0].name.slice(file.files[0].name.lastIndexOf('.'))}`; });
      const calc = () => {
        const v2 = (id) => parseNum(body.querySelector('#' + id).value);
        const brutto = v2('sGeh') + v2('sZul') + v2('sUeb') + v2('sSz');
        const abz = v2('sSv') + v2('sSvSz') + v2('sLst') + v2('sLstSz') + v2('sSon');
        const aus = brutto - abz, laut = v2('sAus');
        const ok = laut && Math.abs(aus - laut) < 0.01;
        body.querySelector('#slipSum').innerHTML = `${chain([{ label: 'Brutto', val: eur(brutto) }, { op: MINUS, label: 'Abzüge', val: eur(abz) }, { op: '=', label: 'Auszahlung', val: eur(aus), result: true }], 'Kontrolle Gehaltszettel')}
          <p class="status ${laut ? (ok ? 'ok' : 'bad') : ''}">${laut ? (ok ? `${icon('check-circle')}stimmt mit dem Zettel überein` : `${icon('alert-circle')}weicht um ${eur(aus - laut, { sign: true })} vom Zettel ab`) : 'Auszahlung laut Zettel eintragen, dann wird geprüft.'}</p>`;
      };
      body.querySelectorAll('.amount-input').forEach((i) => i.addEventListener('input', calc));
      calc();
      body.querySelector('#slipSave').addEventListener('click', () => { RC.closePanel(); RC.toast(`Gehaltszettel ${mo.long}: im Prototyp nicht gespeichert, in V1 abgelegt und verbucht.`); });
    });
  }
  const MONTHS_LONG_OF = (k) => RC.MONTHS_LONG[MONTHS_ALL[k].m];

  // ---------- 1.3 Einnahmen ----------
  function expectedIncome(k) {
    const mo = MONTHS_ALL[k], inc = INCOME[k];
    const rows = [];
    const add = (name, sub, exp, got, day) => {
      const pending = mo.partial && day > 17;
      const st = pending ? 'pending' : Math.abs(got - exp) < 1 ? 'ok' : got > 0 ? 'diff' : 'missing';
      rows.push({ name, sub, exp, got: pending ? 0 : got, day, st });
    };
    add('Gehalt', 'Arbeitgeber · Girokonto', salaryAt(mo.key).net, inc.Gehalt, 30);
    add('Mietanteil M. Muster', 'Mitbewohner · Kontakt', mo.key >= '2025-01' ? 800 : 750, inc['Beiträge von Kontakten'], 30);
    if (inc.Sonderzahlung) add('Sonderzahlung', 'Arbeitgeber · Girokonto', inc.Sonderzahlung, inc.Sonderzahlung, 30);
    if (RC.DIVIDENDS[k]) add('Ausschüttung ETF', 'Depot', Math.round(RC.DIVIDENDS[k] / 10) * 10, RC.DIVIDENDS[k], 15);
    return rows;
  }
  R.einnahmen = (v, st) => {
    const k = st.k, mo = MONTHS_ALL[k];
    const ks = range(k - 11, k);
    const E = incomeOf(k);
    const exp = expectedIncome(k);
    const open = exp.filter((r) => r.st === 'pending');
    const types = INCOME_TYPES.map((t) => ({ t, m: INCOME[k][t], sum: sumK(ks, (i) => INCOME[i][t]) })).filter((x) => x.sum > 0);
    const tot12 = types.reduce((a, x) => a + x.sum, 0);
    const stLabel = { ok: ['check-circle', 'eingegangen', 'ok'], pending: ['clock', 'erwartet', ''], diff: ['alert', 'abweichend', ''], missing: ['alert-circle', 'fehlt', 'bad'] };
    v.innerHTML = `
      <section class="rs rs-main" aria-labelledby="eT">
        <div class="tbd-head"><h2 id="eT">Einnahmen ${esc(mlong(k))}</h2><span class="tbd-state">${open.length ? `<span class="ink">${icon('clock', 'icon icon-sm')}${open.length} erwartet, ${eur(open.reduce((a, r) => a + r.exp, 0), { cents: false })}</span>` : `<span class="ok">${icon('check-circle', 'icon icon-sm')}alles Erwartete eingegangen</span>`}</span></div>
        <div class="tbd-fig">${fig(E)}</div>
        <svg class="rchart" id="eChart" role="img" aria-label="Einnahmen nach Art, 12 Monate"></svg>
        <div class="legend" aria-hidden="true">${types.map((x) => `<span><i class="lg-sq sw-${INC_CLS[x.t]}"></i>${esc(x.t)}</span>`).join('')}</div>
      </section>
      <section class="rs rs-side" aria-labelledby="eS">
        <div class="tbd-head"><h2 id="eS">Erwartet gegen eingegangen</h2></div>
        <div class="rscroll"><table class="rtable rexp"><thead><tr><th class="tech">Zahlung</th><th class="tech n">Erwartet</th><th class="tech n">Eingegangen</th><th class="tech">Status</th></tr></thead>
        <tbody>${exp.map((r) => { const [ic, l, c] = stLabel[r.st]; return `<tr><td><strong>${esc(r.name)}</strong><small>${esc(r.sub)} · ${r.day}.</small></td><td class="n">${eur(r.exp)}</td><td class="n">${r.got ? eur(r.got) : '–'}</td><td><span class="status ${c}">${icon(ic)}${l}${r.st === 'diff' ? ` ${eur(r.got - r.exp, { sign: true })}` : ''}</span></td></tr>`; }).join('')}</tbody></table></div>
        <p class="vnote">Erwartete Zahlungen ordnet der Nachtlauf automatisch zu; Abweichungen landen im Posteingang.</p>
      </section>
      <section class="rs rs-wide" aria-labelledby="eA">
        <div class="tbd-head"><h2 id="eA">Nach Art, ${esc(labelShort(ks[0], true))} bis ${esc(labelShort(k, true))}</h2></div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Art</th><th class="tech n">${esc(labelShort(k, true))}</th><th class="tech n">Ø Monat</th><th class="tech n">Summe 12 M</th><th class="tech n">Anteil</th></tr></thead>
        <tbody>${types.map((x) => `<tr><td>${sw(INC_CLS[x.t])}${esc(x.t)}</td><td class="n">${eur(x.m)}</td><td class="n">${eur(x.sum / ks.length)}</td><td class="n"><strong>${eur(x.sum, { cents: false })}</strong></td><td class="n">${pct(x.sum / tot12)}</td></tr>`).join('')}
        <tr class="is-total"><td>Summe</td><td class="n">${eur(E)}</td><td class="n">${eur(tot12 / ks.length)}</td><td class="n"><strong>${eur(tot12, { cents: false })}</strong></td><td class="n">100 %</td></tr></tbody></table></div>
      </section>`;
    const svg = $('#eChart');
    const tots = ks.map(incomeOf);
    const g = scaffold(svg, ks.length, 0, Math.max(...tots), { labelAt: (i) => labelShort(ks[i]) });
    if (!g) return;
    ks.forEach((i, j) => {
      let acc = 0;
      types.forEach((x) => {
        const val = INCOME[i][x.t];
        if (!val) return;
        bar(svg, g.x(j), g.bw * 0.62, g.y(acc), g.y(acc + val), `f-${INC_CLS[x.t]}`, `${x.t} ${MONTHS_ALL[i].long}: ${eur(val)}`);
        acc += val;
      });
      if (i === k) text(svg, g.x(j), g.y(acc) - 6, RC.kfmt(acc), 'svg-label-strong', 'middle');
    });
  };

  // ---------- 1.4 Geldfluss (Sankey) ----------
  R.geldfluss = (v, st) => {
    st.flow = st.flow || 'm';
    const k = st.k;
    const ks = st.flow === 'm' ? [k] : range(Math.min(k, LAST_FULL) - 11, Math.min(k, LAST_FULL));
    const inc = INCOME_TYPES.map((t) => ({ id: 'i:' + t, name: t, v: sumK(ks, (i) => INCOME[i][t]), cls: 'n-inc' })).filter((x) => x.v > 0.5);
    const E = inc.reduce((a, x) => a + x.v, 0);
    const clsTot = CLASSES.map((c) => ({ id: 'c:' + c, name: CLASS_LABEL[c], v: sumK(ks, (i) => classOf(i, c)), cls: `f-${c}`, c })).filter((x) => x.v > 0.5);
    const S = clsTot.reduce((a, x) => a + x.v, 0);
    // fold income slivers into one labelled node
    const smallInc = inc.filter((x) => x.v < E * 0.035);
    if (smallInc.length) {
      smallInc.forEach((x) => inc.splice(inc.indexOf(x), 1));
      inc.push(smallInc.length === 1 ? { ...smallInc[0], force: true } : { id: 'i:weitere', name: 'Weitere Einnahmen', v: smallInc.reduce((a, x) => a + x.v, 0), cls: 'n-inc', force: true });
    }
    const col1 = clsTot.slice();
    if (E > S) col1.push({ id: 'c:rest', name: 'Übrig', v: E - S, cls: 'n-rest' });
    if (S > E) inc.push({ id: 'i:guthaben', name: 'Aus Guthaben', v: S - E, cls: 'n-rest' });
    const col0Tot = inc.reduce((a, x) => a + x.v, 0);
    const links = [];
    // every income flows into one pool first, the pool feeds the classes: no crossing bands
    const pool = [{ id: 'pool', name: S > E ? 'Verfügbar' : 'Einnahmen', v: col0Tot, cls: 'n-pool', force: true }];
    inc.forEach((a) => links.push({ from: a.id, to: 'pool', v: a.v, cls: a.id === 'i:guthaben' ? 'l-rest' : 'l-inc', label: a.name }));
    col1.forEach((b) => links.push({ from: 'pool', to: b.id, v: b.v, cls: b.cls === 'n-rest' ? 'l-rest' : `l-${b.c}`, label: b.name }));
    const col2 = [];
    const table = [];
    CLASSES.forEach((c) => {
      const groups = {};
      CATS.filter((x) => x.cls === c).forEach((x) => { groups[x.group] = (groups[x.group] || 0) + sumK(ks, (i) => SPEND[i][x.id]); });
      const arr = Object.entries(groups).filter(([, val]) => val > 0.5).sort((a, b) => b[1] - a[1]);
      const tot = arr.reduce((a, [, val]) => a + val, 0);
      let small = 0;
      arr.forEach(([name0, val]) => {
        const name = c === 'future' && name0 === 'Kredite' ? 'Sondertilgung' : name0;
        table.push({ c, name, v: val });
        if (val < col0Tot * 0.035) small += val; else col2.push({ id: `g:${c}:${name}`, name, v: val, cls: `f-${c}`, c });
      });
      if (small > 0.5) col2.push({ id: `g:${c}:weitere`, name: { need: 'Weiterer Bedarf', want: 'Weitere Wünsche', future: 'Weitere Zukunft' }[c], v: small, cls: `f-${c}`, c, force: true });
      col2.filter((n) => n.c === c).forEach((n) => links.push({ from: 'c:' + c, to: n.id, v: n.v, cls: `l-${c}`, label: `${CLASS_LABEL[c]} → ${n.name}` }));
      if (!tot) return;
    });
    const period = st.flow === 'm' ? mlong(k) : `${labelShort(ks[0], true)} bis ${labelShort(ks[ks.length - 1], true)}`;
    v.innerHTML = `
      <section class="rs rs-wide" aria-labelledby="fT">
        <div class="tbd-head"><h2 id="fT">Geldfluss ${esc(period)}</h2>
          <div class="seg" role="group" aria-label="Zeitraum des Geldflusses"><button type="button" data-flow="m" aria-pressed="${st.flow === 'm'}">Monat</button><button type="button" data-flow="12" aria-pressed="${st.flow === '12'}">12 Monate</button></div></div>
        ${chain([
          { label: 'Einnahmen', val: eur(E, { cents: false }) },
          ...clsTot.map((x) => ({ op: MINUS, label: x.name, val: eur(x.v, { cents: false }) })),
          { op: '=', label: E >= S ? 'Übrig' : 'Aus Guthaben', val: eur(E - S, { cents: false }), result: true },
        ], 'Maßkette Geldfluss')}
        <div class="rscroll sk-scroll"><svg class="rchart rsankey" id="fChart" role="img" aria-label="Sankey: Einnahmenarten in einen Topf, von dort zu Klassen und Gruppen"></svg></div>
        <p class="vnote">Alle Einnahmen fließen erst in einen Topf und von dort in die Klassen; Umbuchungen zwischen eigenen Konten sind weggelassen. Zukunft heißt: Geld, das im Vermögen bleibt (ETF, Notgroschen, Sondertilgung).</p>
      </section>
      <section class="rs rs-wide" aria-labelledby="fL">
        <div class="tbd-head"><h2 id="fL">Stückliste des Flusses</h2></div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Klasse</th><th class="tech">Gruppe</th><th class="tech n">Betrag</th><th class="tech n">Anteil an Einnahmen</th></tr></thead>
        <tbody>${table.map((r, i) => `<tr${i && table[i - 1].c !== r.c ? ' class="is-break"' : ''}><td>${sw(r.c)}${CLASS_LABEL[r.c]}</td><td>${esc(r.name)}</td><td class="n">${eur(r.v, { cents: false })}</td><td class="n">${pct(r.v / E)}</td></tr>`).join('')}</tbody></table></div>
      </section>`;
    v.querySelectorAll('[data-flow]').forEach((b) => b.addEventListener('click', () => { st.flow = b.dataset.flow; RC.rerender(); $(`[data-flow="${st.flow}"]`).focus(); }));
    const svg = $('#fChart');
    // narrow screens: two stages (income → classes); the groups stay in the parts list below
    if (svg.clientWidth < 600) sankey(svg, [inc, pool, col1], links.filter((l) => !l.from.startsWith('c:')), { gap: 9, padR: 96 });
    else sankey(svg, [inc, pool, col1, col2], links, { gap: 9 });
  };

  // ---------- shared: row model for year view and full table ----------
  function buildRows(ks, detail) {
    const rows = [];
    const vals = (fn) => ks.map((k) => (k == null ? null : fn(k)));
    rows.push({ key: 'inc', label: 'Einnahmen', kind: 'sum', vals: vals(incomeOf), good: 'high' });
    INCOME_TYPES.forEach((t) => { const vv = vals((k) => INCOME[k][t]); if (vv.some((x) => x)) rows.push({ key: 'inc:' + t, label: t, kind: 'cat', lvl: 1, vals: vv, sw: INC_CLS[t], good: 'high' }); });
    CLASSES.forEach((c) => {
      const good = c === 'future' ? 'high' : 'low'; // more saving is never red
      rows.push({ key: c, label: CLASS_LABEL[c], kind: 'sum', vals: vals((k) => classOf(k, c)), sw: c, good });
      const groups = [...new Set(CATS.filter((x) => x.cls === c).map((x) => x.group))];
      const gv = groups.map((gname) => ({ gname, vv: vals((k) => CATS.filter((x) => x.cls === c && x.group === gname).reduce((a, x) => a + SPEND[k][x.id], 0)) }))
        .map((x) => ({ ...x, tot: x.vv.reduce((a, b) => a + (b || 0), 0) })).filter((x) => x.tot > 0).sort((a, b) => b.tot - a.tot);
      gv.forEach((x) => {
        rows.push({ key: `${c}:${x.gname}`, label: x.gname, kind: 'grp', lvl: 1, vals: x.vv, good });
        if (detail) CATS.filter((cc) => cc.cls === c && cc.group === x.gname).forEach((cc) => { const vv = vals((k) => SPEND[k][cc.id]); if (vv.some((z) => z)) rows.push({ key: 'cat:' + cc.id, label: cc.name, kind: 'cat', lvl: 2, vals: vv, good }); });
      });
    });
    rows.push({ key: 'cons', label: 'Konsumausgaben', kind: 'res', vals: vals(consumptionOf) });
    rows.push({ key: 'rest', label: 'Übrig nach Zukunft', kind: 'res', vals: vals((k) => incomeOf(k) - consumptionOf(k) - classOf(k, 'future')), signed: true, good: 'high' });
    rows.push({ key: 'sq', label: 'Sparquote', kind: 'pct', vals: vals((k) => (incomeOf(k) > 0 ? (incomeOf(k) - consumptionOf(k)) / incomeOf(k) : null)) });
    return rows;
  }
  // prev: optional { label, map: key → sum } for a comparison column (Vorjahr and change)
  function rowsTable(rows, heads, { total = true, avg = false, cls = '', prev = null } = {}) {
    const cell = (r, x, hs) => {
      if (x == null) return '<td class="n muted">–</td>';
      if (r.kind === 'pct') return `<td class="n">${pct(x, false, 0)}</td>`;
      const attr = (r.kind === 'cat' || r.kind === 'grp') && x ? RC.heatAttr(x, hs, r.good || 'low', r.center ?? null) : 'class="n"';
      return `<td ${attr}>${x ? (r.signed ? eur(x, { cents: false, sign: true }) : nf0.format(Math.round(x))) : '<span class="muted">·</span>'}</td>`;
    };
    return `<table class="rtable rgrid ${cls}"><thead><tr><th class="tech rg-first">Position</th>${heads.map((h) => `<th class="tech n">${h}</th>`).join('')}${total ? '<th class="tech n rg-sum">Summe</th>' : ''}${avg ? '<th class="tech n">Ø Monat</th>' : ''}${prev ? `<th class="tech n rg-sum">${esc(prev.label)}</th><th class="tech n">Veränderung</th>` : ''}</tr></thead>
      <tbody>${rows.map((r) => {
        const hs = RC.heatStats(r.vals);
        const present = r.vals.filter((x) => x != null);
        const sum = present.reduce((a, b) => a + b, 0);
        let sumCell = '';
        if (total) sumCell = r.kind === 'pct' ? '<td class="n rg-sum">–</td>' : `<td class="n rg-sum"><strong>${r.signed ? eur(sum, { cents: false, sign: true }) : nf0.format(Math.round(sum))}</strong></td>`;
        const avgCell = avg ? `<td class="n">${r.kind === 'pct' ? '–' : nf0.format(Math.round(sum / Math.max(1, present.length)))}</td>` : '';
        let prevCells = '';
        if (prev) {
          const pv = prev.map.get(r.key);
          if (r.kind === 'pct' || pv == null) prevCells = '<td class="n rg-sum muted">–</td><td class="n muted">–</td>';
          else {
            const d = sum - pv;
            const good = (r.good || 'low') === 'high' ? d >= 0 : d <= 0;
            prevCells = `<td class="n rg-sum">${nf0.format(Math.round(pv))}</td><td class="n"><span class="dl ${Math.abs(d) < 0.5 ? 'dl-0' : good ? 'dl-good' : 'dl-bad'}">${eur(d, { cents: false, sign: true })}${pv ? ` · ${pct(d / Math.abs(pv), true, 0)}` : ''}</span></td>`;
          }
        }
        return `<tr class="rk-${r.kind}${r.lvl ? ' lv-' + r.lvl : ''}"><th scope="row" class="rg-first">${r.sw ? `<i class="sw sw-${r.sw}" aria-hidden="true"></i>` : ''}${esc(r.label)}</th>${r.vals.map((x) => cell(r, x, hs)).join('')}${sumCell}${avgCell}${prevCells}</tr>`;
      }).join('')}</tbody></table>`;
  }
  RC.buildRows = buildRows;
  RC.rowsTable = rowsTable;

  // ---------- 1.5 Jahresansicht ----------
  R.jahresansicht = (v, st) => {
    const y = st.year;
    st.jaDetail = st.jaDetail ?? false;
    const ks = Array.from({ length: 12 }, (_, m) => { const i = RC.idx(y, m); return i >= 0 && i <= LAST_FULL ? i : null; });
    const have = ks.filter((x) => x != null);
    const rows = buildRows(ks, st.jaDetail);
    const E = sumK(have, incomeOf), K = sumK(have, consumptionOf), Z = sumK(have, (k) => classOf(k, 'future'));
    // previous year: the same calendar months, where both years have data
    const pks = ks.map((k, m) => { if (k == null) return null; const i = RC.idx(y - 1, m); return i >= 0 ? i : null; });
    const pairs = ks.map((k, m) => (k != null && pks[m] != null ? m : null)).filter((m) => m != null);
    const prevRows = buildRows(pks.map((k, m) => (pairs.includes(m) ? k : null)), st.jaDetail);
    const prevMap = new Map(prevRows.map((r) => [r.key, r.vals.filter((x) => x != null).reduce((a, b) => a + b, 0)]));
    const cmpKs = pairs.map((m) => ks[m]), cmpPks = pairs.map((m) => pks[m]);
    const Kp = sumK(cmpPks, consumptionOf), Kc = sumK(cmpKs, consumptionOf), Ep = sumK(cmpPks, incomeOf), Ec = sumK(cmpKs, incomeOf);
    v.innerHTML = `
      <section class="rs rs-wide" aria-labelledby="jT">
        <div class="tbd-head"><h2 id="jT">${y}${have.length < 12 ? ` · ${have.length} Monate` : ''}</h2>
          <div class="seg" role="group" aria-label="Detailtiefe"><button type="button" data-ja="0" aria-pressed="${!st.jaDetail}">Gruppen</button><button type="button" data-ja="1" aria-pressed="${st.jaDetail}">Kategorien</button></div></div>
        ${chain([
          { label: 'Einnahmen', val: eur(E, { cents: false }) },
          { op: MINUS, label: 'Konsum', val: eur(K, { cents: false }) },
          { op: MINUS, label: 'Zukunft', val: eur(Z, { cents: false }) },
          { op: '=', label: 'Übrig', val: eur(E - K - Z, { cents: false }), result: true },
        ], 'Maßkette des Jahres')}
        ${pairs.length ? `<div class="ja-cmp">
          <div><span class="tech">Konsum gegen ${y - 1}</span><strong>${eur(Kc - Kp, { cents: false, sign: true })}</strong><small>${pct((Kc - Kp) / Kp, true)} · ${pairs.length === 12 ? 'ganzes Jahr' : `${MONTHS[pairs[0]]}–${MONTHS[pairs[pairs.length - 1]]} verglichen`}</small></div>
          <div><span class="tech">Einnahmen gegen ${y - 1}</span><strong>${eur(Ec - Ep, { cents: false, sign: true })}</strong><small>${pct((Ec - Ep) / Ep, true)}</small></div>
          <div><span class="tech">Sparquote</span><strong>${pct((Ec - Kc) / Ec)}</strong><small>${y - 1}: ${pct((Ep - Kp) / Ep)}</small></div>
        </div>` : `<p class="vnote">Für ${y - 1} liegen keine Monate zum Vergleich vor.</p>`}
        <div class="rscroll rsticky">${rowsTable(rows, MONTHS, { avg: true, cls: 'rg-year', prev: pairs.length ? { label: `${y - 1}${pairs.length < 12 ? '*' : ''}`, map: prevMap } : null })}</div>
        <p class="vnote">Farbe je Zeile gegen den Durchschnitt der Zeile: Rot = teurer Monat (bei Einnahmen: schwacher Monat), Grün = günstiger. ${pairs.length && pairs.length < 12 ? `* ${y - 1} nur für dieselben Monate (${MONTHS[pairs[0]]}–${MONTHS[pairs[pairs.length - 1]]}). ` : ''}Veränderung grün = besser, rot = schlechter.</p>
      </section>`;
    v.querySelectorAll('[data-ja]').forEach((b) => b.addEventListener('click', () => { st.jaDetail = b.dataset.ja === '1'; RC.rerender(); $(`[data-ja="${b.dataset.ja}"]`).focus(); }));
  };

  // ---------- 1.6 Kategorieübersicht ----------
  const spark = (vals) => {
    const max = Math.max(...vals, 1);
    const pts = vals.map((x, i) => `${((i / Math.max(1, vals.length - 1)) * 100).toFixed(1)},${(22 - (x / max) * 20).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" vector-effect="non-scaling-stroke"/></svg>`;
  };
  R.kategorien = (v, st) => {
    const ks = windowK(st.period);
    const n = ks.length;
    const prevKs = ks[0] - n >= 0 ? range(ks[0] - n, ks[0] - 1) : null;
    const k12 = range(LAST_FULL - 11, LAST_FULL);
    const all = CATS.map((c) => {
      const sum = sumK(ks, (k) => SPEND[k][c.id]);
      const prev = prevKs ? sumK(prevKs, (k) => SPEND[k][c.id]) : null;
      return { c, sum, prev, avg: sum / n, hist: k12.map((k) => SPEND[k][c.id]) };
    }).filter((x) => x.sum > 0).sort((a, b) => b.sum - a.sum);
    const tot = all.filter((x) => x.c.cls !== 'future').reduce((a, x) => a + x.sum, 0);
    if (!st.catOpen || !all.some((x) => x.c.id === st.catOpen)) st.catOpen = all[0].c.id;
    v.innerHTML = `
      <section class="rs rs-wide" aria-labelledby="kT">
        <div class="tbd-head"><h2 id="kT">${all.length} Kategorien · ${esc(periodName(st.period))}</h2><span class="tbd-state"><span class="ink">Konsum ${eur(tot, { cents: false })}</span></span></div>
        <div class="rscroll"><table class="rtable rcats"><thead><tr><th class="tech">Kategorie</th><th class="tech">Verlauf 12 M</th><th class="tech n">Summe</th><th class="tech n">Ø Monat</th><th class="tech n">Zur Vorperiode</th><th class="tech n">Anteil am Konsum</th></tr></thead>
        <tbody>${all.map((x) => `<tr class="rc-row${x.c.id === st.catOpen ? ' is-open' : ''}" data-cat="${x.c.id}">
          <td><button type="button" class="rc-btn" aria-expanded="${x.c.id === st.catOpen}">${sw(x.c.cls)}<span>${esc(x.c.name)}</span><small>${esc(x.c.group)}</small></button></td>
          <td>${spark(x.hist)}</td>
          <td class="n"><strong>${eur(x.sum, { cents: false })}</strong></td>
          <td class="n">${eur(x.avg, { cents: false })}</td>
          <td class="n">${x.prev == null || x.prev === 0 ? '<span class="muted">–</span>' : `${delta(x.sum - x.prev, { invert: false })}<small class="muted"> ${pct(x.sum / x.prev - 1, true, 0)}</small>`}</td>
          <td class="n">${x.c.cls === 'future' ? '<span class="muted">Zukunft</span>' : pct(x.sum / tot)}</td>
        </tr>${x.c.id === st.catOpen ? `<tr class="rc-detail"><td colspan="6"><div class="rc-d">
            <div><svg class="rchart rchart-s" id="kChart" role="img" aria-label="${esc(x.c.name)}: Ist und Plan, letzte 12 Monate"></svg>
              <div class="legend" aria-hidden="true"><span><i class="lg-sq sw-${x.c.cls}"></i>Ist</span><span><svg viewBox="0 0 26 8"><path class="l-plan" d="M0 4h26"/></svg>Plan</span></div></div>
            <dl class="rc-facts">
              <div><dt class="tech">Ø 12 M</dt><dd>${eur(x.hist.reduce((a, b) => a + b, 0) / 12)}</dd></div>
              <div><dt class="tech">Höchster Monat</dt><dd>${eur(Math.max(...x.hist))}<small>${esc(MONTHS_ALL[k12[x.hist.indexOf(Math.max(...x.hist))]].long)}</small></dd></div>
              <div><dt class="tech">Art</dt><dd>${{ fix: 'Fixkosten', var: 'variabel', periodic: 'periodisch' }[x.c.kind]} · ${CLASS_LABEL[x.c.cls]}</dd></div>
              <div><dt class="tech">Empfänger</dt><dd>${esc(x.c.payees ? x.c.payees.map((p) => p[0]).join(', ') : x.c.payee)}</dd></div>
            </dl></div></td></tr>` : ''}`).join('')}</tbody></table></div>
      </section>`;
    v.querySelectorAll('.rc-btn').forEach((b) => b.addEventListener('click', () => {
      const id = b.closest('tr').dataset.cat;
      st.catOpen = st.catOpen === id ? '__none' : id;
      RC.rerender();
      const nb = v.querySelector(`[data-cat="${id}"] .rc-btn`);
      if (nb) nb.focus();
    }));
    const svg = $('#kChart');
    if (!svg) return;
    const c = RC.catById(st.catOpen);
    const ist = k12.map((k) => SPEND[k][c.id]), plan = k12.map((k) => PLAN[k][c.id]);
    const g = scaffold(svg, 12, 0, Math.max(...ist, ...plan), { labelAt: (i) => labelShort(k12[i]), L: 48 });
    if (!g) return;
    ist.forEach((x, i) => bar(svg, g.x(i), g.bw * 0.56, g.y(0), g.y(x), `f-${c.cls}`, `${MONTHS_ALL[k12[i]].long}: ${eur(x)}`));
    plan.forEach((x, i) => { if (x) s('line', { x1: g.x(i) - g.bw * 0.4, x2: g.x(i) + g.bw * 0.4, y1: g.y(x), y2: g.y(x), class: 'plan-tick' }, svg); });
  };

  // ---------- 1.7 Gesamttabelle ----------
  R.gesamttabelle = (v, st) => {
    st.gtDetail = st.gtDetail ?? false;
    const ks = range(0, 35);
    const rows = buildRows(ks, st.gtDetail);
    rows.push({ label: 'Nettovermögen am Monatsende', kind: 'lvl', vals: ks.map((k) => NW[k]) });
    const heads = ks.map((k) => `${labelShort(k, true)}${MONTHS_ALL[k].partial ? '*' : ''}`);
    v.innerHTML = `
      <section class="rs rs-wide" aria-labelledby="tT">
        <div class="tbd-head"><h2 id="tT">Alle Monate seit Okt 2023</h2>
          <div class="rtools">
            <div class="seg" role="group" aria-label="Detailtiefe"><button type="button" data-gt="0" aria-pressed="${!st.gtDetail}">Gruppen</button><button type="button" data-gt="1" aria-pressed="${st.gtDetail}">Kategorien</button></div>
            <button class="btn btn-ghost btn-sm" type="button" id="csvBtn">${icon('download')}CSV</button>
          </div></div>
        <div class="rscroll rsticky" id="gtScroll">${rowsTable(rows.map((r) => (r.kind === 'lvl' ? { ...r, kind: 'res' } : r)), heads, { total: false, cls: 'rg-all' })}</div>
        <p class="vnote">* September 2026 läuft noch (bis 17.09.). Farbe je Zeile gegen den Durchschnitt: Rot = teurer Monat, Grün = günstiger. Die Tabelle beginnt rechts beim aktuellen Monat; nach links in die Vergangenheit scrollen.</p>
      </section>`;
    const sc = $('#gtScroll');
    sc.scrollLeft = sc.scrollWidth;
    v.querySelectorAll('[data-gt]').forEach((b) => b.addEventListener('click', () => { st.gtDetail = b.dataset.gt === '1'; RC.rerender(); $(`[data-gt="${b.dataset.gt}"]`).focus(); }));
    $('#csvBtn').addEventListener('click', () => {
      const lines = [['Position', ...ks.map((k) => MONTHS_ALL[k].key)].join(';')];
      rows.forEach((r) => lines.push([`"${r.label}"`, ...r.vals.map((x) => (x == null ? '' : r.kind === 'pct' ? csvNum(x * 100) : csvNum(x)))].join(';')));
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'finanz-app-gesamttabelle.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      RC.toast('CSV mit Beispieldaten erstellt.');
    });
  };

  // ---------- 1.8 Sparquote und Geldalter ----------
  const rolling = (k) => { const w = range(k - 11, k); const e = sumK(w, incomeOf); return (e - sumK(w, consumptionOf)) / e; };
  R.sparquote = (v, st) => {
    const ks0 = windowK(st.period);
    const ks = ks0.length < 12 ? range(LAST_FULL - 11, LAST_FULL) : ks0;
    const E = sumK(ks0, incomeOf), K = sumK(ks0, consumptionOf);
    const q = (E - K) / E;
    const r12 = rolling(LAST_FULL);
    const years = [2024, 2025, 2026].map((y) => {
      const yk = MONTHS_ALL.filter((mo) => mo.y === y && mo.k <= LAST_FULL).map((mo) => mo.k);
      const e = sumK(yk, incomeOf), c = sumK(yk, consumptionOf);
      return { y, n: yk.length, e, c, q: (e - c) / e, age: sumK(yk, (k) => AGE[k]) / yk.length };
    });
    v.innerHTML = `
      <section class="rs rs-half" aria-labelledby="sqT">
        <div class="tbd-head"><h2 id="sqT">Sparquote · ${esc(periodName(st.period))}</h2><span class="tbd-state"><span class="${q >= 0.2 ? 'ok' : 'ink'}">${icon(q >= 0.2 ? 'check-circle' : 'alert', 'icon icon-sm')}Ziel ≥ 20 % (R01)</span></span></div>
        <div class="tbd-fig">${nf1.format(q * 100)}<span class="cents"> %</span></div>
        ${chain([{ label: 'Einnahmen', val: eur(E, { cents: false }) }, { op: MINUS, label: 'Konsum', val: eur(K, { cents: false }) }, { op: '=', label: 'Gespart', val: eur(E - K, { cents: false }), result: true }], 'Maßkette Sparquote')}
        <svg class="rchart" id="sqChart" role="img" aria-label="Sparquote je Monat und rollierend 12 Monate"></svg>
        <div class="legend" aria-hidden="true"><span><i class="lg-sq lg-own"></i>je Monat</span><span><svg viewBox="0 0 26 8"><path class="l-actual" d="M0 4h26"/></svg>rollierend 12 Monate · jetzt ${pct(r12)}</span><span><svg viewBox="0 0 26 8"><path class="l-plan" d="M0 4h26"/></svg>Ziel 20 %</span></div>
      </section>
      <section class="rs rs-half" aria-labelledby="gaT">
        <div class="tbd-head"><h2 id="gaT">Geldalter</h2><span class="tbd-state"><span class="ink">${icon('alert', 'icon icon-sm')}Ziel ≥ 30 Tage (R03)</span></span></div>
        <div class="tbd-fig">${AGE[35]}<span class="cents"> Tage</span></div>
        ${chain([{ label: 'Okt 2023', val: `${AGE[0]} Tage` }, { op: '+', label: 'seither', val: `${AGE[35] - AGE[0]} Tage` }, { op: '=', label: 'heute', val: `${AGE[35]} Tage`, result: true }, { op: MINUS, label: 'Ziel', val: '30 Tage' }, { op: '=', label: 'fehlen', val: `${30 - AGE[35]} Tage` }], 'Maßkette Geldalter')}
        <svg class="rchart" id="gaChart" role="img" aria-label="Geldalter in Tagen je Monat"></svg>
        <p class="vnote">Geldalter = wie viele Tage ein ausgegebener Euro im Schnitt auf dem Konto lag (FIFO). Ab 30 Tagen lebt ihr vom Geld des Vormonats.</p>
      </section>
      <section class="rs rs-wide" aria-labelledby="syT">
        <div class="tbd-head"><h2 id="syT">Je Jahr</h2></div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Jahr</th><th class="tech n">Einnahmen</th><th class="tech n">Konsum</th><th class="tech n">Gespart</th><th class="tech n">Sparquote</th><th class="tech n">Ø Geldalter</th></tr></thead>
        <tbody>${years.map((y) => `<tr><td>${y.y}${y.n < 12 ? ` <small class="muted">${y.n} Monate</small>` : ''}</td><td class="n">${eur(y.e, { cents: false })}</td><td class="n">${eur(y.c, { cents: false })}</td><td class="n">${eur(y.e - y.c, { cents: false })}</td><td class="n"><strong>${pct(y.q)}</strong></td><td class="n">${nf0.format(y.age)} Tage</td></tr>`).join('')}</tbody></table></div>
      </section>`;
    const q1 = ks.map((k) => (incomeOf(k) - consumptionOf(k)) / incomeOf(k));
    const svg = $('#sqChart');
    const g = scaffold(svg, ks.length, Math.min(...q1), Math.max(...q1), { yfmt: (x) => `${nf0.format(x * 100)} %`, labelAt: (i) => labelShort(ks[i]), L: 48 });
    if (g) {
      q1.forEach((x, i) => bar(svg, g.x(i), g.bw * 0.5, g.y(0), g.y(x), 'bar-mkt', `${MONTHS_ALL[ks[i]].long}: ${pct(x)}`));
      s('line', { x1: g.f.L, x2: g.f.W - g.f.R, y1: g.y(0.2), y2: g.y(0.2), class: 'l-plan' }, svg);
      path(svg, ks.map((k, i) => [g.x(i), g.y(rolling(k))]), 'l-actual');
    }
    const svg2 = $('#gaChart');
    const ka = range(0, 35);
    const g2 = scaffold(svg2, ka.length, 0, 34, { yfmt: (x) => nf0.format(x), labelAt: (i) => labelShort(i, i === 0), maxLabels: 6, L: 40 });
    if (g2) {
      s('line', { x1: g2.f.L, x2: g2.f.W - g2.f.R, y1: g2.y(30), y2: g2.y(30), class: 'l-plan' }, svg2);
      text(svg2, g2.f.W - g2.f.R, g2.y(30) - 6, 'Ziel 30 Tage', 'svg-label-line', 'end');
      path(svg2, ka.map((k) => [g2.x(k), g2.y(AGE[k])]), 'l-actual');
      s('circle', { cx: g2.x(35), cy: g2.y(AGE[35]), r: 3.5, class: 'dot-actual' }, svg2);
    }
  };

  // ---------- 1.9 Projekte und Nebeneinkünfte ----------
  // hours per month are settings in V1 (sample values); they turn a project's result into an hourly rate
  const HOURS = { trading: 10, kurse: 6, orgel: 8 };
  const COST_LABEL = { trading: 'Verluste und Datenabo', kurse: 'Plattform', orgel: 'Noten' };
  R.projekte = (v, st) => {
    const ks = windowK(st.period);
    const prev = ks[0] - ks.length >= 0 ? range(ks[0] - ks.length, ks[0] - 1) : null;
    const rows = RC.PROJECTS.map((p) => {
      const inc = sumK(ks, (k) => RC.PROJ[k][p.id].inc), cost = sumK(ks, (k) => RC.PROJ[k][p.id].cost);
      const pNet = prev ? sumK(prev, (k) => RC.PROJ[k][p.id].inc - RC.PROJ[k][p.id].cost) : null;
      const net = inc - cost;
      const months = ks.filter((k) => RC.PROJ[k][p.id].inc || RC.PROJ[k][p.id].cost).length || 1;
      return { ...p, inc, cost, net, pNet, perMonth: net / ks.length, rate: net / (HOURS[p.id] * months), series: ks.map((k) => RC.PROJ[k][p.id].inc - RC.PROJ[k][p.id].cost) };
    });
    const I = rows.reduce((a, r) => a + r.inc, 0), C = rows.reduce((a, r) => a + r.cost, 0);
    const yearNet = sumK(range(LAST_FULL - 11, LAST_FULL), (k) => RC.PROJECTS.reduce((a, p) => a + RC.PROJ[k][p.id].inc - RC.PROJ[k][p.id].cost, 0));
    v.innerHTML = `
      <section class="rs rs-wide" aria-labelledby="prT">
        <div class="tbd-head"><h2 id="prT">Nebenprojekte · ${esc(periodName(st.period))}</h2><span class="tbd-state"><span class="ink">${rows.filter((r) => r.net > 0).length} von ${rows.length} im Plus</span></span></div>
        <div class="tbd-fig">${fig(I - C)}</div>
        ${chain([{ label: 'Einnahmen', val: eur(I, { cents: false }) }, { op: MINUS, label: 'Kosten', val: eur(C, { cents: false }) }, { op: '=', label: 'Ergebnis', val: eur(I - C, { cents: false }), result: true }], 'Maßkette Nebenprojekte')}
        <div class="proj-grid">${rows.map((r, i) => `<article class="proj">
          <div class="proj-head"><span class="rtb-pos">${i + 1}</span><h3>${esc(r.name)}</h3><span class="dl ${r.net >= 0 ? 'dl-good' : 'dl-bad'}">${eur(r.net, { cents: false, sign: true })}</span></div>
          <svg class="proj-chart" data-proj="${r.id}" role="img" aria-label="${esc(r.name)}: Ergebnis je Monat"></svg>
          <dl class="proj-facts">
            <div><dt class="tech">Einnahmen</dt><dd>${eur(r.inc, { cents: false })}</dd></div>
            <div><dt class="tech">${esc(COST_LABEL[r.id])}</dt><dd>${eur(-r.cost, { cents: false })}</dd></div>
            <div><dt class="tech">Je Stunde</dt><dd>${eur(r.rate)}<small>${HOURS[r.id]} h je Monat</small></dd></div>
            <div><dt class="tech">Zur Vorperiode</dt><dd>${r.pNet == null ? '<span class="muted">–</span>' : `<span class="dl ${r.net >= r.pNet ? 'dl-good' : 'dl-bad'}">${eur(r.net - r.pNet, { cents: false, sign: true })}</span>`}</dd></div>
          </dl>
          <p class="vnote">${esc(r.note)}.</p>
        </article>`).join('')}</div>
        <p class="vnote">Grün = Monat im Plus, rot umrandet = Monat im Minus. Nebeneinkünfte zählen in der Einnahmen-Übersicht als eigene Art. Steuer: Nebeneinkünfte über dem Veranlagungsfreibetrag (Beispiel 730 € im Jahr, bitte prüfen) sind zu erklären; letzte 12 Monate zusammen ${eur(yearNet, { cents: false, sign: true })}.</p>
      </section>
      <section class="rs rs-wide" aria-labelledby="prL">
        <div class="tbd-head"><h2 id="prL">Je Monat</h2></div>
        <div class="rscroll rsticky">${rowsTable(rows.map((r) => ({ key: r.id, label: r.name, kind: 'cat', vals: r.series, good: 'high', center: 0, signed: true })).concat([{ key: 'sum', label: 'Zusammen', kind: 'res', vals: ks.map((k) => RC.PROJECTS.reduce((a, p) => a + RC.PROJ[k][p.id].inc - RC.PROJ[k][p.id].cost, 0)), signed: true }]), ks.map((k) => labelShort(k, true)), { cls: 'rg-heat' })}</div>
      </section>`;
    v.querySelectorAll('.proj-chart').forEach((svg) => {
      const r = rows.find((x) => x.id === svg.dataset.proj);
      const g = scaffold(svg, ks.length, Math.min(0, ...r.series), Math.max(0, ...r.series), { L: 40, R: 6, T: 6, B: 18, labelAt: (i) => labelShort(ks[i]), maxLabels: 4 });
      if (!g) return;
      r.series.forEach((x, i) => bar(svg, g.x(i), Math.max(2, g.bw * 0.6), g.y(0), g.y(x), x >= 0 ? 'bar-pos' : 'bar-neg2', `${MONTHS_ALL[ks[i]].long}: ${eur(x, { sign: true })}`));
    });
  };
})();
