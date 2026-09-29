/* Finanz-App prototype · Reports, group 2: Ausgaben und Plan. Sample data only. */
(() => {
  'use strict';

  const RC = window.RC;
  const {
    R, esc, icon, eur, pct, fig, chain, tri, sw, delta, sumK, nf0, nf1, nf2, MINUS, MONTHS, MONTHS_ALL, LAST_FULL,
    CATS, SPEND, PLAN, INCOME, incomeOf, consumptionOf, classOf, INV, LOANH, LOAN, PAYEE, VPI, priceAt,
    s, text, path, scaffold, bar, tip, labelShort, windowK, periodName, CLASS_LABEL, heat,
  } = RC;
  const $ = (sel, root = document) => root.querySelector(sel);
  const range = (a, b) => { const out = []; for (let k = Math.max(0, a); k <= b; k++) out.push(k); return out; };
  const CONS = CATS.filter((c) => c.cls !== 'future');
  const prevWindow = (ks) => (ks[0] - ks.length >= 0 ? range(ks[0] - ks.length, ks[0] - 1) : null);

  // ---------- 2.1 Ausgabenanalyse ----------
  R.ausgaben = (v, st) => {
    const ks = windowK(st.period);
    const prev = prevWindow(ks);
    const K = sumK(ks, consumptionOf);
    const Kp = prev ? sumK(prev, consumptionOf) : null;
    const rows = CONS.map((c) => ({ c, v: sumK(ks, (k) => SPEND[k][c.id]), p: prev ? sumK(prev, (k) => SPEND[k][c.id]) : null })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    const max = rows[0].v;
    const cls = ['need', 'want'].map((c) => ({ c, v: sumK(ks, (k) => classOf(k, c)) }));
    const fut = sumK(ks, (k) => classOf(k, 'future'));
    const moves = prev ? rows.filter((x) => x.p != null).map((x) => ({ ...x, d: x.v - x.p })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 6) : [];
    const hk = ks.length >= 12 ? ks.slice(-12) : range(LAST_FULL - 11, LAST_FULL);
    const hrows = rows.map((x) => ({ key: x.c.id, label: x.c.name, kind: 'cat', vals: hk.map((k) => SPEND[k][x.c.id]), sw: x.c.cls }));
    v.innerHTML = `
      <section class="rs rs-main" aria-labelledby="aT">
        <div class="tbd-head"><h2 id="aT">Konsum · ${esc(periodName(st.period))}</h2><span class="tbd-state"><span class="ink">Ø ${eur(K / ks.length, { cents: false })} je Monat</span></span></div>
        <div class="tbd-fig">${fig(K)}</div>
        ${chain([
          { label: 'Bedarf', val: eur(cls[0].v, { cents: false }) },
          { op: '+', label: 'Wunsch', val: eur(cls[1].v, { cents: false }) },
          { op: '=', label: 'Konsum', val: eur(K, { cents: false }), result: true },
        ], 'Maßkette Konsum')}
        <div class="segbar" role="img" aria-label="Bedarf ${pct(cls[0].v / (K + fut))}, Wunsch ${pct(cls[1].v / (K + fut))}, Zukunft ${pct(fut / (K + fut))}">
          ${cls.concat([{ c: 'future', v: fut }]).map((x) => `<span class="sw-${x.c}" style="width:${(x.v / (K + fut)) * 100}%"></span>`).join('')}</div>
        <div class="segbar-leg">${cls.concat([{ c: 'future', v: fut }]).map((x) => `<span>${sw(x.c)}${CLASS_LABEL[x.c]} <strong>${pct(x.v / (K + fut), false, 0)}</strong> ${eur(x.v, { cents: false })}</span>`).join('')}</div>
        <p class="vnote">Anteile an allem, was abgeflossen ist; Zukunft bleibt im Vermögen.</p>
      </section>
      <section class="rs rs-side" aria-labelledby="aV">
        <div class="tbd-head"><h2 id="aV">Größte Veränderungen</h2>${Kp != null ? `<span class="tbd-state"><span class="dl ${K <= Kp ? 'dl-good' : 'dl-bad'}">${eur(K - Kp, { cents: false, sign: true })} · ${pct(K / Kp - 1, true)}</span></span>` : ''}</div>
        ${moves.length ? `<ul class="dv dv-compact">${moves.map((x) => { const m = Math.max(...moves.map((y) => Math.abs(y.d))); return `<li><span class="dv-name">${sw(x.c.cls)}${esc(x.c.name)}</span><span class="dv-track"><i class="${x.d < 0 ? 'is-less' : 'is-more'}" style="width:${(Math.abs(x.d) / m) * 50}%"></i></span><span class="dv-val"><strong class="${x.d <= 0 ? 'txt-good' : 'txt-bad'}">${eur(x.d, { cents: false, sign: true })}</strong><small>${eur(x.p, { cents: false })} → ${eur(x.v, { cents: false })}</small></span></li>`; }).join('')}</ul>
          <p class="vnote">Gegen die gleich lange Vorperiode; rechts mehr, links weniger ausgegeben.</p>` : '<p class="vnote">Für „Alles“ gibt es keine Vorperiode.</p>'}
      </section>
      <section class="rs rs-wide" aria-labelledby="aB">
        <div class="tbd-head"><h2 id="aB">Nach Kategorie</h2><span class="tbd-state"><span class="ink">${rows.length} Kategorien</span></span></div>
        <ul class="vbars rbars rbars-cols">${rows.map((x) => `<li><span class="vb-name">${sw(x.c.cls)}${esc(x.c.name)}</span><span class="vb-bar"><i class="sw-${x.c.cls}" style="width:${(x.v / max) * 100}%"></i></span><span class="vb-val">${eur(x.v, { cents: false })}${x.p ? `<small class="${x.v <= x.p ? 'txt-good' : 'txt-bad'}">${pct(x.v / x.p - 1, true, 0)}</small>` : ''}</span></li>`).join('')}</ul>
      </section>
      <section class="rs rs-wide" aria-labelledby="aH">
        <div class="tbd-head"><h2 id="aH">Heatmap Kategorie × Monat</h2><span class="tbd-state"><span class="ink">${esc(labelShort(hk[0], true))} bis ${esc(labelShort(hk[hk.length - 1], true))}</span></span></div>
        <div class="rscroll rsticky">${RC.rowsTable(hrows, hk.map((k) => labelShort(k, true)), { total: true, cls: 'rg-heat' })}</div>
        <p class="vnote">Farbe je Zeile gegen den Durchschnitt der Kategorie: Rot = teurer Monat, Grün = günstiger. So fallen Saisonmuster auf (Reisen im August, Kleidung im März und Oktober).</p>
      </section>`;
  };

  // ---------- 2.2 Budgettreue ----------
  R.budgettreue = (v, st) => {
    const k = st.k, mo = MONTHS_ALL[k];
    const items = CONS.map((c) => ({ c, ist: SPEND[k][c.id], plan: PLAN[k][c.id] })).filter((x) => x.plan > 0 || x.ist > 0);
    const over = items.filter((x) => x.ist > x.plan + 1);
    const P = items.reduce((a, x) => a + x.plan, 0), I = items.reduce((a, x) => a + x.ist, 0);
    const max = Math.max(...items.map((x) => Math.max(x.ist, x.plan)));
    const live = mo.partial;
    const mk = range(Math.min(k, LAST_FULL) - 11, Math.min(k, LAST_FULL));
    const k12 = range(LAST_FULL - 11, LAST_FULL);
    const dev = CONS.map((c) => { const p = sumK(k12, (i) => PLAN[i][c.id]), i2 = sumK(k12, (i) => SPEND[i][c.id]); return { c, p, i: i2, d: p ? i2 / p - 1 : 0 }; }).filter((x) => x.p > 0).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const groups = [...new Set(items.map((x) => x.c.group))];
    v.innerHTML = `
      <section class="rs rs-main" aria-labelledby="bT">
        <div class="tbd-head"><h2 id="bT">${esc(mo.long)}${live ? ' · bis 17.' : ''}</h2><span class="tbd-state">${over.length ? `<span class="${live ? 'neg-alert' : 'ink'}">${icon('alert', 'icon icon-sm')}${over.length} über Plan</span>` : `<span class="ok">${icon('check-circle', 'icon icon-sm')}alles im Plan</span>`}</span></div>
        <div class="tbd-fig">${over.length}<span class="cents"> von ${items.length} über Plan</span></div>
        ${chain([{ label: 'Plan', val: eur(P, { cents: false }) }, { op: MINUS, label: live ? 'Ist bis heute' : 'Ist', val: eur(I, { cents: false }) }, { op: '=', label: P - I >= 0 ? 'Rest' : 'Überzogen', val: eur(P - I, { cents: false }), result: true }], 'Maßkette Plan gegen Ist')}
        <div class="bullets">${groups.map((gname) => `<div class="bl-grp"><h3 class="tech">${esc(gname)}</h3>${items.filter((x) => x.c.group === gname).map((x) => {
          const isOver = x.ist > x.plan + 1;
          return `<div class="bl${isOver ? (live ? ' is-alert' : ' is-over') : ''}">
            <span class="bl-name">${esc(x.c.name)}</span>
            <span class="bl-track" role="img" aria-label="Ist ${eur(x.ist)} von Plan ${eur(x.plan)}"><i class="bl-ist sw-${x.c.cls}" style="width:${(x.ist / max) * 100}%"></i>${x.plan ? `<i class="bl-plan" style="left:${(x.plan / max) * 100}%"></i>` : ''}</span>
            <span class="bl-val"><strong>${eur(x.ist, { cents: false })}</strong><small>/ ${eur(x.plan, { cents: false })}</small></span>
            <span class="bl-diff">${isOver ? `${live ? icon('alert-circle', 'icon icon-xs') : ''}${eur(x.ist - x.plan, { cents: false, sign: true })}` : `<span class="muted">${eur(x.ist - x.plan, { cents: false, sign: true })}</span>`}</span>
          </div>`;
        }).join('')}</div>`).join('')}</div>
        <p class="vnote">Balken = Ist, senkrechte Marke = Plan. Periodische Kategorien sind im Fälligkeitsmonat geplant.${live ? ' Rot heißt: jetzt handeln, im Plan umschichten.' : ''}</p>
      </section>
      <section class="rs rs-side" aria-labelledby="b5">
        <div class="tbd-head"><h2 id="b5">50/30/20 je Monat</h2></div>
        <div class="b523m">${mk.map((i) => {
          const al = RC.alloc([i]), e = al.income, sp = al.need + al.want + al.future;
          const tot = Math.max(e, sp);
          const W = (x) => `${((Math.max(0, x) / tot) * 100).toFixed(2)}%`;
          const pn = Math.round((al.need / e) * 100), pw = Math.round((al.want / e) * 100), pf = Math.round((al.future / e) * 100), pr = 100 - pn - pw - pf;
          return `<div class="b523-row${i === k ? ' is-cur' : ''}"><span class="tech">${labelShort(i, true)}</span>
            <span class="b523-bar">${[['need', al.need], ['want', al.want], ['future', al.future]].map(([c, x]) => `<span class="sw-${c}" style="width:${W(x)}"></span>`).join('')}${al.rest > 0 ? `<span class="b523-rest" style="width:${W(al.rest)}"></span>` : ''}<i class="b523-mark" style="left:${(e * 0.5 / tot) * 100}%"></i><i class="b523-mark" style="left:${(e * 0.8 / tot) * 100}%"></i>${sp > e ? `<i class="b523-mark b523-full" style="left:${(e / tot) * 100}%"></i>` : ''}</span>
            <span class="b523-num">${pn}/${pw}/${pf}<small class="${pr < 0 ? 'txt-bad' : 'txt-good'}">${pr < 0 ? MINUS : '+'}${Math.abs(pr)}</small></span></div>`;
        }).join('')}</div>
        <div class="segbar-leg">${['need', 'want', 'future'].map((c, i) => `<span>${sw(c)}${CLASS_LABEL[c]} · Soll ${[50, 30, 20][i]} %</span>`).join('')}<span><i class="sw sw-rest" aria-hidden="true"></i>Übrig / aus Guthaben</span></div>
        <p class="vnote">Je Zeile zusammen 100 % der Einnahmen: Bedarf/Wunsch/Zukunft plus Rest (grün übrig, rot aus Guthaben). Periodische Kosten und Sonderzahlungen zählen als Zwölftel.</p>
      </section>
      <section class="rs rs-wide" aria-labelledby="bD">
        <div class="tbd-head"><h2 id="bD">Planabweichung, rollierend 12 Monate</h2><span class="tbd-state"><span class="ink">Ziel ± 10 %</span></span></div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Kategorie</th><th class="tech n">Plan 12 M</th><th class="tech n">Ist 12 M</th><th class="tech n">Abweichung</th><th class="tech">Einordnung</th></tr></thead>
        <tbody>${dev.slice(0, 10).map((x) => `<tr><td>${sw(x.c.cls)}${esc(x.c.name)}</td><td class="n">${eur(x.p, { cents: false })}</td><td class="n">${eur(x.i, { cents: false })}</td><td class="n"><strong>${pct(x.d, true)}</strong></td><td>${Math.abs(x.d) <= 0.1 ? `<span class="status ok">${icon('check-circle')}im Band</span>` : `<span class="status">${icon('alert')}Plan anpassen?</span>`}</td></tr>`).join('')}</tbody></table></div>
      </section>`;
  };

  // ---------- 2.3 Verträge und Abos ----------
  // contract terms are account/contract settings in V1; sample values here
  const CONTRACTS = {
    miete: { art: 'Mietvertrag', since: '2021-03', term: 'unbefristet', notice: 3 },
    strom: { art: 'Energieliefervertrag', since: '2023-01', term: 'unbefristet', notice: 1, hint: 'Preis +10,5 % seit Jän 2026: Tarif vergleichen' },
    internet: { art: 'Internetvertrag', since: '2024-07', bindUntil: '2026-06', notice: 1, hint: 'Bindung abgelaufen: Neukundentarif verhandeln' },
    bankspesen: { art: 'Kontovertrag', since: '2019-02', term: 'jederzeit', notice: 0, hint: 'Gratiskonto spart 83 € im Jahr' },
    kreditrate: { art: 'Kreditvertrag', since: '2021-07', bindUntil: '2031-07', notice: null },
    kfzvers: { art: 'Kfz-Haftpflicht + Teilkasko', since: '2022-04', main: 4, notice: 1 },
    unfallvers: { art: 'Unfallversicherung', since: '2023-12', bindUntil: '2026-12', notice: 3 },
    mobilfunk: { art: 'Mobilfunkvertrag', since: '2023-02', bindUntil: '2025-02', notice: 1 },
    streaming: { art: 'Abo', since: '2022-05', term: 'monatlich', notice: 0 },
    fitness: { art: 'Mitgliedschaft', since: '2023-09', bindUntil: '2024-09', notice: 1 },
    cloud: { art: 'Abo', since: '2021-11', term: 'monatlich', notice: 0 },
    zeitung: { art: 'Abo', since: '2025-05', term: 'monatlich', notice: 0, cand: 'selten gelesen? 155 € im Jahr' },
    ki1: { art: 'Abo in USD', since: '2024-06', term: 'monatlich', notice: 0 },
    ki2: { art: 'Abo in USD', since: '2025-09', term: 'monatlich', notice: 0, cand: 'überschneidet sich mit dem KI-Assistenten' },
    hhvers: { art: 'Haushaltsversicherung', since: '2020-01', main: 1, notice: 3 },
  };
  const FIXGROUPS = ['Wohnen', 'Kredite', 'Versicherungen', 'Abos', 'Freizeit', 'Bank und Gebühren'];
  const TODAY_KEY = '2026-09';
  const addM = (key, n) => { const y = +key.slice(0, 4), m = +key.slice(5) - 1 + n; return `${y + Math.floor(m / 12)}-${String((((m % 12) + 12) % 12) + 1).padStart(2, '0')}`; };
  const keyLabel = (key) => `${MONTHS[+key.slice(5) - 1]} ${key.slice(0, 4)}`;
  // next date the contract can end, and the last month to give notice for it
  function nextExit(c) {
    if (c.notice == null) return { end: c.bindUntil, by: null, note: 'Laufzeit' };
    if (c.main) { let y = 2026; let end = `${y}-${String(c.main).padStart(2, '0')}`; if (addM(end, -c.notice) < TODAY_KEY) end = `${y + 1}-${String(c.main).padStart(2, '0')}`; return { end, by: addM(end, -c.notice), note: 'Hauptfälligkeit' }; }
    let end = addM(TODAY_KEY, c.notice + 1);
    if (c.bindUntil && c.bindUntil > end) end = c.bindUntil;
    return { end, by: c.notice ? addM(end, -c.notice) : TODAY_KEY, note: c.bindUntil && c.bindUntil > TODAY_KEY ? 'Bindung' : c.notice ? `${c.notice} Monat${c.notice > 1 ? 'e' : ''} Frist` : 'jederzeit' };
  }
  R.abos = (v) => {
    const key = MONTHS_ALL[35].key;
    const fix = CATS.filter((c) => c.kind === 'fix' && !c.transfer && priceAt(c, key) > 0);
    const per = CATS.filter((c) => c.kind === 'periodic' && CONTRACTS[c.id]);
    const perYear = (c) => RC.periodicYear(c, 2026);
    const mSum = fix.reduce((a, c) => a + priceAt(c, key), 0);
    const pSum = per.reduce((a, c) => a + perYear(c), 0);
    const net = 3812 + 800;
    const quote = (mSum + pSum / 12) / net;
    const usd = fix.filter((c) => c.usd);
    const k0 = RC.kOfKey(key), k12 = k0 - 12;
    const usd12 = usd.map((c) => {
      const ks = range(k0 - 11, k0 - 1).concat([k0]);
      const eurPaid = sumK(ks, (k) => SPEND[k][c.id]);
      const usdPaid = sumK(ks, (k) => (SPEND[k][c.id] ? RC.usdAt(c, MONTHS_ALL[k].key) : 0));
      return { c, usdNow: RC.usdAt(c, key), eurNow: priceAt(c, key), eurPaid, usdPaid, fee: eurPaid * 0.015 };
    });
    const cands = fix.concat(per).filter((c) => CONTRACTS[c.id] && (CONTRACTS[c.id].cand || CONTRACTS[c.id].hint));
    const saving = fix.filter((c) => CONTRACTS[c.id] && CONTRACTS[c.id].cand).reduce((a, c) => a + priceAt(c, key) * 12, 0);
    const changes = [];
    CATS.filter((c) => c.kind === 'fix' && !c.transfer && c.price).forEach((c) => c.price.forEach(([from, amt], i) => { if (i > 0) changes.push({ c, from, old: c.price[i - 1][1], amt }); else if (from > '2023-10') changes.push({ c, from, old: 0, amt }); }));
    usd.forEach((c) => changes.push({ c, from: c.usd[0][0], old: 0, amt: priceAt(c, c.usd[0][0]) }));
    changes.sort((a, b) => (a.from < b.from ? 1 : -1));
    const row = (c, pos) => {
      const ct = CONTRACTS[c.id] || {};
      const ex = ct.art ? nextExit(ct) : null;
      const monthly = c.kind === 'periodic' ? perYear(c) / 12 : priceAt(c, key);
      const soon = ex && ex.by && ex.by <= addM(TODAY_KEY, 2);
      return `<tr${ct.cand ? ' class="is-cand"' : ''}><td class="col-pos">${pos}</td><td>${sw(c.cls)}${esc(c.name)}<small class="muted">${esc(ct.art || '')}</small></td>
        <td class="n">${c.usd ? `${nf2.format(RC.usdAt(c, key))} $<small class="muted">${eur(priceAt(c, key))}</small>` : eur(monthly)}</td>
        <td class="n">${eur(monthly * 12, { cents: false })}</td>
        <td>${ct.since ? keyLabel(ct.since) : '–'}</td>
        <td>${ex ? (ex.end ? keyLabel(ex.end) : '–') + `<small class="muted">${esc(ex.note)}</small>` : '–'}</td>
        <td>${ex && ex.by ? `<span class="${soon ? 'txt-warn' : ''}">${keyLabel(ex.by)}</span>` : '<span class="muted">–</span>'}</td>
        <td>${ct.cand ? `<span class="status">${icon('alert')}kündigen? ${esc(ct.cand)}</span>` : ct.hint ? `<span class="muted">${esc(ct.hint)}</span>` : ''}</td></tr>`;
    };
    v.innerHTML = `
      <section class="rs rs-main" aria-labelledby="oT">
        <div class="tbd-head"><h2 id="oT">Gebunden je Monat</h2><span class="tbd-state"><span class="${quote <= 0.55 ? 'ok' : 'neg-alert'}">${icon(quote <= 0.55 ? 'check-circle' : 'alert-circle', 'icon icon-sm')}Fixkostenquote ${pct(quote)} · Ziel ≤ 55 % (R10)</span></span></div>
        <div class="tbd-fig">${fig(mSum + pSum / 12)}</div>
        ${chain([{ label: 'Verträge je Monat', val: eur(mSum) }, { op: '+', label: 'Jährliche ÷ 12', val: eur(pSum / 12) }, { op: '=', label: 'Gebunden', val: eur(mSum + pSum / 12), result: true }], 'Maßkette Verträge')}
        <svg class="rchart" id="oChart" role="img" aria-label="Vertragskosten je Monat seit Okt 2023, Preisänderungen markiert"></svg>
        <div class="legend" aria-hidden="true"><span><svg viewBox="0 0 26 8"><path class="l-actual" d="M0 4h26"/></svg>Verträge je Monat</span><span><svg viewBox="0 0 12 10"><path class="kote" d="M1 1h10L6 9Z"/></svg>Preisänderung oder neuer Vertrag</span></div>
      </section>
      <section class="rs rs-side" aria-labelledby="oK">
        <div class="tbd-head"><h2 id="oK">Kündigen oder verhandeln</h2><span class="tbd-state"><span class="ok">bis ${eur(saving, { cents: false })} im Jahr</span></span></div>
        <table class="rev-table"><tbody>${cands.map((c, i) => { const ct = CONTRACTS[c.id]; const ex = nextExit(ct); return `<tr><td class="rev-mark">${tri(String.fromCharCode(65 + i))}</td><td class="rev-what"><strong>${esc(c.name)}</strong><span>${esc(ct.cand || ct.hint)}${ex.by ? ` · kündbar bis ${keyLabel(ex.by)}` : ''}</span></td><td class="n">${ct.cand ? `<span class="nowrap">${eur(-priceAt(c, key) * 12, { cents: false })}</span><small class="muted">im Jahr</small>` : ''}</td></tr>`; }).join('')}</tbody></table>
        <p class="vnote">Vorschläge aus Preisänderungen, Überschneidungen und abgelaufenen Bindungen. Die Liquiditätsprognose rechnet mit ihnen, wenn es eng wird.</p>
      </section>
      <section class="rs rs-wide" aria-labelledby="oL">
        <div class="tbd-head"><h2 id="oL">Alle Verträge und Abos</h2><span class="tbd-state"><span class="ink">${fix.length + per.length} Positionen · ${eur(mSum * 12 + pSum, { cents: false })} im Jahr</span></span></div>
        <div class="rscroll"><table class="rtable rparts rcontracts"><thead><tr><th class="tech col-pos">Pos</th><th class="tech">Vertrag</th><th class="tech n">je Monat</th><th class="tech n">je Jahr</th><th class="tech">seit</th><th class="tech">frühestes Ende</th><th class="tech">kündigen bis</th><th class="tech">Hinweis</th></tr></thead>
        ${FIXGROUPS.map((gname, gi) => {
          const cs = fix.filter((c) => c.group === gname).concat(per.filter((c) => c.group === gname));
          if (!cs.length) return '';
          const gm = cs.reduce((a, c) => a + (c.kind === 'periodic' ? perYear(c) / 12 : priceAt(c, key)), 0);
          return `<tbody><tr class="rp-grp"><td class="col-pos">${gi + 1}</td><td><strong>${esc(gname)}</strong></td><td class="n"><strong>${eur(gm)}</strong></td><td class="n">${eur(gm * 12, { cents: false })}</td><td colspan="4"></td></tr>
            ${cs.map((c, i) => row(c, `${gi + 1}.${i + 1}`)).join('')}</tbody>`;
        }).join('')}
        </table></div>
      </section>
      <section class="rs rs-wide" aria-labelledby="oU">
        <div class="tbd-head"><h2 id="oU">Fremdwährung</h2></div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Abo</th><th class="tech n">Preis</th><th class="tech n">in EUR heute</th><th class="tech n">12 Monate bezahlt</th><th class="tech n">Ø Kurs</th><th class="tech n">Kartengebühr 1,5 %</th></tr></thead>
        <tbody>${usd12.map((u) => `<tr><td>${sw(u.c.cls)}${esc(u.c.name)}</td><td class="n">${nf2.format(u.usdNow)} $</td><td class="n">${eur(u.eurNow)}</td><td class="n">${eur(u.eurPaid)}<small class="muted">${nf2.format(u.usdPaid)} $</small></td><td class="n">${u.usdPaid ? nf2.format(u.eurPaid / u.usdPaid).replace(/0$/, '') : '–'} €/$</td><td class="n">${eur(u.fee)}</td></tr>`).join('')}</tbody></table></div>
        <p class="vnote">So rechnet die App: Jede Buchung behält Originalbetrag und Währung. In Euro umgerechnet wird mit dem EZB-Referenzkurs des Buchungstags; weicht die Bank ab, gilt der Bankbetrag und die Differenz läuft als Fremdwährungsgebühr in 2.6. Der Plan rechnet mit dem aktuellen Kurs; ein schwächerer Euro verteuert die Abos, ohne dass sich der Preis ändert.</p>
      </section>`;
    const svg = $('#oChart');
    const ks = range(0, 35);
    const tot = ks.map((k) => CATS.filter((c) => c.kind === 'fix' && !c.transfer).reduce((a, c) => a + priceAt(c, MONTHS_ALL[k].key), 0));
    const g = scaffold(svg, ks.length, Math.min(...tot) - 60, Math.max(...tot) + 30, { zero: false, labelAt: (i) => labelShort(i, i === 0), maxLabels: 9, T: 28, pad: 0.05 });
    if (!g) return;
    s('path', { d: tot.map((x, i) => `${i ? 'L' : 'M'}${(g.x(i) - g.bw / 2).toFixed(1)},${g.y(x).toFixed(1)} L${(g.x(i) + g.bw / 2).toFixed(1)},${g.y(x).toFixed(1)}`).join(' '), class: 'l-actual' }, svg);
    const byMonth = {};
    changes.forEach((x) => { (byMonth[x.from] = byMonth[x.from] || []).push(x); });
    Object.entries(byMonth).sort((a, b) => (a[0] < b[0] ? -1 : 1)).forEach(([from, xs], n) => {
      const i = MONTHS_ALL.findIndex((mo) => mo.key === from);
      if (i < 0) return;
      const yy = g.y(tot[i]) - 6 - (n % 2) * 16;
      tip(s('path', { d: `M${g.x(i) - g.bw / 2 - 5},${yy - 8}h10l-5,8Z`, class: 'kote' }, svg), xs.map((x) => `${x.c.name}: ${x.old ? eur(x.old) + ' → ' : 'neu '}${eur(x.amt)}`).join('\n'));
    });
    text(svg, g.x(35) + g.bw / 2, g.y(tot[35]) + 16, eur(tot[35]), 'svg-label-strong', 'end');
  };

  // ---------- 2.4 Persönliche Inflation ----------
  const VPI_M = (() => { // monthly index, Okt 2023 = 100
    const out = [100];
    for (let k = 1; k < 36; k++) { const y = MONTHS_ALL[k].y; const a = y === 2023 ? 0.04 : VPI[y]; out.push(out[k - 1] * Math.pow(1 + a, 1 / 12)); }
    return out;
  })();
  const level = (c, k) => (c.kind === 'fix' ? priceAt(c, MONTHS_ALL[k].key) : c.kind === 'var' ? c.base * Math.pow(1 + c.trend, k / 12) : null);
  R.inflation = (v) => {
    const basket = CONS.filter((c) => c.kind !== 'periodic' && level(c, 0) > 0);
    const w0 = basket.map((c) => ({ c, w: sumK(range(0, 11), (k) => SPEND[k][c.id]) }));
    const W = w0.reduce((a, x) => a + x.w, 0);
    const idxAt = (k) => 100 * w0.reduce((a, x) => a + (x.w / W) * (level(x.c, k) / level(x.c, 0)), 0);
    const P = range(0, 35).map(idxAt);
    const pi12 = P[LAST_FULL] / P[LAST_FULL - 12] - 1;
    const v12 = VPI_M[LAST_FULL] / VPI_M[LAST_FULL - 12] - 1;
    // contributions over the last 12 months, weights from the prior year
    const k0 = LAST_FULL - 12;
    const wk = basket.map((c) => ({ c, w: sumK(range(k0 - 11, k0), (k) => SPEND[k][c.id]) }));
    const WK = wk.reduce((a, x) => a + x.w, 0);
    const contrib = wk.map((x) => { const ch = level(x.c, LAST_FULL) / level(x.c, k0) - 1; return { ...x, share: x.w / WK, ch, pp: (x.w / WK) * ch }; }).sort((a, b) => b.pp - a.pp);
    const sumPP = contrib.reduce((a, x) => a + x.pp, 0);
    v.innerHTML = `
      <section class="rs rs-main" aria-labelledby="iT">
        <div class="tbd-head"><h2 id="iT">Eigene Teuerung, 12 Monate</h2><span class="tbd-state"><span class="ink">VPI ${pct(v12)} · Differenz ${nf1.format((pi12 - v12) * 100).replace('-', MINUS)} Pp</span></span></div>
        <div class="tbd-fig">${nf1.format(pi12 * 100)}<span class="cents"> %</span></div>
        ${chain([{ label: `Warenkorb ${labelShort(k0, true)}`, val: nf1.format(P[k0]) }, { op: '→', label: `${labelShort(LAST_FULL, true)}`, val: nf1.format(P[LAST_FULL]) }, { op: '=', label: 'Teuerung', val: pct(pi12, true), result: true }], 'Maßkette persönliche Inflation')}
        <svg class="rchart" id="iChart" role="img" aria-label="Persönlicher Preisindex gegen Verbraucherpreisindex, Okt 2023 = 100"></svg>
        <div class="legend" aria-hidden="true"><span><svg viewBox="0 0 26 8"><path class="l-actual" d="M0 4h26"/></svg>Eigener Warenkorb</span><span><svg viewBox="0 0 26 8"><path class="l-prev" d="M0 4h26"/></svg>VPI (Beispielwerte)</span></div>
      </section>
      <section class="rs rs-side" aria-labelledby="iM">
        <div class="tbd-head"><h2 id="iM">So wird gerechnet</h2></div>
        <ol class="rsteps">
          <li><strong>Warenkorb</strong> = eure Ausgaben ohne Zukunft und ohne periodische Posten, gewichtet mit dem Vorjahr.</li>
          <li><strong>Fixkosten</strong> gehen mit echten Preisen ein (Miete, Strom, Abos).</li>
          <li><strong>Variable Kategorien</strong> gehen saisonbereinigt ein; Menge und Preis lassen sich dort nicht trennen.</li>
          <li><strong>Beitrag</strong> = Gewicht × Preisänderung, in Prozentpunkten.</li>
        </ol>
      </section>
      <section class="rs rs-wide" aria-labelledby="iC">
        <div class="tbd-head"><h2 id="iC">Beitrag je Kategorie</h2><span class="tbd-state"><span class="ink">Summe ${nf1.format(sumPP * 100)} Pp</span></span></div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Kategorie</th><th class="tech">Art</th><th class="tech n">Gewicht</th><th class="tech n">Preis 12 M</th><th class="tech">Beitrag</th><th class="tech n">Pp</th></tr></thead>
        <tbody>${contrib.map((x) => `<tr><td>${sw(x.c.cls)}${esc(x.c.name)}</td><td class="muted">${x.c.kind === 'fix' ? 'Preis' : 'saisonbereinigt'}</td><td class="n">${pct(x.share)}</td><td class="n">${pct(x.ch, true)}</td>
          <td class="pp-cell"><span class="pp"><i class="${x.pp < 0 ? 'is-neg' : ''}" style="width:${Math.min(100, Math.abs(x.pp) / Math.max(...contrib.map((y) => Math.abs(y.pp))) * 100)}%"></i></span></td><td class="n"><strong>${(x.pp < 0 ? MINUS : '+') + nf2.format(Math.abs(x.pp * 100))}</strong></td></tr>`).join('')}</tbody></table></div>
      </section>`;
    const svg = $('#iChart');
    const ks = range(0, 35);
    const g = scaffold(svg, ks.length, Math.min(...P, ...VPI_M), Math.max(...P, ...VPI_M), { zero: false, yfmt: (x) => nf0.format(x), labelAt: (i) => labelShort(i, i === 0), maxLabels: 9, L: 44, R: 60 });
    if (!g) return;
    s('line', { x1: g.f.L, x2: g.f.W - g.f.R, y1: g.y(100), y2: g.y(100), class: 'axis' }, svg);
    path(svg, ks.map((k) => [g.x(k), g.y(VPI_M[k])]), 'l-prev');
    path(svg, ks.map((k) => [g.x(k), g.y(P[k])]), 'l-actual');
    let ya = g.y(P[35]) + 4, yb = g.y(VPI_M[35]) + 4;
    if (Math.abs(ya - yb) < 15) { if (ya < yb) yb = ya + 15; else ya = yb + 15; }
    text(svg, g.x(35) + 8, ya, nf1.format(P[35]), 'svg-label-strong');
    text(svg, g.x(35) + 8, yb, `VPI ${nf1.format(VPI_M[35])}`, 'svg-label');
  };

  // ---------- 2.5 Empfänger-Analyse ----------
  const payeesOver = (ks) => {
    const m = {};
    ks.forEach((k) => Object.entries(PAYEE[k]).forEach(([name, p]) => {
      const x = m[name] || (m[name] = { name, amt: 0, n: 0, cats: new Set(), months: new Set() });
      x.amt += p.amt; x.n += p.n; p.cats.forEach((c) => x.cats.add(c)); x.months.add(k);
    }));
    return Object.values(m);
  };
  R.empfaenger = (v, st) => {
    const ks = windowK(st.period);
    const prev = prevWindow(ks);
    const ps = payeesOver(ks).sort((a, b) => b.amt - a.amt);
    const pm = prev ? Object.fromEntries(payeesOver(prev).map((x) => [x.name, x.amt])) : null;
    const tot = ps.reduce((a, x) => a + x.amt, 0);
    const top5 = ps.slice(0, 5).reduce((a, x) => a + x.amt, 0);
    const max = ps[0].amt;
    const n = ps.reduce((a, x) => a + x.n, 0);
    v.innerHTML = `
      <section class="rs rs-main" aria-labelledby="pT">
        <div class="tbd-head"><h2 id="pT">${ps.length} Empfänger · ${esc(periodName(st.period))}</h2><span class="tbd-state"><span class="ink">${nf0.format(n)} Zahlungen · Ø ${eur(tot / n)}</span></span></div>
        <div class="tbd-fig">${pct(top5 / tot, false, 0).replace(' %', '')}<span class="cents"> % bei fünf Empfängern</span></div>
        ${chain([{ label: 'Top 5', val: eur(top5, { cents: false }) }, { op: '+', label: `übrige ${ps.length - 5}`, val: eur(tot - top5, { cents: false }) }, { op: '=', label: 'Ausgaben', val: eur(tot, { cents: false }), result: true }], 'Maßkette Empfänger')}
        <ul class="vbars rbars">${ps.slice(0, 14).map((x) => `<li><span class="vb-name">${esc(x.name)}</span><span class="vb-bar"><i style="width:${(x.amt / max) * 100}%"></i></span><span class="vb-val">${eur(x.amt, { cents: false })}</span></li>`).join('')}</ul>
      </section>
      <section class="rs rs-side" aria-labelledby="pB">
        <div class="tbd-head"><h2 id="pB">Häufigste Bons</h2></div>
        <table class="rtable"><thead><tr><th class="tech">Empfänger</th><th class="tech n">Anzahl</th><th class="tech n">Ø Bon</th></tr></thead>
        <tbody>${ps.slice().sort((a, b) => b.n - a.n).slice(0, 8).map((x) => `<tr><td>${esc(x.name)}</td><td class="n">${nf0.format(x.n)}×</td><td class="n">${eur(x.amt / x.n)}</td></tr>`).join('')}</tbody></table>
        <p class="vnote">Kleine, häufige Beträge summieren sich: ein Blick auf Bäckerei, Café und Lieferdienst lohnt.</p>
      </section>
      <section class="rs rs-wide" aria-labelledby="pL">
        <div class="tbd-head"><h2 id="pL">Alle Empfänger</h2></div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Empfänger</th><th class="tech">Kategorien</th><th class="tech n">Anzahl</th><th class="tech n">Ø Bon</th><th class="tech n">Summe</th><th class="tech n">Anteil</th><th class="tech n">Zur Vorperiode</th></tr></thead>
        <tbody>${ps.map((x) => `<tr><td><strong>${esc(x.name)}</strong></td><td class="muted">${esc([...x.cats].join(', '))}</td><td class="n">${nf0.format(x.n)}</td><td class="n">${eur(x.amt / x.n)}</td><td class="n"><strong>${eur(x.amt, { cents: false })}</strong></td><td class="n">${pct(x.amt / tot)}</td><td class="n">${pm && pm[x.name] ? delta(x.amt - pm[x.name]) : '<span class="muted">–</span>'}</td></tr>`).join('')}</tbody></table></div>
      </section>`;
  };

  // ---------- 2.6 Bank- und Zinskosten ----------
  // credit lines come from Einstellungen › Konten (Rahmen, Zinssatz, Laufzeit); sample values
  const CREDIT = [
    { name: 'Kredit', inst: 'Bank F', art: 'Ratenkredit', limit: 30000, used: () => LOAN.now, rate: LOAN.rate, fixed: 'fix bis 07.2031', pay: '412 € + 300 € Sondertilgung', cost12: () => sumK(range(LAST_FULL - 11, LAST_FULL), (k) => LOANH[k].interest) },
    { name: 'Dispo Girokonto', inst: 'Bank A', art: 'Kontoüberziehung', limit: 2000, used: () => 0, rate: 0.1175, fixed: 'variabel', pay: () => `nicht genutzt · Tiefpunkt Prognose ${RC.forecastLow ? eur(RC.forecastLow.bal, { cents: false }) : '–'}`, cost12: () => 0 },
    { name: 'Kreditkarte', inst: 'Bank A', art: 'Charge-Karte', limit: 2000, used: () => 450, rate: 0.139, fixed: 'nur bei Teilzahlung', pay: 'monatlich voll ausgeglichen', cost12: () => 0 },
  ];
  R.kosten = (v) => {
    const k12 = range(LAST_FULL - 11, LAST_FULL), p12 = range(LAST_FULL - 23, LAST_FULL - 12);
    const fxBase = (k) => (MONTHS_ALL[k].m === 7 ? 1420 : MONTHS_ALL[k].m === 1 ? 650 : 0) + SPEND[k].ki1 + SPEND[k].ki2;
    const parts = [
      { key: 'zins', name: 'Kreditzinsen', fn: (k) => LOANH[k].interest, base: (ks) => `${nf2.format(LOAN.rate * 100)} % auf Ø ${eur(sumK(ks, (k) => LOANH[k].end) / ks.length, { cents: false })} Restschuld`, lever: 'Sondertilgung weiterführen (R09)' },
      { key: 'konto', name: 'Kontoführung', fn: (k) => SPEND[k].bankspesen, base: () => `${eur(SPEND[LAST_FULL].bankspesen)} je Monat`, lever: 'Gratiskonto: −83 € im Jahr' },
      { key: 'fonds', name: 'Fondskosten (TER)', fn: (k) => RC.PRODUCTS.reduce((a, p) => a + RC.PV[p.id].v[k] * p.ter, 0) / 12, base: (ks) => `Ø ${pct(RC.PRODUCTS.reduce((a, p) => a + p.now * p.ter, 0) / RC.PRODUCTS.filter((p) => p.ter).reduce((a, p) => a + p.now, 0), false, 2)} auf ${eur(RC.PRODUCTS.filter((p) => p.ter).reduce((a, p) => a + p.now, 0), { cents: false })}`, lever: 'ETF mit 0,12 % TER: −55 € im Jahr' },
      { key: 'order', name: 'Ordergebühren', fn: (k) => 1.5 + (MONTHS_ALL[k].m === 5 || MONTHS_ALL[k].m === 10 ? 4.9 : 0), base: (ks) => `${pct(sumK(ks, (k) => 1.5 + (MONTHS_ALL[k].m === 5 || MONTHS_ALL[k].m === 10 ? 4.9 : 0)) / sumK(ks, (k) => SPEND[k].investieren), false, 2)} der Einzahlungen`, lever: 'Broker ohne Sparplangebühr' },
      { key: 'fx', name: 'Fremdwährung', fn: (k) => fxBase(k) * 0.015, base: (ks) => `1,5 % auf ${eur(sumK(ks, fxBase), { cents: false })} Umsatz in USD und Reisen`, lever: 'Karte ohne Auslandsentgelt' },
    ];
    const earn = (k) => INCOME[k].Kapitalerträge;
    const rows = parts.map((p) => { const a = sumK(k12, p.fn), b = sumK(p12, p.fn); return { ...p, a, b, d: b ? a / b - 1 : null }; });
    const A = rows.reduce((x, r) => x + r.a, 0), B = rows.reduce((x, r) => x + r.b, 0);
    const Ea = sumK(k12, earn), Eb = sumK(p12, earn);
    const inc12 = sumK(k12, incomeOf);
    const cols = [
      { label: '2024', ks: MONTHS_ALL.filter((m) => m.y === 2024).map((m) => m.k) },
      { label: '2025', ks: MONTHS_ALL.filter((m) => m.y === 2025).map((m) => m.k) },
      { label: '2026 bis Aug', ks: MONTHS_ALL.filter((m) => m.y === 2026 && m.k <= LAST_FULL).map((m) => m.k) },
    ].map((c) => ({ ...c, v: parts.map((p) => sumK(c.ks, p.fn)), e: sumK(c.ks, earn) }));
    cols.forEach((c) => { c.tot = c.v.reduce((a, b) => a + b, 0); });
    const maxT = Math.max(...cols.map((c) => c.tot));
    const rest = (extra) => { let b = LOAN.now, z = 0, m = 0; const i = LOAN.rate / 12; while (b > 0.005 && m < 400) { const zz = b * i; z += zz; b = b + zz - Math.min(b + zz, LOAN.pmt + extra); m++; } return { z, m }; };
    const r0 = rest(0), r1 = rest(300);
    const endOf = (m) => { const d = new Date(2026, 8 + m, 1); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
    v.innerHTML = `
      <section class="rs rs-main" aria-labelledby="cT">
        <div class="tbd-head"><h2 id="cT">Kosten des Geldes, 12 Monate</h2><span class="tbd-state"><span class="dl ${A <= B ? 'dl-good' : 'dl-bad'}">${eur(A - B, { cents: false, sign: true })} zum Vorjahr</span></span></div>
        <div class="tbd-fig">${fig(A)}</div>
        ${chain([{ label: 'Zinsen und Dividenden', val: eur(Ea, { cents: false }) }, { op: MINUS, label: 'Kosten', val: eur(A, { cents: false }) }, { op: '=', label: Ea >= A ? 'Netto-Ertrag' : 'Netto-Kosten', val: eur(Ea - A, { cents: false }), result: true }], 'Maßkette Bank- und Zinskosten')}
        <div class="kcost">${cols.map((c) => `<div class="kc-row"><span class="tech">${esc(c.label)}</span>
          <span class="kc-bar" role="img" aria-label="${esc(c.label)}: ${eur(c.tot, { cents: false })}">${c.v.map((x, i) => `<span class="kc-${i + 1}" style="width:${(x / maxT) * 100}%" title="${esc(parts[i].name)}: ${eur(x)}"></span>`).join('')}</span>
          <span class="kc-val"><strong>${eur(c.tot, { cents: false })}</strong><small>Erträge ${eur(c.e, { cents: false })}</small></span></div>`).join('')}</div>
        <div class="segbar-leg">${parts.map((p, i) => `<span><i class="sw kc-${i + 1}"></i>${esc(p.name)}</span>`).join('')}</div>
      </section>
      <section class="rs rs-side" aria-labelledby="cK">
        <div class="tbd-head"><h2 id="cK">Kredit ${nf2.format(LOAN.rate * 100)} %</h2></div>
        <dl class="rc-facts rc-facts-1">
          <div><dt class="tech">Restschuld heute</dt><dd>${eur(LOAN.now)}</dd></div>
          <div><dt class="tech">Nur Rate</dt><dd>${eur(r0.z, { cents: false })} Zinsen<small>schuldenfrei ${endOf(r0.m)}</small></dd></div>
          <div><dt class="tech">Mit 300 € Sondertilgung (aktuell)</dt><dd>${eur(r1.z, { cents: false })} Zinsen<small>schuldenfrei ${endOf(r1.m)}</small></dd></div>
          <div><dt class="tech">Ersparnis</dt><dd class="txt-good">${eur(r0.z - r1.z, { cents: false })}<small>${r0.m - r1.m} Monate früher</small></dd></div>
        </dl>
        <p class="vnote">Die Sondertilgung läuft seit Juni 2026 (R09: Zins über 5 %). Ändern kannst du sie im Schuldenrechner unter Vermögen.</p>
      </section>
      <section class="rs rs-wide" aria-labelledby="cA">
        <div class="tbd-head"><h2 id="cA">Kreditlinien</h2><a class="tb-link" href="einstellungen.html#konten">In Einstellungen › Konten pflegen ${icon('chevron', 'icon icon-xs')}</a></div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Konto</th><th class="tech">Art</th><th class="tech n">Rahmen</th><th class="tech n">genutzt</th><th class="tech">Auslastung</th><th class="tech n">Zinssatz</th><th class="tech">Konditionen</th><th class="tech n">Zinsen 12 M</th></tr></thead>
        <tbody>${CREDIT.map((c) => { const u = c.used(); return `<tr><td><strong>${esc(c.name)}</strong><small class="muted">${esc(c.inst)}</small></td><td>${esc(c.art)}</td><td class="n">${eur(c.limit, { cents: false })}</td><td class="n">${eur(u, { cents: false })}</td><td><span class="gbar gbar-s"><i style="width:${Math.min(100, (u / c.limit) * 100)}%"></i></span><small class="muted">${pct(u / c.limit, false, 0)}</small></td><td class="n">${nf2.format(c.rate * 100)} %</td><td><small>${esc(c.fixed)} · ${esc(typeof c.pay === 'function' ? c.pay() : c.pay)}</small></td><td class="n">${eur(c.cost12(), { cents: false })}</td></tr>`; }).join('')}</tbody></table></div>
        <p class="vnote">Kartenauslastung Ziel ≤ 30 % (Konzept 8). Dispo ist nie Teil des Plans (R07); der Rahmen zählt nicht als Liquidität.</p>
      </section>
      <section class="rs rs-wide" aria-labelledby="cL">
        <div class="tbd-head"><h2 id="cL">Nach Art: was es kostet und was es ändert</h2><span class="tbd-state"><span class="ink">${pct(A / inc12, false, 2)} der Einnahmen</span></span></div>
        <div class="rscroll"><table class="rtable"><thead><tr><th class="tech">Posten</th><th class="tech n">12 Monate</th><th class="tech n">12 Monate davor</th><th class="tech n">Veränderung</th><th class="tech n">Anteil</th><th class="tech">Bezugsgröße</th><th class="tech">Stellschraube</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr><td><i class="sw kc-${i + 1}" aria-hidden="true"></i>${esc(r.name)}</td><td class="n"><strong>${eur(r.a)}</strong></td><td class="n">${eur(r.b)}</td><td class="n">${r.d == null ? '–' : `<span class="dl ${r.d <= 0 ? 'dl-good' : 'dl-bad'}">${pct(r.d, true, 0)}</span>`}</td><td class="n">${pct(r.a / A, false, 0)}</td><td><small>${esc(r.base(k12))}</small></td><td><small>${esc(r.lever)}</small></td></tr>`).join('')}
          <tr class="is-total"><td>Kosten</td><td class="n"><strong>${eur(A)}</strong></td><td class="n">${eur(B)}</td><td class="n"><span class="dl ${A <= B ? 'dl-good' : 'dl-bad'}">${pct(A / B - 1, true, 0)}</span></td><td class="n">100 %</td><td colspan="2"><small>${pct(A / inc12, false, 2)} der Einnahmen</small></td></tr>
          <tr><td>Zinsen und Dividenden</td><td class="n">${eur(Ea)}</td><td class="n">${eur(Eb)}</td><td class="n"><span class="dl ${Ea >= Eb ? 'dl-good' : 'dl-bad'}">${pct(Ea / Eb - 1, true, 0)}</span></td><td></td><td colspan="2"><small>Tagesgeld, Dividenden, P2P-Zinsen (nach KESt)</small></td></tr>
          <tr class="is-total"><td>Erträge − Kosten</td><td class="n"><strong>${eur(Ea - A, { sign: true })}</strong></td><td class="n">${eur(Eb - B, { sign: true })}</td><td></td><td></td><td colspan="2"></td></tr></tbody></table></div>
        <p class="vnote">Fondskosten werden nicht abgebucht, sie mindern den Kurs; hier aus Depotwert × TER geschätzt. Fremdwährung: KI-Abos in USD und Reisen, mit der Karte bezahlt.</p>
      </section>`;
  };
})();
