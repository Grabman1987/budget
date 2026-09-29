/* Finanz-App prototype · Einstellungen › Konten, Regelwerk, Datenquellen. Sample data only.
   Helpers mirror the other pages; unify them in the React build. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

  // One row per account: where its data comes from and whether it is fetched automatically.
  const src = (id, name, inst, kind, auto, rhythm, consent, last, status) => ({ id, name, inst, kind, auto, rhythm, consent, last, status });
  const SOURCES = [
    src('giro', 'Girokonto', 'Bank A', 'psd2', true, '2x', '12.02.2027', 'heute 06:30', 'ok'),
    src('karte', 'Kreditkarte', 'Bank A', 'psd2', true, '2x', '12.02.2027', 'heute 06:30', 'ok'),
    src('tagesgeld', 'Tagesgeld', 'Bank B', 'psd2', true, '1x', '29.09.2026', 'heute 06:30', 'consent'),
    src('bargeld', 'Bargeld', 'Geldbörse', 'manual', false, 'manual', null, '15.09.2026', 'ok'),
    src('depot', 'Depot · ETF', 'Broker C', 'file', false, 'manual', null, 'Import 14.09.2026', 'ok'),
    src('krypto', 'Krypto', 'Plattform D', 'api', true, '1x', null, 'heute 06:30', 'ok'),
    src('p2p', 'P2P-Kredite', 'Plattform E', 'manual', false, 'manual', null, '14.08.2026', 'stale'),
    src('kredit', 'Kredit 6,32 %', 'Bank F', 'manual', false, 'manual', null, 'Tilgungsplan', 'ok'),
  ];
  const KIND = { psd2: 'Bank-Sync (PSD2)', api: 'API (nur lesen)', file: 'Datei-Import (CSV, XLSX, PDF)', manual: 'manuell' };
  const RHYTHM = { '2x': '2× täglich', '1x': '1× täglich', manual: 'nur manuell' };
  const GLOBAL = { night: true, prices: true, fallback: true, fx: true, staleDays: 30 };

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
    const before = JSON.stringify({ SOURCES, GLOBAL });
    fn();
    render();
    toast(label, () => { const b = JSON.parse(before); SOURCES.splice(0, SOURCES.length, ...b.SOURCES); Object.assign(GLOBAL, b.GLOBAL); render(); toast('Rückgängig gemacht.'); });
  }

  const sw = (id, on, label) => `<button class="switch" type="button" role="switch" aria-checked="${on}" data-switch="${id}"><span class="switch-track" aria-hidden="true"><span class="switch-knob"></span></span><span class="sr-only">${esc(label)}</span></button>`;
  function statusCell(r) {
    if (r.status === 'consent') return `<span class="kstamp is-warn">${icon('alert', 'icon icon-xs')}Einwilligung endet in 12 Tagen</span>`;
    if (r.status === 'stale') return `<span class="kstamp is-stale">${icon('clock', 'icon icon-xs')}Wert 34 Tage alt</span>`;
    if (!r.auto) return `<span class="kstamp">${icon('settings', 'icon icon-xs')}manuell gepflegt</span>`;
    return `<span class="kstamp">${icon('refresh', 'icon icon-xs')}in Ordnung</span>`;
  }
  function renderSources() {
    const autoN = SOURCES.filter((r) => r.auto).length;
    const problems = SOURCES.filter((r) => r.status !== 'ok').length;
    $('#view').innerHTML = `
      <section class="set-sec" aria-labelledby="srcTitle">
        <div class="head"><h2 id="srcTitle">Datenquellen je Konto</h2><span class="aside">${autoN} von ${SOURCES.length} automatisch · ${problems ? `${problems} brauchen dich` : 'alles in Ordnung'}</span></div>
        <p class="panel-sub">Lege fest, woher jedes Konto seine Daten bekommt und ob der Nachtlauf es abruft. Manuell gepflegte Konten landen im Posteingang, wenn ihr Wert älter als ${GLOBAL.staleDays} Tage ist.</p>
        <table class="ktable stable">
          <caption class="sr-only">Datenquellen je Konto</caption>
          <thead><tr><th class="tech" scope="col">Konto</th><th class="tech" scope="col">Quelle</th><th class="tech" scope="col">Automatisch</th><th class="tech" scope="col">Rhythmus</th><th class="tech" scope="col">Einwilligung bis</th><th class="tech" scope="col">Letzter Stand</th><th class="tech" scope="col">Status</th></tr></thead>
          <tbody>${SOURCES.map((r) => `<tr>
            <td><span class="kname-s">${esc(r.name)}</span><span class="kmeta">${esc(r.inst)}</span></td>
            <td><label class="sr-only" for="kind-${r.id}">Quelle für ${esc(r.name)}</label><select class="select select-sm" id="kind-${r.id}" data-kind="${r.id}">${Object.entries(KIND).map(([k, l]) => `<option value="${k}"${k === r.kind ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
            <td data-label="Automatisch">${r.kind === 'manual' || r.kind === 'file' ? '<span class="muted">—</span>' : sw(r.id, r.auto, `${r.name} automatisch abrufen`)}</td>
            <td data-label="Rhythmus">${r.auto ? `<label class="sr-only" for="rh-${r.id}">Rhythmus für ${esc(r.name)}</label><select class="select select-sm" id="rh-${r.id}" data-rhythm="${r.id}">${['2x', '1x'].map((k) => `<option value="${k}"${k === r.rhythm ? ' selected' : ''}>${RHYTHM[k]}</option>`).join('')}</select>` : `<span class="muted">${RHYTHM.manual}</span>`}</td>
            <td data-label="Einwilligung bis">${r.consent ? `<span class="${r.status === 'consent' ? 'ink-strong' : ''}">${r.consent}</span>${r.status === 'consent' ? `<button class="btn btn-ghost btn-xs s-renew" type="button" data-renew="${r.id}">Erneuern</button>` : ''}` : '<span class="muted">—</span>'}</td>
            <td class="kc-acct" data-label="Letzter Stand">${esc(r.last)}</td>
            <td data-label="Status">${statusCell(r)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </section>
      <section class="set-sec set-global" aria-labelledby="globTitle">
        <div class="head"><h2 id="globTitle">Nachtlauf und Kurse</h2></div>
        <ul class="list set-list">
          <li><span><strong>Nachtlauf</strong><small>Bank-Sync, Kurse, erwartete Zahlungen zuordnen, Dubletten erkennen, Regeln prüfen · 06:30 und 18:30</small></span>${sw('g-night', GLOBAL.night, 'Nachtlauf')}</li>
          <li><span><strong>Wertpapierkurse täglich abrufen</strong><small>Quelle je Kurs wird gespeichert; Ausfälle landen im Posteingang</small></span>${sw('g-prices', GLOBAL.prices, 'Kurse abrufen')}</li>
          <li><span><strong>Ersatzquelle, wenn die Hauptquelle ausfällt</strong><small>zweite inoffizielle Kursquelle</small></span>${sw('g-fallback', GLOBAL.fallback, 'Ersatzquelle')}</li>
          <li><span><strong>EZB-Wechselkurse</strong><small>Fremdwährung mit dem Kurs des Buchungstags</small></span>${sw('g-fx', GLOBAL.fx, 'Wechselkurse')}</li>
          <li><span><strong>Manuelle Werte gelten als veraltet nach</strong><small>danach Erinnerung im Posteingang</small></span><label class="sr-only" for="staleDays">Tage</label><select class="select select-sm" id="staleDays">${[14, 30, 60, 90].map((d) => `<option value="${d}"${d === GLOBAL.staleDays ? ' selected' : ''}>${d} Tagen</option>`).join('')}</select></li>
        </ul>
      </section>`;
  }

  // ---------- Konten: every account with its terms (credit line, rates, term) ----------
  // these terms feed Reports 2.6 (Kreditlinien), the forecast (Dispo never counts as money, R07) and the rules
  const acct = (id, name, inst, art, role, extra) => ({ id, name, inst, art, role, ...extra });
  const ACCOUNTS = [
    acct('giro', 'Girokonto', 'Bank A', 'Girokonto', 'Budget-Konto', { limit: 2000, limitLabel: 'Dispo-Rahmen', rate: 11.75, rateLabel: 'Sollzins', fee: '6,90 € je Monat' }),
    acct('karte', 'Kreditkarte', 'Bank A', 'Kreditkarte', 'Budget-Konto', { limit: 2000, limitLabel: 'Kartenlimit', rate: 13.9, rateLabel: 'Zins bei Teilzahlung', due: 'Abrechnung am 22., Einzug voll', fee: '1,5 % Auslandsentgelt' }),
    acct('bargeld', 'Bargeld', 'Geldbörse', 'Bargeld', 'Budget-Konto', {}),
    acct('tagesgeld', 'Tagesgeld', 'Bank B', 'Tagesgeld', 'Rücklage', { rate: 2.25, rateLabel: 'Habenzins' }),
    acct('kredit', 'Kredit', 'Bank F', 'Ratenkredit', 'Schuld', { limit: 30000, limitLabel: 'Kreditbetrag', rate: 6.32, rateLabel: 'Sollzins fix', term: 'bis 07.2031', due: '412 € am 3., Sondertilgung frei' }),
    acct('depot', 'Depot', 'Broker C', 'Wertpapierdepot', 'Anlage', { fee: '1,50 € je Sparplan-Ausführung' }),
    acct('krypto', 'Krypto', 'Plattform D', 'Krypto-Konto', 'Anlage', { fee: '1 % Spread' }),
    acct('p2p', 'P2P-Kredite', 'Plattform E', 'P2P-Konto', 'Anlage', { rate: 6.5, rateLabel: 'Zins Ø' }),
  ];
  const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  function renderAccounts() {
    const roles = ['Budget-Konto', 'Rücklage', 'Anlage', 'Schuld'];
    const credit = ACCOUNTS.filter((a) => a.limit);
    $('#view').innerHTML = `
      <section class="set-sec set-wide" aria-labelledby="acTitle">
        <div class="head"><h2 id="acTitle">Konten und Konditionen</h2><span class="aside">${ACCOUNTS.length} Konten · ${credit.length} mit Kreditrahmen</span></div>
        <p class="panel-sub">Rolle, Rahmen, Zinssatz und Laufzeit je Konto. Daraus rechnen die Kreditlinien in Reports 2.6, die Liquiditätsprognose (ein Dispo-Rahmen zählt nie als Geld, R07) und die Regeln R06 bis R09.</p>
        <table class="ktable atable">
          <caption class="sr-only">Konten mit Rolle und Konditionen</caption>
          <thead><tr><th class="tech" scope="col">Konto</th><th class="tech" scope="col">Art</th><th class="tech" scope="col">Rolle</th><th class="tech" scope="col">Rahmen</th><th class="tech" scope="col">Zinssatz</th><th class="tech" scope="col">Laufzeit und Zahlung</th><th class="tech" scope="col">Gebühren</th></tr></thead>
          <tbody>${ACCOUNTS.map((a) => `<tr>
            <td><span class="kname-s">${esc(a.name)}</span><span class="kmeta">${esc(a.inst)}</span></td>
            <td data-label="Art">${esc(a.art)}</td>
            <td data-label="Rolle"><label class="sr-only" for="role-${a.id}">Rolle von ${esc(a.name)}</label><select class="select select-sm" id="role-${a.id}" data-role="${a.id}">${roles.map((r) => `<option${r === a.role ? ' selected' : ''}>${r}</option>`).join('')}</select></td>
            <td data-label="Rahmen">${a.limitLabel ? `<label class="acf"><span class="kmeta">${esc(a.limitLabel)}</span><span class="amount-field amount-field-sm"><input class="amount-input" data-limit="${a.id}" inputmode="decimal" value="${nf0.format(a.limit)}"><span class="amount-cur">€</span></span></label>` : '<span class="muted">—</span>'}</td>
            <td data-label="Zinssatz">${a.rateLabel ? `<label class="acf"><span class="kmeta">${esc(a.rateLabel)}</span><span class="amount-field amount-field-sm"><input class="amount-input" data-rate="${a.id}" inputmode="decimal" value="${nf2.format(a.rate)}"><span class="amount-cur">%</span></span></label>` : '<span class="muted">—</span>'}</td>
            <td data-label="Laufzeit und Zahlung">${a.term || a.due ? `${a.term ? `<strong>${esc(a.term)}</strong>` : ''}<span class="kmeta">${esc(a.due || '')}</span>` : '<span class="muted">—</span>'}</td>
            <td data-label="Gebühren">${a.fee ? esc(a.fee) : '<span class="muted">—</span>'}</td>
          </tr>`).join('')}</tbody>
        </table>
        <div class="vplan-act"><button class="btn btn-ghost btn-sm" type="button" data-soon="Konto anlegen">${icon('plus')}Konto anlegen</button><a class="tb-link" href="reports.html#r/kosten">Kreditlinien in Reports ansehen ${icon('chevron', 'icon icon-xs')}</a></div>
      </section>`;
  }

  // ---------- Regelwerk: stages from the four books plus R01–R16 ----------
  const STAGES = [
    { no: 1, name: 'Fundament', range: 'bis 10.000 €', rules: [
      ['Nudel-Budget kennen: das Nötigste je Monat', 'Get Good with Money', true],
      ['Starter-Notgroschen: 1 Monat Nudel-Budget', 'Get Good with Money', true],
      ['Kreditkarte immer voll zurückzahlen', 'I Will Teach You to Be Rich · R06', true],
      ['Am Gehaltstag automatisch verteilen', 'I Will Teach You to Be Rich · R04', true],
    ] },
    { no: 2, name: 'Aufbau', range: '10.000 bis 100.000 €', rules: [
      ['15 % des Bruttoeinkommens investieren', 'Everyday Millionaires', true],
      ['Notgroschen 3 bis 6 Monate Bedarf', 'Get Good with Money · R02', true],
      ['Bewusster Ausgabenplan: Fix 50–60 %, Investieren ≥ 10 %, Genuss 20–35 %', 'I Will Teach You to Be Rich', true],
      ['Kredite über 5 % zuerst tilgen, kein Konsum- oder Autokredit', 'Everyday Millionaires · R09', true],
      ['Echten Stundenlohn kennen, Ausgaben in Lebenszeit', 'Your Money or Your Life', true],
      ['Versicherungen vollständig', 'Get Good with Money', true],
    ] },
    { no: 3, name: 'Freiheit', range: '100.000 bis 1 Mio. €', rules: [
      ['Crossover Point: 4 % Kapitalertrag deckt die Ausgaben', 'Your Money or Your Life · R16', true],
      ['Kostenquote ≤ 0,3 %, Rebalancing im Band', 'I Will Teach You to Be Rich · R13', true],
      ['Testament und Vorsorgevollmacht', 'Get Good with Money', true],
      ['Steuern gestalten: Verlustausgleich, Freibeträge', 'Everyday Millionaires', true],
    ] },
  ];
  const RULESET = [
    ['R01', '50/30/20', 'Bedarf ≤ 50 %, Wunsch ≤ 30 %, Zukunft ≥ 20 %'], ['R02', 'Notgroschen', 'min. 3, Ziel 6 Monate'],
    ['R03', 'Vom Vormonat leben', 'Geldalter ≥ 30 Tage'], ['R04', 'Pay yourself first', 'Zukunft am Gehaltstag zuerst'],
    ['R05', 'Sinking Funds', 'bei Fälligkeit gedeckt'], ['R06', 'Kreditkarte', 'immer gedeckt'], ['R07', 'Dispo', 'Tiefpunkt ≥ 0 € in 90 Tagen'],
    ['R08', 'Schuldenquote', '≤ 30 % des Nettoeinkommens'], ['R09', 'Tilgungsreihenfolge', 'über 5 % Zins: tilgen'], ['R10', 'Fixkostenquote', '≤ 55 %'],
    ['R11', 'Lifestyle-Inflation', 'Ausgaben ≤ Einkommen, 12 M'], ['R12', 'Windfall', '10 % Genuss, Rest nach Wasserfall'], ['R13', 'Asset Allocation', '5 Pp oder 25 % relativ'],
    ['R14', 'Klumpenrisiko', 'Einzeltitel ≤ 10 %, Plattform ≤ 20 %'], ['R15', 'Spekulativer Anteil', '≤ 10 %'], ['R16', 'Freiheitszahl', 'Investiert ÷ 25 Jahresausgaben'],
  ];
  const RULE_ON = Object.fromEntries(RULESET.map(([id]) => [id, true]));
  function renderRules() {
    $('#view').innerHTML = `
      <section class="set-sec set-wide" aria-labelledby="stgTitle">
        <div class="head"><h2 id="stgTitle">Stufen</h2><span class="aside">aktuell Stufe 2 · automatisch nach Nettovermögen</span></div>
        <p class="panel-sub">Die Regeln aus I Will Teach You to Be Rich, Get Good with Money, Your Money or Your Life und Everyday Millionaires, geordnet nach Vermögensstufe. Der Finanz-Check zeigt die Regeln eurer Stufe und die der nächsten. Haltung: Würde statt Scham, keine Ausgabe gilt als Fehler.</p>
        <div class="set-stages">${STAGES.map((st) => `<div class="set-stage${st.no === 2 ? ' is-cur' : ''}">
          <div class="set-stage-h"><strong><span class="rtb-pos">${st.no}</span> ${esc(st.name)}</strong><small>Stufe ${st.no} · ${esc(st.range)}</small></div>
          <ul class="list set-list">${st.rules.map(([r, src, on], i) => `<li><span><strong>${esc(r)}</strong><small>${esc(src)}</small></span>${sw(`st-${st.no}-${i}`, on, r)}</li>`).join('')}</ul>
        </div>`).join('')}</div>
      </section>
      <section class="set-sec set-wide" aria-labelledby="rlTitle">
        <div class="head"><h2 id="rlTitle">Regeln R01 bis R16</h2><span class="aside">${Object.values(RULE_ON).filter(Boolean).length} von 16 aktiv</span></div>
        <ul class="list set-list set-rules">${RULESET.map(([id, name, thr]) => `<li><span><strong><span class="rtb-pos">${id}</span> ${esc(name)}</strong><small>${esc(thr)}</small></span><button class="btn btn-ghost btn-xs" type="button" data-soon="Schwelle ${id}">Schwelle</button>${sw(`r-${id}`, RULE_ON[id], `${id} ${name}`)}</li>`).join('')}</ul>
      </section>`;
  }
  function render() {
    const h = ['#konten', '#regelwerk', '#datenquellen'].includes(location.hash) ? location.hash : '#datenquellen';
    $$('[data-reg]').forEach((a) => { if (a.getAttribute('href') === h) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    ({ '#konten': renderAccounts, '#regelwerk': renderRules, '#datenquellen': renderSources })[h]();
    const act = document.querySelector('.registers [aria-current="page"]');
    if (act) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  document.addEventListener('click', (e) => {
    const q = (sel) => e.target.closest(sel);
    let el;
    if ((el = q('[data-switch]'))) {
      const id = el.dataset.switch;
      if (id.startsWith('st-') || id.startsWith('r-')) {
        const on = el.getAttribute('aria-checked') !== 'true';
        el.setAttribute('aria-checked', on);
        if (id.startsWith('r-')) RULE_ON[id.slice(2)] = on;
        toast(`${el.querySelector('.sr-only').textContent}: ${on ? 'an' : 'aus'}`);
        return;
      }
      if (id.startsWith('g-')) {
        const key = { 'g-night': 'night', 'g-prices': 'prices', 'g-fallback': 'fallback', 'g-fx': 'fx' }[id];
        change(`${el.querySelector('.sr-only').textContent}: ${GLOBAL[key] ? 'aus' : 'an'}`, () => { GLOBAL[key] = !GLOBAL[key]; });
      } else {
        const r = SOURCES.find((x) => x.id === id);
        change(`${r.name}: automatischer Abruf ${r.auto ? 'aus' : 'an'}`, () => { r.auto = !r.auto; if (!r.auto) r.rhythm = 'manual'; else if (r.rhythm === 'manual') r.rhythm = '1x'; });
      }
      return;
    }
    if (q('[data-renew]')) { toast('Die Freigabe bei der Bank (PSD2) kannst nur du selbst erteilen. Im echten Produkt öffnet sich hier die Bank.'); return; }
    if (q('[data-open-booking]')) { location.href = 'index.html#buchung'; return; }
    if (q('[data-open="inbox"]')) { location.href = 'konten.html#posteingang'; return; }
    if ((el = q('[data-soon]'))) { e.preventDefault(); toast(`„${el.dataset.soon}“ ist im Prototyp noch nicht gebaut.`); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.kind) {
      const r = SOURCES.find((x) => x.id === t.dataset.kind);
      change(`${r.name}: Quelle ${KIND[t.value]}`, () => { r.kind = t.value; if (t.value === 'manual' || t.value === 'file') { r.auto = false; r.rhythm = 'manual'; } else if (!r.auto) { r.auto = true; r.rhythm = '1x'; } });
    } else if (t.dataset.rhythm) {
      const r = SOURCES.find((x) => x.id === t.dataset.rhythm);
      change(`${r.name}: ${RHYTHM[t.value]}`, () => { r.rhythm = t.value; });
    } else if (t.dataset.role) {
      const a = ACCOUNTS.find((x) => x.id === t.dataset.role); a.role = t.value; toast(`${a.name}: Rolle ${t.value}`);
    } else if (t.dataset.limit || t.dataset.rate) {
      const a = ACCOUNTS.find((x) => x.id === (t.dataset.limit || t.dataset.rate));
      toast(`${a.name}: ${t.dataset.limit ? a.limitLabel : a.rateLabel} ${t.value}${t.dataset.rate ? ' %' : ' €'} (Prototyp, nicht gespeichert)`);
    } else if (t.id === 'staleDays') {
      change(`Manuelle Werte veraltet nach ${t.value} Tagen`, () => { GLOBAL.staleDays = +t.value; });
    }
  });
  window.addEventListener('hashchange', render);
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#search').focus(); } });

  // Theme + collapse (mirrors app.js)
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

  render();
})();
