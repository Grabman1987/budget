/* Finanz-App prototype · Reports: shared sample ledger and chart primitives.
   One data model for all reports so their figures agree. Sample data only.
   Helpers mirror the other pages; unify them in the React build. */
(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
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
  const pct = (v, sign = false, digits = 1) => {
    const f = digits === 0 ? nf0 : nf1;
    return `${v < -0.0004 ? MINUS : sign && v > 0.0004 ? '+' : ''}${f.format(Math.abs(v) * 100)} %`;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const MONTHS = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const MONTHS_LONG = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const CLASS_LABEL = { need: 'Bedarf', want: 'Wunsch', future: 'Zukunft' };

  let seed = 20231001;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const noise = (amp) => 1 + (rnd() - 0.5) * 2 * amp;

  // ---------- Months: Oct 2023 … Sep 2026 (September runs to the 17th) ----------
  const MONTHS_ALL = [];
  for (let k = 0; k < 36; k++) {
    const m = (9 + k) % 12, y = 2023 + Math.floor((9 + k) / 12);
    MONTHS_ALL.push({ k, y, m, key: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${MONTHS[m]} ${String(y).slice(2)}`, long: `${MONTHS_LONG[m]} ${y}`, partial: k === 35 });
  }
  const idx = (y, m) => MONTHS_ALL.findIndex((x) => x.y === y && x.m === m);
  const kOfKey = (key) => { const i = MONTHS_ALL.findIndex((x) => x.key === key); return i < 0 ? 35 : i; };
  // EUR per USD at the booking date (ECB reference rate, sample path)
  const FX = MONTHS_ALL.map((mo) => Math.round((0.935 - 0.0021 * mo.k + 0.014 * Math.sin(mo.k / 3.2)) * 10000) / 10000);
  const fxAt = (key) => FX[kOfKey(key)];
  const LAST_FULL = 34; // August 2026

  // ---------- Categories ----------
  // price: [[fromKey, amount], …] for fixed costs; base/trend/season for variable ones; events for periodic ones
  const C = (id, name, cls, group, kind, extra) => ({ id, name, cls, group, kind, ...extra });
  const CATS = [
    C('miete', 'Miete', 'need', 'Wohnen', 'fix', { price: [['2023-10', 850], ['2025-01', 890]], payee: 'Hausverwaltung', due: 1 }),
    C('strom', 'Strom', 'need', 'Wohnen', 'fix', { price: [['2023-10', 88], ['2025-01', 95], ['2026-01', 105]], payee: 'Energieversorger', due: 25 }),
    C('internet', 'Internet', 'need', 'Wohnen', 'fix', { price: [['2023-10', 55], ['2025-07', 60]], payee: 'Internetanbieter', due: 15 }),
    C('bankspesen', 'Kontoführung', 'need', 'Bank und Gebühren', 'fix', { price: [['2023-10', 6.5], ['2025-04', 6.9]], payee: 'Bank A', due: 30 }),
    C('kreditrate', 'Kreditrate', 'need', 'Kredite', 'fix', { price: [['2023-10', 412]], payee: 'Bank F', due: 3 }),
    C('kfzvers', 'Kfz-Versicherung', 'need', 'Versicherungen', 'fix', { price: [['2023-10', 44], ['2025-01', 46], ['2026-01', 48]], payee: 'Versicherung G', due: 10 }),
    C('unfallvers', 'Unfallversicherung', 'need', 'Versicherungen', 'fix', { price: [['2023-10', 26], ['2025-01', 28]], payee: 'Versicherung G', due: 10 }),
    C('mobilfunk', 'Mobilfunk', 'need', 'Abos', 'fix', { price: [['2023-10', 25]], payee: 'Mobilfunkanbieter', due: 22 }),
    C('streaming', 'Streaming', 'want', 'Abos', 'fix', { price: [['2023-10', 15.99], ['2025-03', 17.99]], payee: 'Streamingdienst', due: 20 }),
    C('fitness', 'Fitnessstudio', 'want', 'Freizeit', 'fix', { price: [['2023-10', 39], ['2026-02', 42]], payee: 'Fitnessstudio', due: 1 }),
    C('cloud', 'Cloud-Speicher', 'want', 'Abos', 'fix', { price: [['2023-10', 2.99]], payee: 'Cloudanbieter', due: 12 }),
    C('zeitung', 'Zeitung digital', 'want', 'Abos', 'fix', { price: [['2025-05', 12.9]], payee: 'Verlag', due: 5 }),
    C('ki1', 'KI-Assistent', 'want', 'Abos', 'fix', { usd: [['2024-06', 20]], payee: 'KI-Anbieter A', due: 8 }),
    C('ki2', 'KI-Bildtool', 'want', 'Abos', 'fix', { usd: [['2025-09', 10]], payee: 'KI-Anbieter B', due: 14 }),
    C('projektkosten', 'Projektkosten', 'need', 'Projekte', 'project', { payee: 'diverse' }),
    C('lebensmittel', 'Lebensmittel', 'need', 'Lebensmittel', 'var', { base: 640, trend: 0.08, amp: 0.1, payees: [['Supermarkt', 0.62], ['Diskonter', 0.24], ['Bäckerei', 0.08], ['Markt', 0.06]] }),
    C('treibstoff', 'Treibstoff', 'need', 'Mobilität', 'var', { base: 142, trend: -0.03, amp: 0.15, payees: [['Tankstelle', 1]] }),
    C('oeffis', 'Öffis', 'need', 'Mobilität', 'var', { base: 55, trend: 0.03, amp: 0.2, payees: [['Verkehrsbetrieb', 1]] }),
    C('haushalt', 'Haushalt', 'need', 'Wohnen', 'var', { base: 140, trend: 0.04, amp: 0.3, payees: [['Drogerie', 0.6], ['Online-Händler', 0.4]] }),
    C('gesundheit', 'Gesundheit', 'need', 'Gesundheit', 'var', { base: 58, trend: 0.03, amp: 0.5, payees: [['Apotheke', 0.7], ['Ärztin', 0.3]] }),
    C('kleidung', 'Kleidung', 'need', 'Kleidung', 'var', { base: 58, trend: 0.02, amp: 0.4, season: { 2: 1.8, 9: 1.7, 11: 1.4, 6: 0.5 }, payees: [['Bekleidungsgeschäft', 0.7], ['Online-Händler', 0.3]] }),
    C('lieferdienste', 'Lieferdienste', 'want', 'Genuss', 'var', { base: 100, trend: 0.06, amp: 0.3, season: { 0: 1.3, 1: 1.2, 10: 1.2, 11: 1.3, 6: 0.7 }, payees: [['Lieferdienst', 1]] }),
    C('freizeit', 'Freizeit', 'want', 'Freizeit', 'var', { base: 210, trend: 0.04, amp: 0.3, season: { 5: 1.3, 6: 1.5, 7: 1.4, 0: 0.7 }, payees: [['Kino', 0.35], ['Freizeitpark', 0.25], ['Konzertkassa', 0.4]] }),
    C('essen', 'Essen gehen', 'want', 'Genuss', 'var', { base: 260, trend: 0.05, amp: 0.25, season: { 11: 1.4, 6: 1.2 }, payees: [['Restaurant', 0.75], ['Café', 0.25]] }),
    C('anschaffungen', 'Anschaffungen', 'want', 'Anschaffungen', 'var', { base: 240, trend: 0.03, amp: 0.8, season: { 10: 1.6, 11: 1.3 }, payees: [['Elektronikmarkt', 0.45], ['Möbelhaus', 0.2], ['Online-Händler', 0.35]] }),
    C('pflege', 'Friseur und Pflege', 'want', 'Pflege', 'var', { base: 70, trend: 0.04, amp: 0.4, payees: [['Friseur', 0.6], ['Parfümerie', 0.4]] }),
    C('hobby', 'Hobby', 'want', 'Freizeit', 'var', { base: 90, trend: 0.02, amp: 0.6, payees: [['Buchhandlung', 0.5], ['Online-Händler', 0.5]] }),
    C('hhvers', 'Haushaltsversicherung', 'need', 'Versicherungen', 'periodic', { events: [[0, 452], [0, 486, 2026]], payee: 'Versicherung G' }),
    C('kfzservice', 'Kfz-Service', 'need', 'Mobilität', 'periodic', { events: [[2, 540], [2, 580, 2026]], payee: 'Werkstatt' }),
    C('weihnachten', 'Weihnachten', 'want', 'Geschenke', 'periodic', { events: [[11, 800]], payee: 'Online-Händler' }),
    C('reisen', 'Reisen', 'want', 'Reisen', 'periodic', { events: [[7, 3000], [1, 1400], [4, 600]], payee: 'Reisebüro' }),
    C('geschenke', 'Geschenke', 'want', 'Geschenke', 'periodic', { events: [[3, 90], [6, 120], [9, 100]], payee: 'Online-Händler' }),
    C('investieren', 'Investieren (ETF-Sparplan)', 'future', 'Investieren', 'fix', { price: [['2023-10', 300], ['2024-01', 400]], payee: 'Depot · ETF', due: 5, transfer: true }),
    C('notgroschen', 'Notgroschen', 'future', 'Notgroschen', 'fix', { price: [['2023-10', 250], ['2025-01', 300]], payee: 'Tagesgeld', due: 16, transfer: true }),
    C('sondertilgung', 'Sondertilgung', 'future', 'Kredite', 'fix', { price: [['2026-06', 300]], payee: 'Bank F', due: 3, transfer: true }),
  ];
  const catById = (id) => CATS.find((c) => c.id === id);
  const usdAt = (c, key) => { let v = 0; for (const [from, amt] of c.usd || []) if (key >= from) v = amt; return v; };
  const priceAt = (c, key) => {
    if (c.usd) return Math.round(usdAt(c, key) * fxAt(key) * 100) / 100;
    let v = 0; for (const [from, amt] of c.price || []) if (key >= from) v = amt; return v;
  };

  // side projects: income and costs per month (neutral sample names)
  const PROJECTS = [
    { id: 'trading', name: 'Trading', note: 'realisierte Gewinne; Verluste und Datenabo als Kosten' },
    { id: 'kurse', name: 'Kurse und Coaching', note: 'Kursverkäufe und Sitzungen; Plattform als Kosten' },
    { id: 'orgel', name: 'Orgel', note: 'Orgeldienste; Noten als Kosten' },
  ];
  const PROJ = MONTHS_ALL.map((mo) => {
    const k = mo.k, part = mo.partial ? 17 / 30 : 1;
    const swing = Math.sin(k * 1.9) * 220 + Math.cos(k * 0.7) * 90;
    const trading = { inc: Math.max(0, swing - 20) * 0.7 * part, cost: (Math.max(0, -(swing - 20)) * 0.7 + 29) * part };
    const kurse = mo.key >= '2025-03' ? { inc: (k % 3 === 0 ? 360 : k % 3 === 1 ? 120 : 0) * part, cost: 39 * part } : { inc: 0, cost: 0 };
    const orgel = { inc: ((mo.m === 11 ? 5 : mo.m === 3 ? 4 : 3) * 45) * part, cost: ((k % 4 === 1 ? 78 : 18) + (mo.m === 10 ? 64 : 0)) * part };
    const row = { trading, kurse, orgel };
    Object.values(row).forEach((p) => { p.inc = Math.round(p.inc * 100) / 100; p.cost = Math.round(p.cost * 100) / 100; });
    return row;
  });
  let RC_R01 = '';
  const salaryAtKey = (key) => ({ gross: key >= '2026-04' ? 5650 : key >= '2025-04' ? 5530 : key >= '2024-04' ? 5440 : 5280 });
  // spend[k][catId] = amount (positive = outflow)
  const SPEND = MONTHS_ALL.map((mo) => {
    const row = {};
    const frac = mo.partial ? 17 / 30 : 1;
    for (const c of CATS) {
      let v = 0;
      if (c.kind === 'fix') {
        v = priceAt(c, mo.key);
        if (mo.partial && c.due > 17) v = 0; // not due yet this month
      } else if (c.kind === 'var') {
        const yrs = mo.k / 12;
        v = c.base * Math.pow(1 + c.trend, yrs) * ((c.season && c.season[mo.m]) || 1) * noise(c.amp) * frac;
      } else if (c.kind === 'project') {
        v = PROJ[mo.k].trading.cost + PROJ[mo.k].kurse.cost + PROJ[mo.k].orgel.cost;
      } else if (c.kind === 'periodic') {
        for (const [m, amt, onlyYear] of c.events) if (m === mo.m && (!onlyYear || onlyYear === mo.y) && !(onlyYear === undefined && c.events.some((e) => e[0] === m && e[2] === mo.y))) v += amt * noise(0.05);
        if (mo.partial) v = 0;
      }
      row[c.id] = r2(v);
    }
    // R12 Windfall: of a special payment, 50 % into the ETF and 20 % into the emergency fund
    const sz = mo.m === 5 || mo.m === 10 ? salaryAtKey(mo.key).gross * 0.772 : 0;
    if (sz) { row.investieren = r2(row.investieren + sz * 0.5); row.notgroschen = r2(row.notgroschen + sz * 0.2); }
    // the known overspending of September: fuel
    if (mo.partial) { row.treibstoff = 152.4; row.lebensmittel = 388; row.lieferdienste = 62; row.freizeit = 56; row.essen = 121; row.haushalt = 35.5; row.kleidung = 30; row.hobby = 0; row.gesundheit = 0; row.oeffis = 0; }
    return row;
  });

  // ---------- Income ----------
  const INCOME_TYPES = ['Gehalt', 'Sonderzahlung', 'Beiträge von Kontakten', 'Nebeneinkünfte', 'Kapitalerträge', 'Erstattungen', 'Geschenke'];
  const SALARY = [ // gross, net per regular month; raises in April
    { from: '2023-10', gross: 5280, net: 3590 },
    { from: '2024-04', gross: 5440, net: 3690 },
    { from: '2025-04', gross: 5530, net: 3745 },
    { from: '2026-04', gross: 5650, net: 3812 },
  ];
  const salaryAt = (key) => { let s = SALARY[0]; for (const x of SALARY) if (key >= x.from) s = x; return s; };
  const INCOME = MONTHS_ALL.map((mo) => {
    const s = salaryAt(mo.key);
    const row = { Gehalt: mo.partial ? 0 : s.net, Sonderzahlung: 0, 'Beiträge von Kontakten': 0, Nebeneinkünfte: 0, Kapitalerträge: 0, Erstattungen: 0, Geschenke: 0 };
    row.Nebeneinkünfte = r2(PROJ[mo.k].trading.inc + PROJ[mo.k].kurse.inc + PROJ[mo.k].orgel.inc);
    if (mo.m === 5 || mo.m === 10) row.Sonderzahlung = r2(s.gross * 0.772);
    if (!mo.partial) row['Beiträge von Kontakten'] = mo.key >= '2025-01' ? 800 : 750;
    if ([2, 5, 8, 11].includes(mo.m)) row.Kapitalerträge = r2((150 + mo.k * 6) * noise(0.2));
    row.Kapitalerträge = r2(row.Kapitalerträge + (mo.key >= '2024-01' && mo.key < '2026-01' ? 22 : 12) * noise(0.2));
    if (mo.k % 5 === 2) row.Erstattungen = r2(60 + rnd() * 90);
    if (mo.m === 11) row.Geschenke = 200;
    if (mo.m === 6) row.Geschenke = 150;
    if (mo.partial) { row.Kapitalerträge = r2(row.Kapitalerträge); }
    return row;
  });
  // payroll detail (Gehaltsreport): SV 18,12 % of gross; income tax = rest; special payments taxed at 6 %
  const PAYROLL = MONTHS_ALL.filter((mo) => !mo.partial).map((mo) => {
    const s = salaryAt(mo.key);
    const sv = r2(s.gross * 0.1812);
    const lst = r2(s.gross - sv - s.net);
    const special = mo.m === 5 || mo.m === 10 ? { gross: s.gross, sv: r2(s.gross * 0.1712), lst: r2(s.gross * 0.06 - 0.6), net: INCOME[mo.k].Sonderzahlung } : null;
    return { k: mo.k, label: mo.label, gross: s.gross, sv, lst, net: s.net, special };
  });
  const VPI = { 2024: 0.029, 2025: 0.035, 2026: 0.022 }; // sample consumer price index changes

  // ---------- Totals ----------
  const sumObj = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const incomeOf = (k) => r2(sumObj(INCOME[k]));
  const spendOf = (k, filter = () => true) => r2(CATS.filter(filter).reduce((a, c) => a + SPEND[k][c.id], 0));
  const consumptionOf = (k) => spendOf(k, (c) => c.cls !== 'future');
  const classOf = (k, cls) => spendOf(k, (c) => c.cls === cls);
  const groupsList = [...new Set(CATS.map((c) => c.group))];
  const groupOf = (k, g) => spendOf(k, (c) => c.group === g);

  // ---------- Plan (budgeted) per category and month ----------
  // fixed: the price; variable: expected level rounded to 10 €; periodic: planned in the month it falls due
  const PLAN = MONTHS_ALL.map((mo) => {
    const row = {};
    CATS.forEach((c) => {
      if (c.kind === 'fix') row[c.id] = priceAt(c, mo.key);
      else if (c.kind === 'project') row[c.id] = 110;
      else if (c.kind === 'var') row[c.id] = Math.round((c.base * Math.pow(1 + c.trend, mo.k / 12) * ((c.season && c.season[mo.m]) || 1)) / 10) * 10;
      else row[c.id] = c.events.filter((e) => e[0] === mo.m && (!e[2] || e[2] === mo.y) && !(e[2] === undefined && c.events.some((x) => x[0] === e[0] && x[2] === mo.y))).reduce((a, e) => a + e[1], 0);
    });
    return row;
  });
  PLAN[35].lebensmittel = 540; PLAN[35].treibstoff = 140; // September: budget of the whole month

  // ---------- Loan history (backwards from today's balance) ----------
  const LOAN = { rate: 0.0632, pmt: 412, now: 12176 };
  const LOANH = []; // per month: balance at month end, interest, principal
  (function () {
    const i = LOAN.rate / 12;
    let b = LOAN.now;
    for (let k = 35; k >= 0; k--) {
      const pay = LOAN.pmt + (k >= 32 ? 300 : 0);
      const prev = (b + pay) / (1 + i);
      LOANH[k] = { end: r2(b), interest: r2(prev * i), principal: r2(pay - prev * i) };
      b = prev;
    }
  })();

  // ---------- Payees: split variable spend into payees and receipts ----------
  const TICKET = { Supermarkt: 42, Diskonter: 28, 'Bäckerei': 6.5, Markt: 18, Tankstelle: 58, Verkehrsbetrieb: 21, Drogerie: 19, 'Online-Händler': 36, Apotheke: 14, 'Ärztin': 45, 'Bekleidungsgeschäft': 55, Elektronikmarkt: 89, Friseur: 38, 'Parfümerie': 24, 'Möbelhaus': 140, Lieferdienst: 26, Kino: 26, Freizeitpark: 48, Konzertkassa: 65, Restaurant: 48, 'Café': 9, Buchhandlung: 22 };
  const PAYEE = MONTHS_ALL.map((mo) => {
    const row = {}; // name → { amt, n, cats:Set }
    const add = (name, amt, n, cat) => {
      if (amt <= 0) return;
      const p = row[name] || (row[name] = { amt: 0, n: 0, cats: new Set() });
      p.amt = r2(p.amt + amt); p.n += n; p.cats.add(cat);
    };
    CATS.forEach((c) => {
      const v = SPEND[mo.k][c.id];
      if (!v || c.transfer) return;
      if (c.kind === 'var') c.payees.forEach(([name, share]) => { const a = v * share; add(name, a, Math.max(1, Math.round(a / (TICKET[name] || 30))), c.name); });
      else add(c.payee, v, 1, c.name);
    });
    return row;
  });

  // ---------- Portfolio: products with their own price paths ----------
  // Today's values match Vermögen. Each product moves with the market path M (beta) plus its own drift and noise;
  // contributions come from the Investieren category. Values are computed backwards from today.
  const PRODUCTS = [
    { id: 'etfw', name: 'ETF Welt', cls: 'ETF', depot: 'Aktien und ETF', plat: 'Broker C', now: 68500, share: 0.792, beta: 1.0, alpha: 0, vol: 0.004, ter: 0.002, regions: { Nordamerika: 0.70, Europa: 0.15, 'Asien-Pazifik': 0.11, Schwellenländer: 0.04 }, bench: 'Weltindex' },
    { id: 'etfem', name: 'ETF Schwellenländer', cls: 'ETF', depot: 'Aktien und ETF', plat: 'Broker C', now: 7000, share: 0.15, beta: 0.8, alpha: -0.002, vol: 0.013, ter: 0.0018, regions: { Schwellenländer: 1 }, bench: 'Schwellenländerindex' },
    { id: 'akta', name: 'Einzelaktie A', cls: 'Aktien', depot: 'Aktien und ETF', plat: 'Broker C', now: 3950, share: 0.05, beta: 1.2, alpha: 0.002, vol: 0.035, ter: 0, regions: { Europa: 1 }, bench: 'Europaindex' },
    { id: 'btc', name: 'Bitcoin', cls: 'Krypto', depot: 'Krypto', plat: 'Plattform D', now: 3400, share: 0.005, beta: 1.0, alpha: 0.026, vol: 0.13, ter: 0, regions: { Global: 1 }, bench: 'Weltindex' },
    { id: 'eth', name: 'Ethereum', cls: 'Krypto', depot: 'Krypto', plat: 'Plattform D', now: 935, share: 0.003, beta: 2.0, alpha: -0.004, vol: 0.14, ter: 0, regions: { Global: 1 }, bench: 'Weltindex' },
    { id: 'p2p', name: 'P2P-Kredite', cls: 'P2P', depot: 'P2P', plat: 'Plattform E', now: 4215, share: 0, beta: 0, alpha: 0.0052, vol: 0.002, ter: 0, regions: { Europa: 1 }, bench: null },
  ];
  const M0 = MONTHS_ALL.map((mo) => (mo.partial ? 0.006 : Math.round(((((mo.k * 7919) % 97) / 97) * 0.058 - 0.0198) * 10000) / 10000));
  // product-specific noise: a seeded sequence per product, mean zero, standard deviation ≈ vol per month
  const NOISE = {};
  const idio = (p, k) => {
    if (!NOISE[p.id]) {
      let sd = [...p.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) % 233280;
      const u = () => { sd = (sd * 9301 + 49297) % 233280; return sd / 233280; };
      const xs = Array.from({ length: 36 }, () => (u() + u() + u() - 1.5) * 2);
      const m = xs.reduce((a, b) => a + b, 0) / 36;
      NOISE[p.id] = xs.map((x) => x - m);
    }
    return NOISE[p.id][k] * p.vol;
  };
  let RET = [], M = M0.slice();
  const PV = {}; // product id → { v: [value at month end 0..35], start, mkt: [], contrib: [] }
  function simulate(shiftA, shiftB) {
    M = M0.map((x, k) => x + (k >= 24 ? shiftA : shiftB));
    PRODUCTS.forEach((p) => { PV[p.id] = { v: [], mkt: [], contrib: [], r: [] }; });
    const inv = [], mkt = [];
    PRODUCTS.forEach((p) => {
      let v = p.now;
      for (let k = 35; k >= 0; k--) {
        const r = p.cls === 'P2P' ? p.alpha - (k % 11 === 4 ? 0.006 : 0) : p.alpha + p.beta * M[k] + idio(p, k);
        const c = SPEND[k].investieren * p.share;
        const prev = (v - c) / (1 + r);
        PV[p.id].v[k] = v; PV[p.id].mkt[k] = prev * r; PV[p.id].contrib[k] = c; PV[p.id].r[k] = r;
        v = prev;
      }
      PV[p.id].start = v;
    });
    RET = MONTHS_ALL.map((_, k) => {
      let a = 0, b2 = 0;
      PRODUCTS.forEach((p) => { const prev = k ? PV[p.id].v[k - 1] : PV[p.id].start; a += prev * PV[p.id].r[k]; b2 += prev; });
      return a / b2;
    });
  }
  const twr = (from, to) => { let p = 1; for (let k = from; k <= to; k++) p *= 1 + RET[k]; return p; };
  // calibrate to the portfolio figures on Vermögen: 12 months +12,4 %, since Okt 2023 +38,2 % (TTWROR)
  (function () {
    let lo = -0.03, hi = 0.03, sA = 0;
    for (let it = 0; it < 50; it++) { sA = (lo + hi) / 2; simulate(sA, 0); if (twr(24, 35) > 1.124) hi = sA; else lo = sA; }
    const target = 1.382 / twr(24, 35);
    lo = -0.03; hi = 0.03; let sB = 0;
    for (let it = 0; it < 50; it++) { sB = (lo + hi) / 2; simulate(sA, sB); if (twr(0, 23) > target) hi = sB; else lo = sB; }
  })();
  // benchmark indices (sample): world = the market path, the others move around it
  const BENCHES = {
    Weltindex: M.map((x, k) => x + 0.0005 + (((k * 37) % 13) - 6) / 900),
    'USA-Index': M.map((x, k) => x * 1.12 + 0.0013 + (((k * 29) % 11) - 5) / 700),
    Europaindex: M.map((x, k) => x * 0.82 + 0.0005 + (((k * 23) % 9) - 4) / 650),
    Schwellenländerindex: M.map((x, k) => x * 0.8 + 0.002 + (((k * 31) % 7) - 3) / 500),
  };
  const BENCH = BENCHES.Weltindex;
  const DIVIDENDS = MONTHS_ALL.map((mo) => ([2, 5, 8, 11].includes(mo.m) ? INCOME[mo.k].Kapitalerträge : 0));

  // ---------- Net worth from the ledger ----------
  // own contribution = income − consumption + regular loan principal; market = Σ product market moves.
  // Anchored at today's composition (84.730 €) and computed backwards month by month.
  const NOW = { depot: 79450, krypto: 4335, p2p: 4215, tagesgeld: 7739, giro: 1617, kredit: -12176, karte: -450 };
  const INV_NOW = NOW.depot + NOW.krypto + NOW.p2p;
  const NW = [], INV = [], OWN = [], MKT = [];
  (function () {
    let nw = 84730;
    for (let k = 35; k >= 0; k--) {
      NW[k] = r2(nw);
      INV[k] = r2(PRODUCTS.reduce((a, p) => a + PV[p.id].v[k], 0));
      const own = incomeOf(k) - consumptionOf(k) + (LOAN.pmt - LOANH[k].interest);
      const mkt = PRODUCTS.reduce((a, p) => a + PV[p.id].mkt[k], 0);
      OWN[k] = r2(own); MKT[k] = r2(mkt);
      nw -= own + mkt;
    }
    NW.start = r2(nw); INV.start = r2(PRODUCTS.reduce((a, p) => a + PV[p.id].start, 0));
  })();
  // one cost basis, gain and fund cost per product, used by Reports 2.6, 4.2, 4.5 and Vermögen
  const costOf = (p) => r2(PV[p.id].start * 0.92 + PV[p.id].contrib.reduce((a, c) => a + c, 0));
  const gainOf = (p) => r2(p.now - costOf(p));
  const terOf = (p, ks) => ks.reduce((a, k) => a + (PV[p.id].v[k] * p.ter) / 12, 0);
  const sumCls = (k, pred) => r2(PRODUCTS.filter(pred).reduce((a, p) => a + PV[p.id].v[k], 0));
  const TYPES = [
    { key: 'depot', name: 'Depot' }, { key: 'krypto', name: 'Krypto' }, { key: 'p2p', name: 'P2P' },
    { key: 'tagesgeld', name: 'Tagesgeld' }, { key: 'giro', name: 'Giro und Bargeld' },
    { key: 'kredit', name: 'Kredit', debt: true }, { key: 'karte', name: 'Kreditkarte', debt: true },
  ];
  const structure = (k) => {
    const krypto = sumCls(k, (p) => p.cls === 'Krypto');
    const p2p = sumCls(k, (p) => p.cls === 'P2P');
    const giro = k === 35 ? NOW.giro : r2(1450 + 260 * Math.sin(k * 1.7));
    const karte = k === 35 ? NOW.karte : r2(-(380 + 90 * Math.abs(Math.sin(k * 2.3))));
    const kredit = -LOANH[k].end;
    const depot = sumCls(k, (p) => p.cls === 'ETF' || p.cls === 'Aktien');
    const tagesgeld = r2(NW[k] - depot - krypto - p2p - giro - kredit - karte);
    return { depot, krypto, p2p, tagesgeld, giro, kredit, karte };
  };

  // ---------- 50/30/20 on assigned money: periodic costs count as their monthly reserve ----------
  const periodicYear = (c, y) => c.events.filter((e) => !e[2] || e[2] === y).filter((e, i, arr) => !(e[2] === undefined && arr.some((x) => x[0] === e[0] && x[2] === y))).reduce((a, e) => a + e[1], 0);
  function alloc(ks) {
    const out = { need: 0, want: 0, future: 0, income: 0 };
    ks.forEach((k) => {
      const y = MONTHS_ALL[k].y;
      // special payments count as twelfths, like the periodic costs on the other side
      out.income += incomeOf(k) - INCOME[k].Sonderzahlung + salaryAtKey(MONTHS_ALL[k].key).gross * 0.772 * 2 / 12;
      CATS.forEach((c) => {
        const key = MONTHS_ALL[k].key;
        // periodic costs and the windfall transfers (R12) count as twelfths
        const v = c.kind === 'periodic' ? periodicYear(c, y) / 12
          : c.id === 'investieren' || c.id === 'notgroschen' ? priceAt(c, key) + salaryAtKey(key).gross * 0.772 * 2 * (c.id === 'investieren' ? 0.5 : 0.2) / 12
          : SPEND[k][c.id];
        out[c.cls] += v;
      });
    });
    out.rest = out.income - out.need - out.want - out.future;
    return out;
  }

  (function () {
    const al = alloc(Array.from({ length: 12 }, (_, i) => LAST_FULL - 11 + i));
    const p = ['need', 'want', 'future'].map((c) => Math.round((al[c] / al.income) * 100));
    const rest = 100 - p[0] - p[1] - p[2];
    RC_R01 = `${p.join(' / ')} % · ${rest < 0 ? `aus Guthaben ${MINUS}${-rest}` : `übrig ${rest}`} %`;
  })();
  // ---------- Money age (days) and emergency fund ----------
  const AGE = MONTHS_ALL.map((mo) => Math.round(9 + mo.k * 0.27 + Math.sin(mo.k * 1.3) * 1.6 - (mo.m === 7 ? 3 : 0) - (mo.m === 11 ? 2 : 0)));
  AGE[35] = 18;

  // ---------- Rules R01–R16: today plus the last 12 month ends ----------
  const RULES = [
    ['R01', '50/30/20', RC_R01, 'Ziel 50 / 30 / 20', 'ooowwoooowww'],
    ['R02', 'Notgroschen', '2,4 Monate', 'min. 3, Ziel 6 Monate', 'bbbbbbbbbbbb'],
    ['R03', 'Vom Vormonat leben', 'Geldalter 18 Tage', 'Ziel ≥ 30 Tage', 'wwwwwwwwwwww'],
    ['R04', 'Pay yourself first', 'am Gehaltstag gefüllt', 'Zukunft zuerst', 'oooooooooooo'],
    ['R05', 'Sinking Funds', '6 von 6 gedeckt', 'alle bei Fälligkeit', 'oooowooooooo'],
    ['R06', 'Kreditkarte', 'Saldo gedeckt', 'immer gedeckt', 'oooooooooooo'],
    ['R07', 'Dispo', 'Tiefpunkt 612 €', '≥ 0 € in 90 Tagen', 'oooooooooooo'],
    ['R08', 'Schuldenquote', '10,8 %', '≤ 30 %', 'oooooooooooo'],
    ['R09', 'Tilgungsreihenfolge', 'Sondertilgung aktiv', 'Zins > 5 %: tilgen', 'wwwwwwwwoooo'],
    ['R10', 'Fixkostenquote', '37,7 %', '≤ 55 %', 'oooooooooooo'],
    ['R11', 'Lifestyle-Inflation', 'Ausgaben +3,1 % · Einkommen +1,9 %', 'Ausgaben ≤ Einkommen', 'oooooowwoooo'],
    ['R12', 'Windfall', 'Sonderzahlung verteilt', '10 % Genuss', 'oooooooooooo'],
    ['R13', 'Asset Allocation', 'Schwellenländer −4,0 Pp', '≤ 5 Pp Abweichung', 'ooooooowwwww'],
    ['R14', 'Klumpenrisiko', 'größte Position 4,5 %', 'Einzeltitel ≤ 10 %', 'oooooooooooo'],
    ['R15', 'Spekulativer Anteil', '14,2 %', '≤ 10 %', 'wwwwbbbbbbbb'],
    ['R16', 'Freiheitszahl', '8,9 %', 'Fortschritt steigt', 'oooooooooooo'],
  ].map(([id, name, val, goal, hist]) => ({ id, name, val, goal, hist: hist.split('').map((c) => ({ o: 'ok', w: 'warn', b: 'bad' }[c])) }));
  // today = last entry: 11 erfüllt, 3 Warnung, 2 verletzt, as on Heute

  // ---------- SVG helpers ----------
  function s(tag, attrs = {}, parent) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
  }
  function yTicks(lo, hi, n = 4) {
    const span = hi - lo || 1;
    const raw = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((x) => x >= raw) || raw;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-6; v += step) out.push(r2(v));
    return out;
  }
  const kfmt = (v) => (Math.abs(v) < 0.5 ? '0' : Math.abs(v) >= 10000 ? `${nf0.format(v / 1000)} T` : Math.abs(v) >= 1000 ? `${nf1.format(v / 1000)} T` : nf0.format(v));
  function text(svg, x, y, str, cls = 'svg-label', anchor = 'start') { const t = s('text', { x, y, class: cls, 'text-anchor': anchor }, svg); t.textContent = str; return t; }
  function frame(svg, { L = 56, R = 16, T = 12, B = 26 } = {}) {
    const W = svg.clientWidth, H = svg.clientHeight;
    return { W, H, L, R, T, B: H - B, iw: W - L - R };
  }
  function gridY(svg, f, lo, hi, y, fmt = kfmt, zeroAxis = true) {
    yTicks(lo, hi).forEach((v) => {
      s('line', { x1: f.L, x2: f.W - f.R, y1: y(v), y2: y(v), class: v === 0 && zeroAxis ? 'axis' : 'graticule' }, svg);
      text(svg, f.L - 8, y(v) + 4, fmt(v), 'svg-label', 'end');
    });
  }
  function path(svg, pts, cls) { return s('path', { d: pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' '), class: cls }, svg); }
  function xLabels(svg, f, n, x, labelAt, maxLabels) {
    const max = maxLabels || Math.max(2, Math.floor(f.iw / 64));
    const step = Math.max(1, Math.ceil((n + 1) / max));
    for (let i = 0; i <= n; i += step) text(svg, x(i), f.H - 6, labelAt(i), 'svg-label', 'middle');
  }

  // ---------- HTML helpers ----------
  // Chains must add up as displayed: when rounded euro parts miss the shown result by a few euros,
  // the largest part absorbs the difference (largest-remainder rounding), so the result keeps matching the headline.
  const parseEur = (str) => {
    const m = /^([+−-]?)([\d.]+)(,\d+)? €$/.exec(String(str));
    if (!m) return null;
    const v = +(m[2].replace(/\./g, '') + (m[3] ? '.' + m[3].slice(1) : ''));
    return { v: m[1] === '−' || m[1] === '-' ? -v : v, plus: m[1] === '+', cents: !!m[3] };
  };
  function balanceChain(terms) {
    const out = terms.map((x) => ({ ...x }));
    let seg = [], acc = 0;
    for (let i = 0; i < out.length; i++) {
      const t = out[i], p = parseEur(t.val);
      if (!p || (i && !['+', MINUS, '='].includes(t.op))) break;
      if (t.op === '=') {
        const d = Math.round((p.v - acc) * 100) / 100;
        const movable = seg.filter((s) => !s.fixed);
        if (d && !p.cents && Math.abs(d) <= 4 && movable.length) {
          const big = movable.reduce((a, b) => (Math.abs(b.p.v) > Math.abs(a.p.v) ? b : a));
          const nv = big.p.v + d * big.sign;
          out[big.i].val = eur(nv, { cents: false, sign: big.p.plus });
        }
        acc = p.v; seg = [{ i, p, sign: 1, fixed: true }];
        continue;
      }
      const sign = t.op === MINUS ? -1 : 1;
      acc += sign * p.v;
      seg.push({ i, p, sign });
    }
    return out;
  }
  const chain = (terms0, label) => `<div class="chain-inline" role="group" aria-label="${esc(label)}">${balanceChain(terms0).map((t) => {
    const inner = `<span class="ct-label tech">${esc(t.label)}</span><span class="ct-val">${t.val}</span>`;
    return `<span class="ct-pair">${t.op ? `<span class="ct-op" aria-hidden="true">${t.op}</span>` : ''}<span class="ct-term${t.result ? ' is-result' : ''}">${inner}</span></span>`;
  }).join('')}</div>`;
  const tri = (id) => `<svg class="rev-tri" viewBox="0 0 26 24" aria-hidden="true"><path d="M13 2.5 24 21.5H2Z"/><text x="13" y="18" text-anchor="middle">${id}</text></svg>`;
  const opt = (v, l, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`;
  // ink density for heatmaps: 0 … 1 → tint strength (neutral, e.g. money set aside)
  const heat = (t) => `--h:${Math.max(0, Math.min(1, t)).toFixed(2)}`;
  // diverging heat (user decision 29.09.2026): pastel red = above the row average, pastel green = below;
  // good = 'low' for spending, 'high' for income and returns
  function heatStats(vals) {
    const xs = vals.filter((x) => x != null && x !== 0);
    const mean = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    const dev = Math.max(...xs.map((x) => Math.abs(x - mean)), 1e-9);
    return { mean, dev };
  }
  function heatAttr(x, st, good = 'low', center = null) {
    if (x == null || x === 0) return 'class="n"';
    const c = center == null ? st.mean : center;
    const d = (x - c) / (center == null ? st.dev : Math.max(st.dev, 1e-9));
    if (Math.abs(d) < 0.08 || (center == null && Math.abs(x - c) < Math.abs(c) * 0.08)) return 'class="n"';
    const bad = good === 'low' ? d > 0 : d < 0;
    return `class="n hc2 ${bad ? 'hc-red' : 'hc-green'}" style="--h:${Math.min(1, 0.25 + Math.abs(d) * 0.75).toFixed(2)}"`;
  }

  // ---------- Chart scaffolds (monthly band scale: bars and lines share band centres) ----------
  function scaffold(svg, n, lo, hi, o = {}) {
    svg.innerHTML = '';
    const f = frame(svg, o);
    if (!f.W) return null;
    let a = lo, b = hi;
    if (o.zero !== false) { a = Math.min(0, a); b = Math.max(0, b); }
    const sp = (b - a) || 1;
    if (o.zero === false || a < 0) a -= sp * (o.pad ?? 0.08);
    b += sp * (o.pad ?? 0.08);
    const bw = f.iw / n;
    const x = (i) => f.L + (i + 0.5) * bw;
    const y = (v) => f.B - ((v - a) / (b - a)) * (f.B - f.T);
    gridY(svg, f, a, b, y, o.yfmt || kfmt, o.zero !== false);
    if (o.labelAt) {
      const max = o.maxLabels || Math.max(2, Math.floor(f.iw / 58));
      const step = Math.max(1, Math.ceil(n / max));
      for (let i = n - 1; i >= 0; i -= step) text(svg, x(i), f.H - 6, o.labelAt(i), 'svg-label', 'middle');
    }
    return { f, x, y, bw, a, b };
  }
  const tip = (el, str) => { const t = s('title', {}, el); t.textContent = str; return el; };
  function bar(svg, cx, w, y0, y1, cls, title) {
    const r = s('rect', { x: (cx - w / 2).toFixed(1), y: Math.min(y0, y1).toFixed(1), width: w.toFixed(1), height: Math.max(1, Math.abs(y1 - y0)).toFixed(1), class: cls }, svg);
    if (title) tip(r, title);
    return r;
  }
  // step line through band centres (level held within a month)
  const linePts = (vals, x, y) => vals.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
  // month window helpers
  const PERIOD_LEN = { '1M': 1, '3M': 3, YTD: 'ytd', '1J': 12, '3J': 35, Alles: 35 };
  function windowK(period, end = LAST_FULL) {
    let n = PERIOD_LEN[period];
    if (n === 'ytd') n = MONTHS_ALL[end].m + 1;
    const out = [];
    for (let k = Math.max(0, end - n + 1); k <= end; k++) out.push(k);
    return out;
  }
  const periodName = (p) => ({ '1M': MONTHS_ALL[LAST_FULL].long, '3M': 'letzte 3 Monate', YTD: `Jän–${MONTHS[MONTHS_ALL[LAST_FULL].m]} ${MONTHS_ALL[LAST_FULL].y}`, '1J': 'letzte 12 Monate', '3J': 'seit Okt 2023', Alles: 'seit Okt 2023' }[p]);
  const labelShort = (k, withYear) => { const mo = MONTHS_ALL[k]; return withYear || mo.m === 0 ? `${MONTHS[mo.m]} ${String(mo.y).slice(2)}` : MONTHS[mo.m]; };

  // class fills: need solid, want hatched, future cross-hatched (patterns live in reports.html)
  const CLASS_FILL = { need: 'f-need', want: 'f-want', future: 'f-future' };

  // ---------- Sankey: columns of nodes, links as ink bands ----------
  function sankey(svg, cols, links, o = {}) {
    svg.innerHTML = '';
    const W = svg.clientWidth, H = svg.clientHeight;
    if (!W) return;
    const nw = 10, gap = o.gap || 10;
    // size the label margins from the longest measured label of the first and the last column
    const measure = (names) => { let m = 0; names.forEach((n) => { const tt = text(svg, 0, 0, n, 'svg-label-strong'); m = Math.max(m, tt.getComputedTextLength()); tt.remove(); }); return m; };
    const padL = Math.max(o.padL ?? 0, measure(cols[0].map((n) => n.name)) + 18);
    const padR = Math.max(o.padR ?? 0, measure(cols[cols.length - 1].map((n) => n.name)) + 22);
    const colX = cols.map((_, i) => padL + (i * (W - padL - padR - nw)) / (cols.length - 1));
    const tot = Math.max(...cols.map((c) => c.reduce((a, n) => a + n.v, 0)));
    const maxN = Math.max(...cols.map((c) => c.length));
    const k = (H - 8 - gap * (maxN - 1)) / tot;
    const pos = {};
    cols.forEach((c, ci) => {
      let yy = 4;
      c.forEach((n) => { const h = Math.max(2, n.v * k); pos[n.id] = { x: colX[ci], y: yy, h, out: yy, in: yy, n, ci }; yy += h + gap; });
    });
    const g = s('g', { class: 'sk-links' }, svg);
    links.forEach((l) => {
      const a = pos[l.from], b = pos[l.to];
      if (!a || !b || l.v <= 0) return;
      const h = l.v * k;
      const x0 = a.x + nw, x1 = b.x, xm = (x0 + x1) / 2;
      const y0 = a.out, y1 = b.in;
      a.out += h; b.in += h;
      const d = `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + h} C${xm},${y1 + h} ${xm},${y0 + h} ${x0},${y0 + h} Z`;
      tip(s('path', { d, class: `sk-link ${l.cls || ''}` }, g), `${l.label || ''}: ${eur(l.v, { cents: false })}`);
    });
    Object.values(pos).forEach((p) => {
      tip(s('rect', { x: p.x, y: p.y, width: nw, height: p.h, class: `sk-node ${p.n.cls || ''}` }, svg), `${p.n.name}: ${eur(p.n.v, { cents: false })}`);
      const left = p.ci === 0;
      const tx = left ? p.x - 8 : p.x + nw + 8;
      const anchor = left ? 'end' : 'start';
      const ty = p.y + p.h / 2;
      if (p.h < 9 && !p.n.force) return;
      text(svg, tx, ty - (p.h >= 26 ? 3 : -4), p.n.name, 'svg-label-strong sk-lbl', anchor);
      if (p.h >= 26) text(svg, tx, ty + 13, eur(p.n.v, { cents: false }), 'svg-label sk-lbl', anchor);
    });
  }

  // ---------- HTML pieces ----------
  const fig = (v) => {
    const a = Math.round(Math.abs(v) * 100) / 100;
    const whole = Math.trunc(a);
    return `${v < -0.004 ? MINUS : ''}${nf0.format(whole)}<span class="cents">,${String(Math.round((a - whole) * 100)).padStart(2, '0')} €</span>`;
  };
  const sumK = (ks, fn) => ks.reduce((a, k) => a + fn(k), 0);
  const sw = (cls) => `<i class="sw sw-${cls}" aria-hidden="true"></i>`;
  const delta = (v, { cents = false, invert = false } = {}) => {
    if (Math.abs(v) < 0.5) return '<span class="dl dl-0">±0 €</span>';
    const up = v > 0;
    return `<span class="dl ${(up !== invert) ? 'dl-up' : 'dl-down'}">${icon(up ? 'up' : 'down', 'icon icon-xs')}${eur(v, { cents, sign: true })}</span>`;
  };
  const csvNum = (v) => nf2.format(v).replace(/\./g, '');

  window.RC = {
    fig, sumK, sw, delta, csvNum,
    scaffold, tip, bar, linePts, windowK, periodName, labelShort, CLASS_FILL, sankey, PERIOD_LEN,
    nf0, nf1, nf2, MINUS, r2, eur, pct, esc, icon, MONTHS, MONTHS_LONG, CLASS_LABEL,
    MONTHS_ALL, idx, LAST_FULL, CATS, catById, SPEND, INCOME, INCOME_TYPES, PAYROLL, VPI, salaryAt,
    incomeOf, spendOf, consumptionOf, SALARY, classOf, groupsList, groupOf, sumObj,
    NW, INV, OWN, MKT, NOW, TYPES, structure, RET, BENCH, BENCHES, DIVIDENDS, PLAN, R: {}, LOAN, LOANH, PAYEE, TICKET, AGE, RULES,
    costOf, gainOf, terOf, FX, fxAt, usdAt, PROJECTS, PROJ, PRODUCTS, PV, M, alloc, periodicYear, heatStats, heatAttr, kOfKey,
    s, yTicks, kfmt, text, frame, gridY, path, xLabels, chain, tri, opt, heat, priceAt,
  };
})();
