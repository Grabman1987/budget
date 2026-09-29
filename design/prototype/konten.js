/* Finanz-App prototype · Konten. Sample data only.
   Helpers mirror app.js / plan.js; unify them in the React build. */
(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const MINUS = '−';
  const r2 = (v) => Math.round(v * 100) / 100;
  const eur = (v, { cents = true, sign = false } = {}) => {
    const a = Math.abs(v);
    const s = cents ? nf2.format(a) : nf0.format(Math.round(a));
    return (v < -0.004 ? MINUS : sign && v > 0.004 ? '+' : '') + s + ' €';
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Sample data ----------
  const GROUPS = [
    { key: 'budget', title: 'Budget-Konten', sub: 'verteilbares Geld' },
    { key: 'save', title: 'Sparen', sub: 'Tagesgeld, Notgroschen' },
    { key: 'invest', title: 'Investment', sub: 'Depot, Krypto, P2P' },
    { key: 'debt', title: 'Schulden', sub: 'Kredite' },
    { key: 'claim', title: 'Forderungen', sub: 'Kontakte' },
  ];
  const acc = (id, name, inst, type, group, bal, src, extra = {}) => ({ id, name, inst, type, group, bal, src, ...extra });
  const ACCOUNTS = [
    acc('giro', 'Girokonto', 'Bank A', 'Giro', 'budget', 1497, { kind: 'sync', text: 'Bank-Sync heute 06:30' }, { delta30: -1113, jump: 13 }),
    acc('bargeld', 'Bargeld', 'Geldbörse', 'Bargeld', 'budget', 120, { kind: 'manual', text: 'manuell · 15.09.' }, { delta30: -35 }),
    acc('karte', 'Kreditkarte', 'Bank A', 'Kreditkarte', 'budget', -450, { kind: 'sync', text: 'Bank-Sync heute 06:30' }, { delta30: -212, limit: 2000 }),
    acc('tagesgeld', 'Tagesgeld', 'Bank B', 'Tagesgeld', 'save', 7739, { kind: 'warn', text: 'Einwilligung läuft in 12 Tagen ab' }, { delta30: 300 }),
    acc('depot', 'Depot · ETF', 'Broker C', 'Depot', 'invest', 79450, { kind: 'import', text: 'Import 14.09. · Kurse heute 06:30' }, { delta30: 1240 }),
    acc('krypto', 'Krypto', 'Plattform D', 'Krypto', 'invest', 4335, { kind: 'sync', text: 'API heute 06:30' }, { delta30: -180 }),
    acc('p2p', 'P2P-Kredite', 'Plattform E', 'P2P', 'invest', 4215, { kind: 'stale', text: 'manuell · vor 34 Tagen' }, { delta30: 0 }),
    acc('kredit', 'Kredit 6,32 %', 'Bank F', 'Kredit', 'debt', -12176, { kind: 'manual', text: 'Tilgungsplan · Rate am 03.' }, { delta30: 346 }),
    acc('kontakt', 'M. Muster', 'Kontakt', 'Forderung', 'claim', 0, { kind: 'manual', text: 'ausgeglichen am 30.08.' }, { delta30: 0 }),
  ];
  const accById = (id) => ACCOUNTS.find((a) => a.id === id);
  const CATEGORIES = ['Lebensmittel', 'Treibstoff', 'Haushalt', 'Gesundheit', 'Kleidung', 'Öffis', 'Lieferdienste', 'Freizeit', 'Essen gehen', 'Hobby', 'Miete', 'Strom', 'Internet', 'Mobilfunk', 'Streaming', 'Kreditrate (Mindestrate)', 'Kfz-Versicherung', 'Investieren', 'Reisen', 'Geschenke'];
  const CLS = { Lebensmittel: 'need', Treibstoff: 'need', Haushalt: 'need', Gesundheit: 'need', Kleidung: 'need', 'Öffis': 'need', Miete: 'need', Strom: 'need', Internet: 'need', Mobilfunk: 'need', 'Kreditrate (Mindestrate)': 'need', 'Kfz-Versicherung': 'need', Lieferdienste: 'want', Freizeit: 'want', 'Essen gehen': 'want', Hobby: 'want', Streaming: 'want', Reisen: 'want', Geschenke: 'want', Investieren: 'future' };

  let seq = 0;
  const tx = (day, acct, payee, cat, amt, st = 'bestätigt', note = '') => ({ id: `t${++seq}`, day, acct, payee, cat, amt, st, note });
  const TX = [
    tx(17, 'giro', 'Supermarkt', 'Lebensmittel', -84.2, 'vorgemerkt', 'Anteil für Kontakt'),
    tx(16, 'giro', 'Online-Händler', null, -39.9),
    tx(16, 'giro', 'Tagesgeld', null, -300, 'bestätigt', 'Dauerauftrag'),
    tx(16, 'tagesgeld', 'Girokonto', null, 300),
    tx(16, 'karte', 'Tankstelle', 'Treibstoff', -58.1),
    tx(16, 'karte', 'Tankstelle', 'Treibstoff', -58.1, 'bestätigt', 'Bank-Import 06:30'),
    tx(16, 'karte', 'Lieferdienst', 'Lieferdienste', -24.9),
    tx(15, 'giro', 'Internet', 'Internet', -60),
    tx(15, 'giro', 'Apotheke', null, -12.35),
    tx(15, 'bargeld', 'Bäckerei', null, -6.4),
    tx(15, 'karte', 'Kino', 'Freizeit', -26),
    tx(14, 'giro', 'Drogerie', 'Haushalt', -35.5),
    tx(13, 'giro', 'Buchhandlung', null, -18.9),
    tx(12, 'karte', 'Restaurant', 'Essen gehen', -48.5),
    tx(11, 'giro', 'Supermarkt', 'Lebensmittel', -96.4),
    tx(10, 'giro', 'Kfz-Versicherung', 'Kfz-Versicherung', -48),
    tx(9, 'karte', 'Tankstelle', 'Treibstoff', -52.3),
    tx(8, 'giro', 'Bekleidungsgeschäft', 'Kleidung', -30),
    tx(7, 'karte', 'Freizeitpark', 'Freizeit', -30),
    tx(6, 'giro', 'Supermarkt', 'Lebensmittel', -112.6),
    tx(5, 'giro', 'Depot · ETF', 'Investieren', -176.51, 'bestätigt', 'Sparplan'),
    tx(5, 'karte', 'Restaurant', 'Essen gehen', -72.5),
    tx(4, 'karte', 'Tankstelle', 'Treibstoff', -42),
    tx(3, 'giro', 'Bank F', 'Kreditrate (Mindestrate)', -412),
    tx(2, 'giro', 'Supermarkt', 'Lebensmittel', -94.8),
    tx(1, 'giro', 'Hausverwaltung', 'Miete', -890),
  ];
  // Balance reported by the bank (booked, without pending), per account. Karte: the duplicate is not in it.
  const bankBooked = { giro: 1581.2, karte: -391.9, tagesgeld: 7739, bargeld: 120 };
  const checkedUntil = { giro: '31.08.', karte: '31.08.', tagesgeld: '31.08.', bargeld: '31.08.' };

  const state = {
    inbox: [
      { id: 'u1', type: 'uncat', tx: 't2', sug: 'Haushalt' },
      { id: 'u2', type: 'uncat', tx: 't8', sug: 'Gesundheit' },
      { id: 'u3', type: 'uncat', tx: 't9', sug: 'Lebensmittel' },
      { id: 'u4', type: 'uncat', tx: 't12', sug: 'Hobby' },
      { id: 'x1', type: 'transfer', out: 't3', in: 't4' },
      { id: 'v1', type: 'version', title: 'Strom: neuer Abschlag ab Oktober', sub: '118,00 € statt 105,00 € laut Buchungstext der letzten Abbuchung' },
      { id: 'm1', type: 'stale', acct: 'p2p' },
      { id: 'c1', type: 'consent', acct: 'tagesgeld' },
      { id: 'o1', type: 'over', title: 'Treibstoff ist überzogen', sub: '−12,40 € · im Plan aus einem anderen Envelope decken' },
    ],
    selected: new Set(),
    filter: { q: '', acct: '', cat: '', st: '' },
  };
  const txById = (id) => TX.find((t) => t.id === id);

  // ---------- Toast + undo ----------
  let toastTimer = null, undoFn = null;
  function toast(text, undo) {
    $('#toastText').textContent = text;
    undoFn = undo || null;
    $('#toastUndo').hidden = !undo;
    $('#toast').classList.add('is-open');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').classList.remove('is-open'), 6000);
  }
  $('#toastUndo').addEventListener('click', () => { if (undoFn) undoFn(); undoFn = null; $('#toast').classList.remove('is-open'); });
  function change(label, fn) {
    const before = JSON.stringify({ TX, inbox: state.inbox, bal: ACCOUNTS.map((a) => a.bal) });
    fn();
    route();
    toast(label, () => {
      const b = JSON.parse(before);
      TX.splice(0, TX.length, ...b.TX);
      state.inbox = b.inbox;
      ACCOUNTS.forEach((a, i) => { a.bal = b.bal[i]; });
      route();
      toast('Rückgängig gemacht.');
    });
  }

  // ---------- SVG helpers ----------
  function s(tag, attrs = {}, parent) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
  }
  // Balance history is derived from bookings (a ledger), never invented: September comes from TX,
  // June to August from each account's recurring pattern. Market accounts move with prices.
  const TODAY = new Date(2026, 8, 17);
  const DAY = 86400000;
  const RECUR = {
    giro: [[30, 3812], [30, 800], [31, -1304], [1, -890], [2, -94.8], [3, -412], [5, -176.51], [6, -112.6], [8, -180], [10, -48], [11, -96.4], [15, -60], [16, -300], [18, -150], [20, -105], [22, -25], [24, -118.3], [25, -126.8], [27, -412.6]],
    karte: [[4, -42], [5, -72.5], [7, -30], [9, -52.3], [12, -48.5], [15, -26], [16, -58.1], [16, -24.9], [27, 412.6]],
    tagesgeld: [[16, 300], [31, 1304]],
    bargeld: [[2, 150], [5, -32], [12, -41.5], [19, -28], [26, -36.2]],
    kredit: [[3, 346]],
  };
  const VALUATION = { p2p: [[new Date(2026, 7, 14), 62]] };
  const MARKET = { depot: 0.006, krypto: 0.03 };
  function events(a) {
    const ev = TX.filter((t) => t.acct === a.id).map((t) => ({ d: new Date(2026, 8, t.day), amt: t.amt }));
    const rec = RECUR[a.id] || [];
    for (const m of [5, 6, 7]) rec.forEach(([day, amt]) => ev.push({ d: new Date(2026, m, day), amt }));
    if (a.id === 'kredit') ev.push({ d: new Date(2026, 8, 3), amt: 346 });
    (VALUATION[a.id] || []).forEach(([d, amt]) => ev.push({ d, amt }));
    return ev;
  }
  const ledgerCache = new Map();
  function series(a, days) {
    const key = `${a.id}:${days}:${a.bal}:${TX.length}`;
    if (ledgerCache.has(key)) return ledgerCache.get(key);
    const from = new Date(TODAY.getTime() - days * DAY);
    const ev = events(a).filter((e) => e.d > from && e.d <= TODAY);
    const byDay = new Array(days + 1).fill(0);
    ev.forEach((e) => { const i = Math.round((e.d - from) / DAY); if (i >= 1 && i <= days) byDay[i] += e.amt; });
    // market value drift for depot and krypto (prices, not bookings)
    if (MARKET[a.id]) {
      let seed = [...a.id].reduce((x, ch) => x + ch.charCodeAt(0), 7);
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let i = 1; i <= days; i++) byDay[i] += (rnd() - 0.48) * Math.abs(a.bal) * MARKET[a.id];
    }
    const total = byDay.reduce((x, v) => x + v, 0);
    const out = [];
    let v = a.bal - total;
    for (let i = 0; i <= days; i++) { v += byDay[i]; out.push(r2(v)); }
    ledgerCache.set(key, out);
    return out;
  }
  const stepPath = (pts, x, y) => pts.map((v, i) => (i === 0 ? `M${x(0).toFixed(1)},${y(v).toFixed(1)}` : `L${x(i).toFixed(1)},${y(pts[i - 1]).toFixed(1)} L${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join(' ');
  function miniLine(a) {
    const pts = series(a, 30);
    const W = 120, H = 30;
    const min = Math.min(...pts), max = Math.max(...pts);
    const span = max - min || 1;
    const x = (i) => (i / 30) * W;
    const y = (v) => H - 3 - ((v - min) / span) * (H - 6);
    const d = stepPath(pts, x, y);
    return `<svg class="kmini" viewBox="0 0 ${W} ${H}" aria-hidden="true"><line x1="0" x2="${W}" y1="${y(pts[0])}" y2="${y(pts[0])}" class="l-plan"/><path d="${d}" class="l-actual"/><circle cx="${W}" cy="${y(pts[30])}" r="2.5" class="dot-actual"/></svg>`;
  }

  // ---------- Overview ----------
  const groupSum = (k) => r2(ACCOUNTS.filter((a) => a.group === k).reduce((x, a) => x + a.bal, 0));
  const netWorth = () => r2(ACCOUNTS.reduce((x, a) => x + a.bal, 0));
  const srcIcon = { sync: 'refresh', import: 'fill', manual: 'settings', warn: 'alert', stale: 'clock' };
  // Only problems show next to an account; details live in Einstellungen › Datenquellen.
  function srcProblem(a) {
    if (a.src.kind !== 'warn' && a.src.kind !== 'stale') return '';
    return `<a class="kproblem" href="einstellungen.html#datenquellen" title="${esc(a.src.text)}">${icon('alert', 'icon icon-xs')}<span class="sr-only">${esc(a.src.text)}</span></a>`;
  }
  function srcStamp(a) {
    const k = a.src.kind;
    return `<span class="kstamp is-${k}">${icon(srcIcon[k], 'icon icon-xs')}${esc(a.src.text)}</span>`;
  }
  function renderOverview() {
    const nw = netWorth();
    const terms = [
      { op: '', label: 'Budget-Konten', v: groupSum('budget'), key: 'budget' },
      { op: '+', label: 'Sparen', v: groupSum('save'), key: 'save' },
      { op: '+', label: 'Investment', v: groupSum('invest'), key: 'invest' },
      { op: MINUS, label: 'Schulden', v: -groupSum('debt'), key: 'debt' },
      { op: '+', label: 'Forderungen', v: groupSum('claim'), key: 'claim' },
      { op: '=', label: 'Nettovermögen', v: nw, result: true },
    ];
    const whole = (nw < 0 ? MINUS : '') + nf0.format(Math.trunc(Math.abs(nw)));
    const cents = nf2.format(Math.abs(nw)).split(',')[1];
    const warn = ACCOUNTS.filter((a) => a.src.kind === 'warn' || a.src.kind === 'stale');
    let html = `
      <section class="knw" aria-labelledby="nwTitle">
        <div class="tbd-head"><h2 id="nwTitle">Nettovermögen</h2><span class="tbd-state"><span class="ok">${icon('up', 'icon icon-sm')}+1.940 € zum Vormonat</span></span></div>
        <div class="tbd-fig">${whole}<span class="cents">,${cents} €</span></div>
        <div class="chain-inline" role="group" aria-label="Maßkette Nettovermögen">${terms.map((t) => {
          const inner = `<span class="ct-label tech">${t.label}</span><span class="ct-val">${eur(t.v)}</span>`;
          const body = t.key ? `<button class="ct-term" type="button" data-jumpgroup="${t.key}">${inner}</button>` : `<span class="ct-term is-result">${inner}</span>`;
          return `<span class="ct-pair">${t.op ? `<span class="ct-op" aria-hidden="true">${t.op}</span>` : ''}${body}</span>`;
        }).join('')}</div>
      </section>
      ${warn.length ? `<p class="knote">${icon('alert', 'icon icon-sm')}${warn.length} Datenquellen brauchen dich. Was synchronisiert wird, regelst du in <a href="einstellungen.html#datenquellen">Einstellungen › Datenquellen</a>.</p>` : ''}
      <section class="kaccts" aria-labelledby="acctTitle">
        <h2 class="sr-only" id="acctTitle">Konten nach Gruppe</h2>
        <table class="ktable">
          <caption class="sr-only">Konten mit Saldo, Verlauf 30 Tage und Datenquelle</caption>
          <thead><tr><th class="tech kc-pos" scope="col">Pos.</th><th class="tech" scope="col">Konto</th><th class="tech kc-line" scope="col">30 Tage</th><th class="tech kc-num" scope="col">Saldo</th></tr></thead>
          <tbody>`;
    GROUPS.forEach((g, gi) => {
      const items = ACCOUNTS.filter((a) => a.group === g.key);
      html += `<tr class="kgroup" id="kg-${g.key}"><td class="kc-pos"><span class="grp-no">${gi + 1}</span></td><td><span class="grp-title">${g.title}</span><span class="grp-sub">${g.sub}</span></td><td class="kc-line"></td><td class="kc-num">${eur(groupSum(g.key))}</td></tr>`;
      items.forEach((a, i) => {
        const util = a.limit ? `<span class="kutil"><span class="pbar" aria-hidden="true"><i class="pbar-fill hatch-need" style="width:${Math.min(1, -a.bal / a.limit) * 100}%"></i></span>${nf0.format((-a.bal / a.limit) * 100)} % von ${eur(a.limit, { cents: false })} Limit</span>` : '';
        html += `<tr class="krow" data-open-acct="${a.id}">
          <td class="kc-pos"><span class="pos">${gi + 1}.${i + 1}</span></td>
          <td><a class="kname" href="#konto/${a.id}">${esc(a.name)}</a>${srcProblem(a)}<span class="kmeta">${esc(a.inst)}</span>${util}</td>
          <td class="kc-line">${miniLine(a)}<span class="kdelta">${(() => { const p = series(a, 30); const d = r2(a.bal - p[0]); return Math.abs(d) < 0.5 ? '±0 €' : eur(d, { cents: false, sign: true }); })()}</span></td>
          <td class="kc-num${a.bal < 0 ? ' is-neg' : ''}">${eur(a.bal)}</td>
        </tr>`;
      });
    });
    html += `</tbody></table></section>`;
    $('#view').innerHTML = html;
  }

  // ---------- Single account ----------
  function acctTx(id) { return TX.filter((t) => t.acct === id).sort((a, b) => b.day - a.day); }
  function renderAccount(id) {
    const a = accById(id);
    if (!a) { location.hash = '#uebersicht'; return; }
    const list = acctTx(id);
    const pending = r2(list.filter((t) => t.st === 'vorgemerkt').reduce((x, t) => x + t.amt, 0));
    const sumMonth = r2(list.reduce((x, t) => x + t.amt, 0));
    let run = a.bal;
    const rows = list.map((t) => { const r = `<tr class="${t.st === 'vorgemerkt' ? 'is-pending' : ''}">
        <td class="kc-date">${String(t.day).padStart(2, '0')}.09.</td>
        <td><span class="kname-s">${esc(t.payee)}</span>${t.note ? `<span class="kmeta">${esc(t.note)}</span>` : ''}</td>
        <td>${catCell(t)}</td>
        <td>${statusCell(t)}</td>
        <td class="kc-num">${eur(t.amt, { sign: true })}</td>
        <td class="kc-num kc-run">${eur(run)}</td>
      </tr>`; run = r2(run - t.amt); return r; }).join('');
    $('#view').innerHTML = `
      <section class="kacct">
        <a class="kback" href="#uebersicht">${icon('chevron-left', 'icon icon-sm')}Übersicht</a>
        <div class="kacct-head">
          <div>
            <h2>${esc(a.name)}</h2>
            <p class="kmeta">${esc(a.inst)} · ${GROUPS.find((g) => g.key === a.group).title}${srcProblem(a)}</p>
          </div>
          ${a.group === 'budget' || a.group === 'save' ? `<button class="btn btn-primary" type="button" data-check="${a.id}">${icon('check-circle', 'icon icon-sm')}Kontostand prüfen</button>` : `<button class="btn btn-ghost" type="button" data-soon="Wert erfassen">Wert erfassen</button>`}
        </div>
        <div class="kfigs">
          <div class="fig"><small>Saldo</small><strong class="${a.bal < 0 ? 'neg' : ''}">${eur(a.bal)}</strong></div>
          <div class="fig"><small>davon vorgemerkt</small><strong class="muted">${eur(pending)}</strong></div>
          <div class="fig"><small>September</small><strong class="muted">${eur(sumMonth, { sign: true })}</strong></div>
          <div class="fig"><small>zuletzt geprüft</small><strong class="muted">${checkedUntil[a.id] || '—'}</strong></div>
        </div>
        <svg class="kchart" id="kchart" role="img" aria-label="Saldoverlauf 90 Tage"></svg>
        <div class="legend" aria-hidden="true">
          <span><svg viewBox="0 0 26 8"><path class="l-actual" d="M0 4h26"/></svg>Saldo</span>
          <span><svg viewBox="0 0 26 8"><path class="l-plan" d="M0 4h26"/></svg>0 € · ${a.type === 'Giro' ? 'darunter beginnt der Dispo' : 'Nulllinie'}</span>
        </div>
        <div class="head kh"><h2>Buchungen · September</h2><span class="aside">${list.length} ${list.length === 1 ? 'Buchung' : 'Buchungen'}</span></div>
        ${list.length ? `<table class="ktable ktx"><caption class="sr-only">Buchungen mit laufendem Saldo</caption>
          <thead><tr><th class="tech kc-date" scope="col">Datum</th><th class="tech" scope="col">Empfänger</th><th class="tech" scope="col">Kategorie</th><th class="tech" scope="col">Status</th><th class="tech kc-num" scope="col">Betrag</th><th class="tech kc-num" scope="col">Saldo</th></tr></thead>
          <tbody>${rows}</tbody></table>` : `<p class="rev-empty">${icon('check-circle')}Keine Buchungen im September. ${a.src.kind === 'stale' || a.src.kind === 'manual' ? 'Der Wert wird manuell gepflegt.' : ''}</p>`}
      </section>`;
    drawAcctChart(a);
  }
  function catCell(t) {
    if (!t.cat) return `<span class="kcat is-none">${icon('alert', 'icon icon-xs')}ohne Kategorie</span>`;
    return `<span class="kcat"><span class="sw hatch-${CLS[t.cat] || 'need'}" aria-hidden="true"></span>${esc(t.cat)}</span>`;
  }
  function statusCell(t) {
    const m = { vorgemerkt: ['clock', ''], bestätigt: ['check', 'ok'], geprüft: ['check-check', 'ok'] }[t.st];
    return `<span class="status ${m[1]}">${icon(m[0], 'icon')}${t.st}</span>`;
  }
  function drawAcctChart(a) {
    const svg = $('#kchart');
    const W = svg.clientWidth, H = svg.clientHeight;
    if (!W) return;
    const pts = series(a, 90);
    const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts);
    const pad = (hi - lo) * 0.12 || 100;
    const y0 = lo - (lo < 0 ? pad : 0), y1 = hi + pad;
    const L = 56, R = 12, T = 12, B = H - 24;
    const x = (i) => L + (i / 90) * (W - L - R);
    const y = (v) => B - ((v - y0) / (y1 - y0)) * (B - T);
    const step = Math.pow(10, Math.floor(Math.log10((y1 - y0) / 3)));
    for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) {
      s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'graticule' }, svg);
      const t = s('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'svg-label' }, svg); t.textContent = nf0.format(v);
    }
    s('line', { x1: L, x2: W - R, y1: y(0), y2: y(0), class: 'l-plan' }, svg);
    const from = new Date(TODAY.getTime() - 90 * DAY);
    [[6, 'Juli'], [7, 'August'], [8, 'September']].forEach(([m, label]) => { const first = new Date(2026, m, 1); const i = Math.round((first - from) / DAY); if (i < 0 || i > 90) return; s('line', { x1: x(i), x2: x(i), y1: B, y2: B + 4, class: 'axis' }, svg); const t = s('text', { x: x(i) + 4, y: H - 6, class: 'svg-label' }, svg); t.textContent = `1. ${label}`; });
    const p = s('path', { d: stepPath(pts, x, y), class: 'l-actual' }, svg);
    if (!reduceMotion) {
      const len = p.getTotalLength();
      p.style.strokeDasharray = len; p.style.setProperty('--len', len); p.classList.add('draw');
      p.addEventListener('animationend', () => { p.style.strokeDasharray = ''; p.classList.remove('draw'); }, { once: true });
    }
    s('circle', { cx: x(90), cy: y(pts[90]), r: 4, class: 'dot-actual' }, svg);
    // elevation mark at the lowest balance
    const mi = pts.indexOf(Math.min(...pts));
    // Mark the low only when it is a real dip inside the window, not the start of a rising series.
    if (mi <= 0 || mi >= 90) return;
    const lx = x(mi), ly = y(pts[mi]);
    const kg = s('g', { class: 'fade-in' }, svg);
    s('path', { d: `M${lx - 6},${ly + 13} L${lx + 6},${ly + 13} L${lx},${ly + 2} Z`, class: 'kote' }, kg);
    const kt = s('text', { x: lx + 10, y: ly + 22, class: 'svg-label-strong' }, kg);
    kt.textContent = `Tiefpunkt ${eur(pts[mi], { cents: false })}`;
  }

  // ---------- All bookings ----------
  function filtered() {
    const f = state.filter;
    const q = f.q.trim().toLowerCase();
    return TX.filter((t) => (!f.acct || t.acct === f.acct)
      && (!f.cat || (f.cat === '__none' ? !t.cat : t.cat === f.cat))
      && (!f.st || t.st === f.st)
      && (!q || `${t.payee} ${t.note} ${t.cat || ''}`.toLowerCase().includes(q)))
      .sort((a, b) => b.day - a.day);
  }
  function renderBookings() {
    const list = filtered();
    const sel = [...state.selected].filter((id) => list.some((t) => t.id === id));
    const sum = r2(list.reduce((x, t) => x + t.amt, 0));
    const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
    const f = state.filter;
    const byDay = [];
    list.forEach((t) => { const last = byDay[byDay.length - 1]; if (!last || last.day !== t.day) byDay.push({ day: t.day, items: [t] }); else last.items.push(t); });
    $('#view').innerHTML = `
      <section class="kbook">
        <div class="kfilter" role="search">
          <label class="search kf-search"><span class="sr-only">Buchungen durchsuchen</span>${icon('search')}<input id="fq" type="search" placeholder="Empfänger, Notiz, Kategorie" value="${esc(f.q)}" autocomplete="off"></label>
          <label class="kf"><span class="tech">Zeitraum</span><select class="select select-sm" disabled><option>September 2026</option></select></label>
          <label class="kf"><span class="tech">Konto</span><select class="select select-sm" id="facct">${opt('', 'Alle Konten', f.acct)}${ACCOUNTS.filter((a) => TX.some((t) => t.acct === a.id)).map((a) => opt(a.id, a.name, f.acct)).join('')}</select></label>
          <label class="kf"><span class="tech">Kategorie</span><select class="select select-sm" id="fcat">${opt('', 'Alle', f.cat)}${opt('__none', 'Ohne Kategorie', f.cat)}${CATEGORIES.map((c) => opt(c, c, f.cat)).join('')}</select></label>
          <label class="kf"><span class="tech">Status</span><select class="select select-sm" id="fst">${opt('', 'Alle', f.st)}${['vorgemerkt', 'bestätigt', 'geprüft'].map((c) => opt(c, c, f.st)).join('')}</select></label>
          <button class="btn btn-ghost btn-sm kf-csv" type="button" data-csv>${icon('fill', 'icon icon-sm')}CSV</button>
        </div>
        <div class="kbulk" ${sel.length ? '' : 'hidden'}>
          <strong>${sel.length} ausgewählt</strong>
          <label class="kf"><span class="sr-only">Kategorie setzen</span><select class="select select-sm" id="bulkCat"><option value="">Kategorie setzen …</option>${CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
          <button class="btn btn-ghost btn-sm" type="button" data-bulk-check>Als geprüft markieren</button>
          <button class="btn btn-ghost btn-sm" type="button" data-bulk-clear>Auswahl aufheben</button>
        </div>
        <p class="ksum">${list.length} Buchungen · Summe ${eur(sum, { sign: true })}</p>
        <table class="ktable ktx kall">
          <caption class="sr-only">Alle Buchungen im September</caption>
          <thead><tr><th class="kc-check" scope="col"><input type="checkbox" id="selAll" aria-label="Alle sichtbaren auswählen" ${sel.length && sel.length === list.length ? 'checked' : ''}></th><th class="tech" scope="col">Empfänger</th><th class="tech" scope="col">Konto</th><th class="tech" scope="col">Kategorie</th><th class="tech" scope="col">Status</th><th class="tech kc-num" scope="col">Betrag</th></tr></thead>
          <tbody>${byDay.map((g) => `<tr class="kday"><td colspan="6" class="kday-cell"><span class="tech">${String(g.day).padStart(2, '0')}.09.2026</span><span class="kday-sum">${eur(r2(g.items.reduce((x, t) => x + t.amt, 0)), { sign: true })}</span></td></tr>` + g.items.map((t) => `<tr class="${state.selected.has(t.id) ? 'is-selected' : ''}${t.st === 'vorgemerkt' ? ' is-pending' : ''}">
            <td class="kc-check"><input type="checkbox" data-sel="${t.id}" aria-label="${esc(t.payee)} ${eur(t.amt)} auswählen" ${state.selected.has(t.id) ? 'checked' : ''}></td>
            <td><span class="kname-s">${esc(t.payee)}</span>${t.note ? `<span class="kmeta">${esc(t.note)}</span>` : ''}</td>
            <td class="kc-acct">${esc(accById(t.acct).name)}</td>
            <td>${catCell(t)}</td>
            <td>${statusCell(t)}</td>
            <td class="kc-num">${eur(t.amt, { sign: true })}</td></tr>`).join('')).join('') || `<tr><td colspan="6" class="rev-empty">Keine Buchung passt zu diesen Filtern.</td></tr>`}</tbody>
        </table>
      </section>`;
    const fq = $('#fq');
    fq.addEventListener('input', () => { state.filter.q = fq.value; const pos = fq.selectionStart; renderBookings(); const n = $('#fq'); n.focus(); n.setSelectionRange(pos, pos); });
    [['#facct', 'acct'], ['#fcat', 'cat'], ['#fst', 'st']].forEach(([sel2, k]) => $(sel2).addEventListener('change', (e) => { state.filter[k] = e.target.value; renderBookings(); }));
    const bc = $('#bulkCat');
    if (bc) bc.addEventListener('change', () => {
      if (!bc.value) return;
      const ids = [...state.selected];
      change(`${ids.length} Buchungen → ${bc.value}`, () => { ids.forEach((id) => { txById(id).cat = bc.value; }); state.inbox = state.inbox.filter((i) => !(i.type === 'uncat' && ids.includes(i.tx))); state.selected.clear(); });
    });
  }
  function csv() {
    const rows = [['Datum', 'Konto', 'Empfänger', 'Kategorie', 'Notiz', 'Status', 'Betrag']].concat(filtered().map((t) => [`2026-09-${String(t.day).padStart(2, '0')}`, accById(t.acct).name, t.payee, t.cat || '', t.note, t.st, nf2.format(t.amt)]));
    const text = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'buchungen-2026-09-beispiel.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('CSV mit Beispieldaten erstellt.');
  }

  // ---------- Inbox ----------
  const INBOX_GROUPS = [
    { type: 'over', title: 'Überziehung', sub: 'im Plan decken' },
    { type: 'uncat', title: 'Ohne Kategorie', sub: 'Vorschlag aus Empfänger und Verlauf' },
    { type: 'transfer', title: 'Mögliche Umbuchung', sub: 'zwei Buchungen, gleicher Betrag' },
    { type: 'version', title: 'Erwartete Zahlung weicht ab', sub: 'neue Version ab einem Monat' },
    { type: 'stale', title: 'Veralteter Wert', sub: 'manuell gepflegte Konten' },
    { type: 'consent', title: 'Bank-Einwilligung', sub: 'alle 180 Tage erneuern' },
  ];
  function inboxRow(item, letter) {
    const tri = `<svg class="rev-tri" viewBox="0 0 26 24" aria-hidden="true"><path d="M13 2.5 24 21.5H2Z"/><text x="13" y="18" text-anchor="middle">${letter}</text></svg>`;
    let what = '', act = '';
    if (item.type === 'uncat') {
      const t = txById(item.tx);
      what = `<strong>${esc(t.payee)} · ${eur(t.amt)}</strong><span>${String(t.day).padStart(2, '0')}.09. · ${esc(accById(t.acct).name)} · Vorschlag: <span class="kcat"><span class="sw hatch-${CLS[item.sug]}"></span>${esc(item.sug)}</span></span>`;
      act = `<button class="btn btn-ghost btn-sm" type="button" data-accept="${item.id}">Übernehmen</button><button class="btn btn-ghost btn-sm" type="button" data-rule="${item.id}">Immer so zuordnen</button>`;
    } else if (item.type === 'transfer') {
      const o = txById(item.out), i = txById(item.in);
      what = `<strong>${esc(accById(o.acct).name)} ${eur(o.amt)} ⇢ ${esc(accById(i.acct).name)} ${eur(i.amt, { sign: true })}</strong><span>${String(o.day).padStart(2, '0')}.09. · wird budgetneutral, wenn bestätigt</span>`;
      act = `<button class="btn btn-ghost btn-sm" type="button" data-transfer="${item.id}">Als Umbuchung bestätigen</button><button class="btn btn-ghost btn-sm" type="button" data-dismiss="${item.id}">Keine Umbuchung</button>`;
    } else if (item.type === 'version') {
      what = `<strong>${esc(item.title)}</strong><span>${esc(item.sub)}</span>`;
      act = `<button class="btn btn-ghost btn-sm" type="button" data-version="${item.id}">Ab Oktober übernehmen</button><button class="btn btn-ghost btn-sm" type="button" data-dismiss="${item.id}">Ignorieren</button>`;
    } else if (item.type === 'stale') {
      const a = accById(item.acct);
      what = `<strong>${esc(a.name)}: Wert seit 34 Tagen nicht aktualisiert</strong><span>zuletzt ${eur(a.bal)} · manuell</span>`;
      act = `<label class="sr-only" for="stale-${item.id}">Neuer Wert</label><input class="input input-sm" id="stale-${item.id}" inputmode="decimal" value="${nf2.format(a.bal)}"><button class="btn btn-ghost btn-sm" type="button" data-stale="${item.id}">Speichern</button>`;
    } else if (item.type === 'consent') {
      const a = accById(item.acct);
      what = `<strong>${esc(a.inst)} · ${esc(a.name)}: Einwilligung läuft in 12 Tagen ab</strong><span>danach kein automatischer Abruf mehr</span>`;
      act = `<button class="btn btn-ghost btn-sm" type="button" data-consent="${item.id}">Neu verbinden</button>`;
    } else if (item.type === 'over') {
      what = `<strong>${esc(item.title)}</strong><span>${esc(item.sub)}</span>`;
      act = `<a class="btn btn-alert btn-sm" href="plan.html">Im Plan decken</a>`;
    }
    return `<tr class="rev-row${item.type === 'over' ? ' is-urgent' : ''}" data-inbox-row="${item.id}"><td class="rev-mark">${tri}</td><td class="rev-what">${what}</td><td class="rev-act kact">${act}</td></tr>`;
  }
  function renderInbox() {
    let n = 0;
    const blocks = INBOX_GROUPS.map((g, gi) => {
      const items = state.inbox.filter((i) => i.type === g.type);
      if (!items.length) return '';
      return `<tr class="kgroup"><td class="kc-pos"><span class="grp-no">${gi + 1}</span></td><td colspan="2"><span class="grp-title">${g.title}</span><span class="grp-sub">${g.sub}</span><span class="kgcount">${items.length}</span>${g.type === 'uncat' && items.length > 1 ? `<button class="btn btn-ghost btn-xs" type="button" data-accept-all>Alle ${items.length} übernehmen</button>` : ''}</td></tr>` +
        items.map((i) => inboxRow(i, String.fromCharCode(65 + n++))).join('');
    }).join('');
    $('#view').innerHTML = `<section class="kinbox">
      <div class="head"><h2>Posteingang</h2><span class="aside">${state.inbox.length ? `${state.inbox.length} offen · etwa ${Math.max(1, Math.round(state.inbox.length * 0.7))} Minuten` : ''}</span></div>
      ${state.inbox.length ? `<table class="rev-table kinbox-table"><caption class="sr-only">Offene Entscheidungen nach Typ</caption><thead><tr><th class="tech" scope="col">Rev.</th><th class="tech" scope="col">Änderung</th><th class="tech" scope="col" style="text-align:right">Aktion</th></tr></thead><tbody>${blocks}</tbody></table>` : `<div class="rev-empty">${icon('check-circle')}<div><strong>Posteingang leer.</strong><br>Alles entschieden, bis zum nächsten Bank-Abruf.</div></div>`}
    </section>`;
  }
  function removeInbox(id) { state.inbox = state.inbox.filter((i) => i.id !== id); }

  // ---------- Kontostand prüfen (panel) ----------
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
  function closePanel() {
    $('#panel').classList.remove('is-open');
    $('#scrim').classList.remove('is-open');
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  $('#scrim').addEventListener('click', closePanel);
  $$('[data-close]').forEach((b) => b.addEventListener('click', closePanel));
  // Same rules as the booking field: German thousands, comma decimals, + − × ÷, no eval.
  function parseAmount(raw) {
    const expr = raw.replace(/\s|€/g, '').replace(/[×xX]/g, '*').replace(/[÷:]/g, '/').replace(/[−–]/g, '-')
      .replace(/\d[\d.,]*/g, (n) => (n.includes(',') ? n.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(n) ? n.replace(/\./g, '') : n))
      .replace(/[+\-*/]+$/, '');
    if (!expr || /[^\d.+\-*/]/.test(expr)) return NaN;
    const neg = expr.startsWith('-');
    const toks = expr.replace(/^[+-]/, '').match(/\d+(?:\.\d*)?|\.\d+|[+\-*/]/g);
    if (!toks || toks.length % 2 === 0) return NaN;
    const vals = [parseFloat(toks[0]) * (neg ? -1 : 1)], ops = [];
    for (let k = 1; k < toks.length; k += 2) {
      const op = toks[k], n = parseFloat(toks[k + 1]);
      if (op === '*') vals.push(vals.pop() * n); else if (op === '/') vals.push(n === 0 ? NaN : vals.pop() / n); else { ops.push(op); vals.push(n); }
    }
    let res = vals[0];
    ops.forEach((op, k) => { res = op === '+' ? res + vals[k + 1] : res - vals[k + 1]; });
    return r2(res);
  }
  // Which booking explains a difference? diff = bank − app (booked).
  // diff < 0: app too high → an expense is missing, or an income is in the app twice.
  // diff > 0: app too low  → an income is missing, or an expense is in the app twice.
  function explain(list, diff) {
    const want = r2(-diff); // a duplicate with this amount would explain the difference
    const seen = new Map();
    for (const t of list.filter((x) => x.st !== 'vorgemerkt')) {
      const k = `${t.day}|${t.payee}|${t.amt}`;
      if (seen.has(k) && Math.abs(t.amt - want) < 0.005) return { kind: 'dup', tx: t };
      seen.set(k, t);
    }
    return { kind: 'missing', type: diff < 0 ? 'Ausgabe' : 'Einnahme', amount: Math.abs(diff) };
  }
  function openCheck(id) {
    const a = accById(id);
    const render = () => {
      const list = acctTx(id);
      const pending = r2(list.filter((t) => t.st === 'vorgemerkt').reduce((x, t) => x + t.amt, 0));
      const appBooked = r2(a.bal - pending);
      const toCheck = list.filter((t) => t.st === 'bestätigt').length;
      const bankDefault = bankBooked[id] ?? appBooked;
      openPanel(`Kontostand prüfen · ${a.name}`, `
        <p class="panel-sub">Vergleicht den gebuchten App-Saldo mit dem Saldo laut Bank. Stimmt beides überein, werden ${toCheck} bestätigte Buchungen als geprüft festgeschrieben. Vorgemerkte Buchungen zählen nicht.</p>
        <div class="kv" style="border-top:0"><span class="tech">Posten</span><span class="tech">Betrag</span></div>
        <div class="kv"><span>App-Saldo inkl. vorgemerkt</span><span>${eur(a.bal)}</span></div>
        <div class="kv"><span>vorgemerkt herausgerechnet</span><span>${eur(-pending, { sign: true })}</span></div>
        <div class="kv" style="border-top:1.5px solid var(--line)"><span style="color:var(--ink);font-weight:600">= App-Saldo gebucht</span><span>${eur(appBooked)}</span></div>
        <div class="field-row" style="margin-top:18px"><label for="bankBal">Saldo laut Bank</label>
          <input class="input" id="bankBal" inputmode="decimal" value="${nf2.format(bankDefault)}">
          <span class="amount-hint">${bankBooked[id] !== undefined ? 'vorausgefüllt aus dem Bank-Sync heute 06:30, änderbar; Rechnen erlaubt' : 'aus dem Kontoauszug abschreiben; Rechnen erlaubt'}</span></div>
        <div class="kdiff" id="kdiff" aria-live="polite"></div>
        <div class="panel-actions" id="checkActions"></div>
      `, (body) => {
        const inp = $('#bankBal', body), out = $('#kdiff', body), acts = $('#checkActions', body);
        const upd = () => {
          const bank = parseAmount(inp.value);
          if (!isFinite(bank)) { out.className = 'kdiff is-bad'; out.textContent = 'Bitte den Saldo laut Bank eingeben.'; acts.innerHTML = ''; return; }
          const diff = r2(bank - appBooked);
          if (Math.abs(diff) < 0.005) {
            out.className = 'kdiff is-ok';
            out.innerHTML = `${icon('check-circle', 'icon icon-sm')}Differenz 0,00 € · stimmt überein`;
            acts.innerHTML = `<button class="btn btn-primary" type="button" data-commit>Festschreiben</button>`;
            return;
          }
          const ex = explain(list, diff);
          out.className = 'kdiff is-bad';
          if (ex.kind === 'dup') {
            const t = ex.tx;
            out.innerHTML = `${icon('alert', 'icon icon-sm')}<span><strong>Doppelt:</strong> ${esc(t.payee)} ${eur(t.amt)} am ${String(t.day).padStart(2, '0')}.09. steht zweimal in der App, die Bank kennt sie einmal. Differenz ${eur(diff, { sign: true })}.</span>`;
            acts.innerHTML = `<button class="btn btn-primary" type="button" data-drop="${t.id}">Doppelte Buchung entfernen</button><button class="btn btn-ghost" type="button" data-balance="${diff}">Differenz ausgleichen</button>`;
          } else {
            out.innerHTML = `${icon('alert', 'icon icon-sm')}<span><strong>Es fehlt eine ${ex.type}</strong> über ${eur(ex.amount)}: Die Bank meldet ${eur(Math.abs(diff))} ${diff < 0 ? 'weniger' : 'mehr'} als die App. Keine doppelte Buchung passt zu diesem Betrag.</span>`;
            acts.innerHTML = `<button class="btn btn-primary" type="button" data-balance="${diff}">Differenz ausgleichen · ${eur(diff, { sign: true })}</button><a class="btn btn-ghost" href="#buchungen">In Buchungen suchen</a>`;
          }
        };
        inp.addEventListener('input', upd);
        upd();
        const commit = (label, fn) => { closePanel(); change(label, () => { if (fn) fn(); acctTx(id).forEach((t) => { if (t.st === 'bestätigt') t.st = 'geprüft'; }); checkedUntil[id] = '17.09.'; }); };
        acts.addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.hasAttribute('data-commit')) commit(`${a.name}: Kontostand geprüft und festgeschrieben`);
          if (b.dataset.drop) {
            const t = txById(b.dataset.drop);
            change(`${t.payee} ${eur(t.amt)}: doppelte Buchung entfernt`, () => { TX.splice(TX.indexOf(t), 1); a.bal = r2(a.bal - t.amt); });
            render();
          }
          if (b.dataset.balance) {
            const d = r2(parseFloat(b.dataset.balance));
            commit(`${a.name}: Ausgleichsbuchung ${eur(d, { sign: true })} gebucht und festgeschrieben`, () => {
              TX.push({ id: `t${++seq}`, day: 17, acct: id, payee: 'Kontostand-Ausgleich', cat: 'Zu verteilen', amt: d, st: 'bestätigt', note: `Differenz zum Bank-Saldo, ${new Date(2026, 8, 17).toLocaleDateString('de-AT')}` });
              a.bal = r2(a.bal + d);
            });
          }
        });
      });
    };
    render();
  }

  // ---------- Routing ----------
  function route() {
    const h = location.hash || '#uebersicht';
    let reg = 'uebersicht';
    if (h.startsWith('#konto/')) { reg = 'uebersicht'; renderAccount(h.slice(7)); }
    else if (h === '#buchungen') { reg = 'buchungen'; renderBookings(); }
    else if (h === '#posteingang') { reg = 'posteingang'; renderInbox(); }
    else renderOverview();
    $$('[data-reg]').forEach((a) => { if (a.dataset.reg === reg) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const n = state.inbox.length;
    $$('[data-inbox-count]').forEach((el) => { el.textContent = n; el.hidden = n === 0; });
    $$('[data-inbox-label]').forEach((el) => el.setAttribute('aria-label', `Posteingang, ${n} offen`));
    const syncWarn = ACCOUNTS.filter((a) => a.src.kind === 'warn').length;
    $('#syncState').innerHTML = `${icon(syncWarn ? 'alert' : 'refresh', 'icon icon-sm')}${syncWarn ? `${syncWarn} Einwilligung läuft ab` : 'alle verbunden'}`;
  }
  window.addEventListener('hashchange', () => { closePanel(); route(); window.scrollTo({ top: 0, behavior: 'auto' }); });

  // ---------- Events ----------
  document.addEventListener('click', (e) => {
    const q = (sel) => e.target.closest(sel);
    let el;
    if ((el = q('[data-check]'))) { openCheck(el.dataset.check); return; }
    if ((el = q('tr[data-open-acct]')) && !q('a')) { location.hash = `#konto/${el.dataset.openAcct}`; return; }
    if ((el = q('[data-jumpgroup]'))) { const row = $(`#kg-${el.dataset.jumpgroup}`); if (row) { row.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); row.classList.add('is-flash'); setTimeout(() => row.classList.remove('is-flash'), 900); } return; }
    if (q('[data-csv]')) { csv(); return; }
    if (q('[data-bulk-clear]')) { state.selected.clear(); renderBookings(); return; }
    if (q('[data-bulk-check]')) { const ids = [...state.selected]; change(`${ids.length} Buchungen als geprüft markiert`, () => { ids.forEach((id) => { const t = txById(id); if (t.st !== 'vorgemerkt') t.st = 'geprüft'; }); state.selected.clear(); }); return; }
    if ((el = q('[data-accept]'))) { const it = state.inbox.find((i) => i.id === el.dataset.accept); const t = txById(it.tx); change(`${t.payee} → ${it.sug}`, () => { t.cat = it.sug; removeInbox(it.id); }); return; }
    if ((el = q('[data-rule]'))) { const it = state.inbox.find((i) => i.id === el.dataset.rule); const t = txById(it.tx); change(`Regel angelegt: ${t.payee} → ${it.sug}. Gilt ab jetzt für neue Buchungen.`, () => { t.cat = it.sug; removeInbox(it.id); }); return; }
    if (q('[data-accept-all]')) { const items = state.inbox.filter((i) => i.type === 'uncat'); change(`${items.length} Buchungen zugeordnet`, () => { items.forEach((it) => { txById(it.tx).cat = it.sug; removeInbox(it.id); }); }); return; }
    if ((el = q('[data-transfer]'))) { const it = state.inbox.find((i) => i.id === el.dataset.transfer); change('Als Umbuchung bestätigt, budgetneutral', () => { txById(it.out).cat = 'Umbuchung'; txById(it.in).cat = 'Umbuchung'; removeInbox(it.id); }); return; }
    if ((el = q('[data-version]'))) { const id = el.dataset.version; change('Strom: 118,00 € ab Oktober als neue Version gespeichert', () => removeInbox(id)); return; }
    if ((el = q('[data-dismiss]'))) { const id = el.dataset.dismiss; change('Erledigt, ohne Änderung', () => removeInbox(id)); return; }
    if ((el = q('[data-stale]'))) {
      const it = state.inbox.find((i) => i.id === el.dataset.stale);
      const v = parseAmount($(`#stale-${it.id}`).value);
      if (!isFinite(v) || v < 0) { toast('Bitte einen Betrag eingeben, z. B. 4.230,00.'); return; }
      change(`${accById(it.acct).name}: Wert ${eur(v)} gespeichert`, () => { accById(it.acct).bal = v; accById(it.acct).src = { kind: 'manual', text: 'manuell · heute' }; removeInbox(it.id); });
      return;
    }
    if (q('[data-consent]')) { toast('Die Freigabe bei der Bank (PSD2) kannst nur du selbst erteilen. Im echten Produkt öffnet sich hier die Bank.'); return; }
    if (q('[data-open-booking]')) { location.href = 'index.html#buchung'; return; }
    if (q('[data-open="inbox"]')) { location.hash = '#posteingang'; return; }
    if ((el = q('[data-soon]'))) { e.preventDefault(); toast(`„${el.dataset.soon}“ ist im Prototyp noch nicht gebaut.`); }
  });
  document.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-sel]');
    if (cb) { cb.checked ? state.selected.add(cb.dataset.sel) : state.selected.delete(cb.dataset.sel); renderBookings(); return; }
    if (e.target.id === 'selAll') { const list = filtered(); if (e.target.checked) list.forEach((t) => state.selected.add(t.id)); else state.selected.clear(); renderBookings(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#panel').classList.contains('is-open')) closePanel();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#search').focus(); }
    const row = e.target.closest && e.target.closest('tr[data-open-acct]');
    if (row && e.key === 'Enter' && e.target === row) location.hash = `#konto/${row.dataset.openAcct}`;
  });
  $('#search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { state.filter.q = e.target.value; location.hash = '#buchungen'; route(); } });

  // ---------- Theme + collapse (mirrors app.js) ----------
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

  // Narrow screens: keep the active register and view in view so their badges are never cut.
  const keepActiveVisible = () => { $$('.registers [aria-current="page"], .ptoolbar .seg [aria-pressed="true"]').forEach((el) => el.scrollIntoView({ block: 'nearest', inline: 'nearest' })); };
  window.addEventListener('hashchange', keepActiveVisible);
  document.addEventListener('click', (e) => { if (e.target.closest('[data-view]')) setTimeout(keepActiveVisible, 0); });
  route();
  keepActiveVisible();
})();
