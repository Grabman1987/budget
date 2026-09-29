/* Finanz-App prototype · Reports: catalog, routing, report heads, shell.
   Renderers live in reports-<group>.js and register on RC.R. Sample data only. */
(() => {
  'use strict';

  const RC = window.RC;
  const { esc, icon, MONTHS_ALL, LAST_FULL } = RC;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ctl: month | year | period | print (adds a print button) — the report's own controls in its title block
  const GROUPS = [
    { reg: 'monat', no: 1, name: 'Monat und Einkommen', items: [
      { id: 'onepager', name: 'Monats-One-Pager', q: 'Wie lief der Monat, auf einem Blatt?', form: 'Druckblatt A4', ctl: ['month', 'print'] },
      { id: 'gehalt', name: 'Gehaltsreport', q: 'Was bleibt vom Brutto, und wie hat es sich entwickelt?', form: 'Maßkette Brutto → Netto, Stufenlinie', ctl: ['month'] },
      { id: 'einnahmen', name: 'Einnahmen', q: 'Woher kommt das Geld, kam alles Erwartete?', form: 'Gestapelte Säulen, Soll/Ist-Liste', ctl: ['month'] },
      { id: 'geldfluss', name: 'Geldfluss', q: 'Wohin fließt das Geld?', form: 'Sankey', ctl: ['month'] },
      { id: 'jahresansicht', name: 'Jahresansicht', q: 'Wie verteilt sich ein Jahr über die Monate?', form: 'Heatmap Kategorie × Monat', ctl: ['year'] },
      { id: 'kategorien', name: 'Kategorieübersicht', q: 'Wie verhält sich jede Kategorie?', form: 'Liste mit Verlaufslinie', ctl: ['period'] },
      { id: 'sparquote', name: 'Sparquote und Geldalter', q: 'Wie viel bleibt, und wie alt ist das ausgegebene Geld?', form: 'Zwei Linien mit Zielmarke', ctl: ['period'] },
      { id: 'gesamttabelle', name: 'Gesamttabelle', q: 'Alle Zahlen, alle Monate, in einer Tabelle.', form: 'Tabelle, 36 Monate', ctl: [] },
      { id: 'projekte', name: 'Projekte und Nebeneinkünfte', q: 'Was bringen die Nebenprojekte unterm Strich?', form: 'Gewinn und Verlust je Projekt', ctl: ['period'] },
    ] },
    { reg: 'ausgaben', no: 2, name: 'Ausgaben und Plan', items: [
      { id: 'ausgaben', name: 'Ausgabenanalyse', q: 'Wofür geben wir Geld aus?', form: 'Balken sortiert, Klassenbalken, Heatmap', ctl: ['period'] },
      { id: 'budgettreue', name: 'Budgettreue', q: 'Halten wir den Plan, stimmt 50/30/20?', form: 'Bullet-Balken, 100-%-Balken', ctl: ['month'] },
      { id: 'abos', name: 'Verträge und Abos', q: 'Welche Verträge binden uns, und was lässt sich kündigen?', form: 'Stückliste mit Fristen, Fremdwährung', ctl: [] },
      { id: 'inflation', name: 'Persönliche Inflation', q: 'Wie stark steigen unsere Preise?', form: 'Indexlinie gegen VPI', ctl: [] },
      { id: 'empfaenger', name: 'Empfänger-Analyse', q: 'Bei wem lassen wir das meiste Geld?', form: 'Balken sortiert, Bon-Statistik', ctl: ['period'] },
      { id: 'kosten', name: 'Bank- und Zinskosten', q: 'Was kostet uns das Geld selbst?', form: 'Segmentierte Balken je Jahr', ctl: [] },
    ] },
    { reg: 'zukunft', no: 3, name: 'Zukunft und Vermögen', items: [
      { id: 'liquiditaet', name: 'Liquiditätsprognose', q: 'Geht sich das aus, auch mit geplanten Ereignissen?', form: 'Linie mit Band, Ereignisse, Urteil', ctl: [] },
      { id: 'cashflow', name: 'Cashflow-Verlauf', q: 'Verdienen wir mehr, als wir ausgeben?', form: 'Säulen, Linie, Balken um Null', ctl: ['period'] },
      { id: 'vermoegen', name: 'Vermögensverläufe', q: 'Woraus besteht das Vermögen über die Zeit?', form: 'Gestapelte Fläche nach Kontotyp', ctl: ['period'] },
      { id: 'vorschau', name: 'Jahresvorschau Zahlungen', q: 'Welche Zahlungen kommen in den nächsten 12 Monaten?', form: 'Zahlungskalender', ctl: [] },
      { id: 'sparziele', name: 'Sparziele-Fortschritt', q: 'Liegen die Sparziele im Plan?', form: 'Fortschrittsbalken mit Soll-Marke', ctl: [] },
    ] },
    { reg: 'portfolio', no: 4, name: 'Portfolio', items: [
      { id: 'pdepots', name: 'Depots im Vergleich', q: 'Wie schlägt sich jedes Depot?', form: 'Depots nebeneinander', ctl: ['period'] },
      { id: 'pallocation', name: 'Allocation', q: 'Woraus besteht das Portfolio, und wie weit weg vom Soll?', form: 'Sonnendiagramm, Soll/Ist über Zeit', ctl: [] },
      { id: 'peinzahlungen', name: 'Einzahlungen und Wert', q: 'Was haben wir eingezahlt, was ist es wert?', form: 'Stufenlinie gegen Wertlinie', ctl: ['period'] },
      { id: 'prendite', name: 'Rendite und Kennzahlen', q: 'Wie gut, wie riskant, gegen welchen Index?', form: 'Indexlinien, Kennzahlen, Heatmap', ctl: ['period'] },
      { id: 'psteuern', name: 'Kosten, Steuern, Erträge', q: 'Was bleibt nach Gebühren und Steuern?', form: 'Maßkette, Stückliste je Produkt', ctl: [] },
    ] },
    { reg: 'ueberblick', no: 5, name: 'Überblick', items: [
      { id: 'jahresreport', name: 'Jahresreport', q: 'Wie lief das Jahr?', form: 'Druckblatt A4, 2 Blätter', ctl: ['year', 'print'] },
      { id: 'finanzcheck', name: 'Finanz-Check-Verlauf', q: 'Welche Regeln sind verletzt, seit wann?', form: 'Regelliste mit Statusleiste', ctl: [] },
      { id: 'explorer', name: 'Explorer', q: 'Eigene Frage, eigene Tabelle.', form: 'Pivot mit gespeicherten Ansichten', ctl: [] },
      { id: 'kontakte', name: 'Kontakte-Abrechnung', q: 'Wer schuldet wem wie viel?', form: 'Saldenlinie, Kontoblatt', ctl: [] },
      { id: 'vergleich', name: 'Zeitraumvergleich', q: 'Was hat sich gegenüber damals geändert?', form: 'Balken um Null', ctl: [] },
    ] },
  ];
  const ALL = GROUPS.flatMap((g) => g.items.map((it, i) => ({ ...it, pos: `${g.no}.${i + 1}`, group: g })));
  const find = (id) => ALL.find((r) => r.id === id);
  const CTL_LABEL = { month: 'Monat', year: 'Jahr', period: 'Zeitraum' };

  const st = RC.state = { k: LAST_FULL, year: 2025, period: '1J' };

  // ---------- Title blocks ----------
  const standCell = `<div class="tb-cell">
      <span class="tech">Stand</span>
      <span class="tb-value"><svg class="icon icon-sm"><use href="#i-refresh"/></svg><span class="tb-long">Do 17.09.2026 · 06:30</span><span class="tb-short">17.09.</span></span>
    </div>`;
  function monthCtl() {
    const opts = MONTHS_ALL.slice().reverse().map((mo) => RC.opt(mo.k, mo.partial ? `${mo.long} · laufend` : mo.long, st.k)).join('');
    return `<div class="tb-cell tb-ctl"><span class="tech" id="ctlLbl">Monat</span>
      <div class="rmonth">
        <button class="icon-btn" type="button" data-step="-1" aria-label="Voriger Monat"${st.k <= 0 ? ' disabled' : ''}>${icon('chevron-left')}</button>
        <select class="select select-sm" id="monthSel" aria-labelledby="ctlLbl">${opts}</select>
        <button class="icon-btn" type="button" data-step="1" aria-label="Nächster Monat"${st.k >= 35 ? ' disabled' : ''}>${icon('chevron')}</button>
      </div></div>`;
  }
  function yearCtl() {
    return `<div class="tb-cell tb-ctl"><span class="tech" id="ctlLbl">Jahr</span>
      <div class="seg" role="group" aria-labelledby="ctlLbl">${[2024, 2025, 2026].map((y) => `<button type="button" data-year="${y}" aria-pressed="${st.year === y}">${y}${y === 2026 ? ' bis Aug' : ''}</button>`).join('')}</div></div>`;
  }
  function periodCtl() {
    return `<div class="tb-cell tb-ctl"><span class="tech" id="ctlLbl">Zeitraum</span>
      <div class="seg seg-period" role="group" aria-labelledby="ctlLbl">${['1M', '3M', 'YTD', '1J', '3J', 'Alles'].map((p) => `<button type="button" data-period="${p}" aria-pressed="${st.period === p}">${p}</button>`).join('')}</div></div>`;
  }
  function titleCatalog(g) {
    $('#rTitle').className = 'titleblock';
    $('#rTitle').innerHTML = `<div class="tb-cell tb-title"><h1>Reports</h1><p>${g ? esc(g.name) : `${ALL.length} Zeichnungen aus einem Hauptbuch`}</p></div>
      ${standCell}
      <div class="tb-cell"><span class="tech">Datenbasis</span><span class="tb-value">Okt 2023 bis heute</span></div>`;
  }
  function titleReport(r) {
    const ctl = r.ctl.includes('month') ? monthCtl() : r.ctl.includes('year') ? yearCtl() : r.ctl.includes('period') ? periodCtl() : '';
    const print = r.ctl.includes('print') ? `<div class="tb-cell tb-print"><span class="tech">Blatt</span><button class="btn btn-ghost btn-sm" type="button" data-print>${icon('printer')}Drucken</button></div>` : '';
    $('#rTitle').className = `titleblock rtb${ctl ? '' : ' no-ctl'}${print ? ' has-print' : ''}`;
    $('#rTitle').innerHTML = `<div class="tb-cell tb-title rtb-title">
        <a class="rtb-back" href="#${r.group.reg}">${icon('chevron-left', 'icon icon-sm')}<span>${esc(r.group.name)}</span></a>
        <div class="rtb-name"><span class="rtb-pos" aria-hidden="true">${r.pos}</span><h1>${esc(r.name)}</h1></div>
        <p>${esc(r.q)}</p>
      </div>
      ${standCell}${ctl}${print}`;
  }

  // ---------- Catalog ----------
  function renderCatalog(reg) {
    const groups = reg === 'katalog' ? GROUPS : GROUPS.filter((g) => g.reg === reg);
    titleCatalog(reg === 'katalog' ? null : groups[0]);
    $('#view').innerHTML = `<section class="rcat-wrap" aria-label="Katalog der Reports">
      <table class="rcat">
        <thead><tr><th class="tech col-pos">Pos</th><th class="tech">Report</th><th class="tech">Frage</th><th class="tech">Diagrammform</th><th class="tech">Steuerung</th><th><span class="sr-only">Öffnen</span></th></tr></thead>
        ${groups.map((g) => `<tbody>
          <tr class="rcat-grp"><td class="col-pos">${g.no}</td><td colspan="5"><strong>${esc(g.name)}</strong><span class="rcat-count">${g.items.length} Reports</span></td></tr>
          ${g.items.map((it, i) => `<tr class="rcat-row" data-href="#r/${it.id}">
            <td class="col-pos">${g.no}.${i + 1}</td>
            <td class="rcat-name"><a href="#r/${it.id}">${esc(it.name)}</a></td>
            <td class="rcat-q">${esc(it.q)}</td>
            <td class="rcat-form tech">${esc(it.form)}</td>
            <td class="rcat-ctl">${it.ctl.filter((c) => CTL_LABEL[c]).map((c) => CTL_LABEL[c]).join(', ') || '<span class="muted">fest</span>'}${it.ctl.includes('print') ? ` · ${icon('printer', 'icon icon-xs')}` : ''}</td>
            <td class="rcat-go">${icon('chevron', 'icon icon-sm')}</td>
          </tr>`).join('')}
        </tbody>`).join('')}
      </table></section>`;
  }

  // ---------- Report ----------
  function renderReport(r) {
    titleReport(r);
    const v = $('#view');
    v.className = `rview rv-${r.id}`;
    const fn = RC.R[r.id];
    if (fn) fn(v, st); else v.innerHTML = `<p class="muted">Dieser Report ist noch nicht gezeichnet.</p>`;
    const i = ALL.indexOf(r);
    const prev = ALL[i - 1], next = ALL[i + 1];
    v.insertAdjacentHTML('afterbegin', `<nav class="rnext" aria-label="Weitere Reports">
      ${prev ? `<a href="#r/${prev.id}">${icon('chevron-left', 'icon icon-sm')}<span><span class="tech">${prev.pos}</span>${esc(prev.name)}</span></a>` : '<span></span>'}
      ${next ? `<a href="#r/${next.id}" class="is-next"><span><span class="tech">${next.pos}</span>${esc(next.name)}</span>${icon('chevron', 'icon icon-sm')}</a>` : '<span></span>'}
    </nav>`);
  }

  // ---------- Routing ----------
  let current = null;
  function route() {
    const h = location.hash.replace(/^#/, '') || 'katalog';
    let reg = 'katalog', rep = null;
    if (h.startsWith('r/')) { rep = find(h.slice(2)); if (rep) reg = rep.group.reg; }
    else if (GROUPS.some((g) => g.reg === h)) reg = h;
    $$('[data-reg]').forEach((a) => { if (a.dataset.reg === reg) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const main = $('main');
    main.dataset.reg = reg;
    main.dataset.report = rep ? rep.id : '';
    current = rep;
    if (rep) { document.title = `${rep.name} · Reports · Finanz-App`; renderReport(rep); } else { document.title = 'Reports · Finanz-App'; $('#view').className = 'rview'; renderCatalog(reg); }
    const act = document.querySelector('.registers [aria-current="page"]');
    if (act) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const rerender = () => { if (current) renderReport(current); };
  RC.rerender = rerender;
  window.addEventListener('hashchange', () => { route(); window.scrollTo({ top: 0 }); });

  document.addEventListener('click', (e) => {
    let el;
    if ((el = e.target.closest('[data-step]'))) { st.k = Math.max(0, Math.min(35, st.k + +el.dataset.step)); rerender(); const b = $(`[data-step="${el.dataset.step}"]`); if (b && !b.disabled) b.focus(); else $('#monthSel').focus(); return; }
    if ((el = e.target.closest('[data-year]'))) { st.year = +el.dataset.year; rerender(); $(`[data-year="${st.year}"]`).focus(); return; }
    if ((el = e.target.closest('[data-period]'))) { st.period = el.dataset.period; rerender(); $(`[data-period="${st.period}"]`).focus(); return; }
    if (e.target.closest('[data-print]')) { window.print(); return; }
    if ((el = e.target.closest('.rcat-row')) && !e.target.closest('a')) { location.hash = el.dataset.href; }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'monthSel') { st.k = +e.target.value; rerender(); $('#monthSel').focus(); }
  });

  // ---------- Shell (mirrors app.js) ----------
  let toastTimer = null;
  function toast(text) {
    $('#toastText').textContent = text;
    $('#toastUndo').hidden = true;
    $('#toast').classList.add('is-open');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').classList.remove('is-open'), 6000);
  }
  RC.toast = toast;
  let lastFocus = null;
  RC.openPanel = (title, html, after) => {
    lastFocus = document.activeElement;
    $('#panelTitle').textContent = title;
    $('#panelBody').innerHTML = html;
    $('#panel').classList.add('is-open'); $('#scrim').classList.add('is-open');
    if (after) after($('#panelBody'));
    const f = $('#panel').querySelector('input, select, button:not([data-close])') || $('#panel [data-close]');
    if (f) f.focus();
  };
  RC.closePanel = () => {
    $('#panel').classList.remove('is-open'); $('#scrim').classList.remove('is-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  };
  document.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target.id === 'scrim') RC.closePanel(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#panel').classList.contains('is-open')) RC.closePanel(); });
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
    const first = !lastW;
    lastW = w;
    if (first) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { if (current && (!document.activeElement || !document.activeElement.matches('input, select'))) rerender(); });
  }).observe($('.sheet'));
  route();
})();
