/* Finanz-App prototype · Plan › Monat. Sample data only.
   Helpers (format, arithmetic input, theme) mirror app.js; unify them in the React build. */
(() => {
  'use strict';

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
  const CLASS_LABEL = { need: 'Bedarf', want: 'Wunsch', future: 'Zukunft' };

  // ---------- Arithmetic input (same rules as the booking field) ----------
  function normalise(raw) {
    return raw.replace(/\s/g, '').replace(/[×xX]/g, '*').replace(/[÷:]/g, '/').replace(/[−–]/g, '-').replace(/€/g, '')
      .replace(/\d[\d.,]*/g, (n) => {
        if (n.includes(',')) return n.replace(/\./g, '').replace(',', '.');
        if (/^\d{1,3}(\.\d{3})+$/.test(n)) return n.replace(/\./g, '');
        return n;
      });
  }
  function evaluate(raw) {
    const expr = normalise(raw).replace(/[+\-*/]+$/, '');
    if (!expr) return 0;
    if (/[^\d.+\-*/]/.test(expr)) return NaN;
    const neg = expr.startsWith('-');
    const toks = expr.replace(/^[+-]/, '').match(/\d+(?:\.\d*)?|\.\d+|[+\-*/]/g);
    if (!toks || toks.length % 2 === 0) return NaN;
    const vals = [parseFloat(toks[0]) * (neg ? -1 : 1)];
    const ops = [];
    for (let i = 1; i < toks.length; i += 2) {
      const op = toks[i], n = parseFloat(toks[i + 1]);
      if (!/[+\-*/]/.test(op) || !isFinite(n)) return NaN;
      if (op === '*') vals.push(vals.pop() * n);
      else if (op === '/') vals.push(n === 0 ? NaN : vals.pop() / n);
      else { ops.push(op); vals.push(n); }
    }
    let res = vals[0];
    ops.forEach((op, i) => { res = op === '+' ? res + vals[i + 1] : res - vals[i + 1]; });
    return r2(res);
  }

  // ---------- Model ----------
  const STAGES = [
    { n: 1, name: 'Fixkosten & Mindestraten', short: 'Fixkosten' },
    { n: 2, name: 'Laufender Monat', short: 'Laufend' },
    { n: 3, name: 'Liquiditätspuffer', short: 'Puffer' },
    { n: 4, name: 'Periodische Rücklagen', short: 'Rücklagen' },
    { n: 5, name: 'Notgroschen Minimum', short: 'Notgr. min.' },
    { n: 6, name: 'Teure Schulden', short: 'Teure Schulden' },
    { n: 7, name: 'Notgroschen Ziel & Sparziele', short: 'Sparziele' },
    { n: 8, name: 'Investieren', short: 'Investieren' },
    { n: 9, name: 'Günstige Schulden oder Investment', short: 'Günstig' },
  ];
  // kind: fix (due day), var (monthly available target), sink (periodic reserve), save (goal), debt, invest
  const c = (id, name, cls, group, stage, kind, target, extra = {}) => ({ id, name, cls, group, stage, kind, target, ...extra });
  const CATS = [
    c('miete', 'Miete', 'need', 'Wohnen', 1, 'fix', 890, { due: 1 }),
    c('strom', 'Strom', 'need', 'Wohnen', 1, 'fix', 105, { due: 25 }),
    c('internet', 'Internet', 'need', 'Wohnen', 1, 'fix', 60, { due: 15 }),
    c('kreditrate', 'Kreditrate (Mindestrate)', 'need', 'Kredite', 1, 'fix', 412, { due: 3 }),
    c('kfzvers', 'Kfz-Versicherung', 'need', 'Versicherungen', 1, 'fix', 48, { due: 10 }),
    c('mobilfunk', 'Mobilfunk', 'need', 'Abos', 1, 'fix', 25, { due: 22 }),
    c('streaming', 'Streaming', 'want', 'Abos', 1, 'fix', 17.99, { due: 20 }),
    c('lebensmittel', 'Lebensmittel', 'need', 'Lebensmittel', 2, 'var', 600),
    c('treibstoff', 'Treibstoff', 'need', 'Mobilität', 2, 'var', 140),
    c('oeffis', 'Öffis', 'need', 'Mobilität', 2, 'var', 45),
    c('haushalt', 'Haushalt', 'need', 'Wohnen', 2, 'var', 120),
    c('gesundheit', 'Gesundheit', 'need', 'Gesundheit', 2, 'var', 40),
    c('kleidung', 'Kleidung', 'need', 'Kleidung', 2, 'var', 50),
    c('lieferdienste', 'Lieferdienste', 'want', 'Genuss', 2, 'var', 80),
    c('freizeit', 'Freizeit', 'want', 'Freizeit', 2, 'var', 120),
    c('essen', 'Essen gehen', 'want', 'Genuss', 2, 'var', 150),
    c('hobby', 'Hobby', 'want', 'Freizeit', 2, 'var', 50),
    c('puffer', 'Puffer: nächster Monat', 'future', 'Notgroschen', 3, 'save', 300, { total: 3300, due: 'laufend' }),
    c('hhvers', 'Haushaltsversicherung (jährlich)', 'need', 'Versicherungen', 4, 'sink', 40.5, { total: 486, due: '01.2027' }),
    c('kfzservice', 'Kfz-Service', 'need', 'Mobilität', 4, 'sink', 50, { total: 600, due: '03.2027' }),
    c('weihnachten', 'Weihnachten', 'want', 'Geschenke', 4, 'sink', 50, { total: 400, due: '12.2026' }),
    c('reisen', 'Reisen', 'want', 'Reisen', 4, 'sink', 150, { total: 1800, due: '06.2027' }),
    c('geschenke', 'Geschenke', 'want', 'Geschenke', 4, 'sink', 20, { total: 240, due: 'laufend' }),
    c('notgroschen', 'Notgroschen (3 Monate)', 'future', 'Notgroschen', 5, 'save', 500, { total: 7800, due: 'Minimum' }),
    c('sondertilgung', 'Sondertilgung Kredit 6,32 %', 'future', 'Kredite', 6, 'debt', 300, { note: 'Zins über 5 %: vor Investment' }),
    c('fahrrad', 'Sparziel Fahrrad', 'future', 'Sparziele', 7, 'save', 100, { total: 1200, due: '05.2027' }),
    c('notgroschenziel', 'Notgroschen (6 Monate)', 'future', 'Notgroschen', 7, 'save', 0, { total: 15600, due: 'Ziel', note: 'wartet, bis Stufe 5 voll ist' }),
    c('etf', 'ETF-Sparplan', 'future', 'Investieren', 8, 'invest', 400, { note: 'Sparplan am 05.' }),
  ];
  const byId = (id) => CATS.find((x) => x.id === id);

  // Per-month figures: carry (Übertrag), assigned, activity (negative = spent). Pace day: 17 of 30.
  const SEP = {
    key: 'sep', title: 'September 2026', stand: 'Do 17.09.2026 · 06:30', day: 17, days: 30,
    carryIn: 0, income: [['Gehalt · 30.08.', 3812], ['Beiträge von Kontakten · Beitrag Miete', 800]],
    rows: {
      miete: [0, 890, -890], strom: [0, 105, 0], internet: [0, 60, -60], kreditrate: [0, 412, -412], kfzvers: [0, 48, -48], mobilfunk: [0, 25, 0], streaming: [0, 17.99, 0],
      lebensmittel: [28, 572, -388], treibstoff: [0, 140, -152.4], oeffis: [0, 45, 0], haushalt: [0, 120, -35.5], gesundheit: [80, 40, 0], kleidung: [200, 50, -30],
      lieferdienste: [0, 80, -62], freizeit: [0, 120, -56], essen: [0, 150, -121], hobby: [46.59, 50, 0],
      puffer: [1100, 300, 0], hhvers: [283.5, 40.5, 0], kfzservice: [250, 50, 0], weihnachten: [200, 50, 0], reisen: [100, 150, 0], geschenke: [17.01, 20, 0],
      notgroschen: [6300, 500, 0], sondertilgung: [0, 300, 0], fahrrad: [400, 100, 0], notgroschenziel: [0, 0, 0], etf: [0, 176.51, -176.51],
    },
  };
  function octFromSep() {
    const rows = {};
    for (const x of CATS) {
      const [cy, as, ac] = SEP.rows[x.id];
      const end = r2(cy + as + ac);
      // fixed costs are paid by month end; open fixed bills leave nothing over
      rows[x.id] = [x.kind === 'fix' || x.kind === 'invest' || x.kind === 'debt' ? 0 : Math.max(0, end), 0, 0];
    }
    return {
      key: 'okt', title: 'Oktober 2026', stand: 'Mi 30.09.2026 · 18:10', day: 0, days: 31,
      carryIn: 0, income: [['Gehalt · 30.09.', 3812], ['Beiträge von Kontakten · Beitrag Miete', 800]],
      rows,
    };
  }
  const months = { sep: SEP, okt: octFromSep() };
  let M = months.sep;
  const ui = { view: 'stage', distribute: false, collapsed: new Set(), editing: null };

  const carry = (id) => M.rows[id][0];
  const assigned = (id) => M.rows[id][1];
  const activity = (id) => M.rows[id][2];
  const avail = (id) => r2(carry(id) + assigned(id) + activity(id));
  const incomeSum = () => r2(M.income.reduce((a, [, v]) => a + v, 0));
  const assignedSum = () => r2(CATS.reduce((a, x) => a + assigned(x.id), 0));
  // Uncovered overspending of the previous month reduces what can be distributed now.
  const uncoveredPrev = () => (M.key === 'okt' ? r2(CATS.reduce((a, x) => { const v = r2(SEP.rows[x.id][0] + SEP.rows[x.id][1] + SEP.rows[x.id][2]); return a + (v < 0 && x.kind === 'var' ? -v : 0); }, 0)) : 0);
  const toBudget = () => r2(M.carryIn + incomeSum() - uncoveredPrev() - assignedSum());
  // What this month still needs so each envelope meets its target.
  const need = (x) => {
    if (x.kind === 'var') return Math.max(0, r2(x.target - carry(x.id) - assigned(x.id)));
    return Math.max(0, r2(x.target - assigned(x.id)));
  };
  const stageTarget = (s) => r2(CATS.filter((x) => x.stage === s).reduce((a, x) => a + (x.kind === 'var' ? Math.max(0, x.target - carry(x.id)) : x.target), 0));
  const stageAssigned = (s) => r2(CATS.filter((x) => x.stage === s).reduce((a, x) => a + assigned(x.id), 0));
  const stageNeed = (s) => r2(CATS.filter((x) => x.stage === s).reduce((a, x) => a + need(x), 0));

  // Waterfall suggestion: pour what is left top-down, stage by stage, row by row.
  function suggestions() {
    let left = Math.max(0, toBudget());
    const out = {};
    for (const st of STAGES) {
      for (const x of CATS.filter((y) => y.stage === st.n)) {
        const v = Math.min(need(x), left);
        if (v > 0.004) { out[x.id] = r2(v); left = r2(left - v); }
      }
    }
    // Stage 9 has no cheap debt, so the remainder flows into investing (stage 8).
    if (left > 0.004) out.etf = r2((out.etf || 0) + left);
    return out;
  }
  const overspent = () => CATS.filter((x) => avail(x.id) < -0.004);
  const nextStage = () => STAGES.find((st) => stageNeed(st.n) > 0.004);

  // ---------- Undo / toast ----------
  let toastTimer = null, undoFn = null;
  const snap = () => JSON.stringify(M.rows);
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
    const month = M;
    const before = snap();
    fn();
    render();
    toast(label, () => { month.rows = JSON.parse(before); render(); toast('Rückgängig gemacht.'); });
  }
  function clearToast() { undoFn = null; clearTimeout(toastTimer); $('#toast').classList.remove('is-open'); }
  const setAssigned = (id, v) => { M.rows[id][1] = r2(v); };

  // ---------- Render: head ----------
  function renderHead() {
    $('#monthTitle').textContent = M.title;
    $('#standVal').textContent = M.stand;
    $('#monthPrev').disabled = M.key === 'sep';
    $('#monthNext').disabled = M.key === 'okt';
    $('#monthPrev').title = M.key === 'sep' ? 'Im Prototyp gibt es nur September und Oktober' : '';
    $('#monthNext').title = M.key === 'okt' ? 'Im Prototyp gibt es nur September und Oktober' : '';
    $('#incomeVal').innerHTML = `${eur(incomeSum())}${icon('chevron', 'icon icon-sm')}`;

    const tb = toBudget();
    const whole = (tb < 0 ? MINUS : '') + nf0.format(Math.trunc(Math.abs(tb)));
    const cents = nf2.format(Math.abs(tb)).split(',')[1];
    $('#tbdFig').innerHTML = `<span class="${tb < -0.004 ? 'neg-alert' : ''}">${whole}<span class="cents">,${cents} €</span></span>`;
    const st = $('#tbdState');
    if (tb < -0.004) st.innerHTML = `<span class="neg-alert">${icon('alert', 'icon icon-sm')}zu viel zugewiesen</span>`;
    else if (tb > 0.004) st.innerHTML = `<span class="ink">${icon('fill', 'icon icon-sm')}bereit zum Verteilen</span>`;
    else st.innerHTML = `<span class="ok">${icon('check-circle', 'icon icon-sm')}jeder Euro hat einen Job</span>`;

    const terms = [];
    terms.push({ op: '', label: 'Übertrag', val: M.carryIn, key: null });
    terms.push({ op: '+', label: 'Einnahmen', val: incomeSum(), key: 'income' });
    if (uncoveredPrev() > 0) terms.push({ op: MINUS, label: 'Ungedeckt', val: uncoveredPrev(), key: 'uncovered' });
    terms.push({ op: MINUS, label: 'Zugewiesen', val: assignedSum(), key: 'assigned' });
    terms.push({ op: '=', label: 'Zu verteilen', val: tb, key: null, result: true });
    $('#tbdChain').innerHTML = terms.map((t) => {
      const inner = `<span class="ct-label tech">${t.label}</span><span class="ct-val${t.alert ? ' neg-alert' : ''}">${eur(t.val)}</span>`;
      const body = t.key ? `<button class="ct-term" type="button" data-term="${t.key}">${inner}</button>` : `<span class="ct-term${t.result ? ' is-result' : ''}">${inner}</span>`;
      return `<span class="ct-pair">${t.op ? `<span class="ct-op" aria-hidden="true">${t.op}</span>` : ''}${body}</span>`;
    }).join('');

    // 50/30/20 on assigned money relative to income
    const inc = incomeSum();
    const byCls = { need: 0, want: 0, future: 0 };
    CATS.forEach((x) => { byCls[x.cls] += assigned(x.id); });
    const pct = (v) => (inc ? (v / inc) * 100 : 0);
    const p = { need: pct(byCls.need), want: pct(byCls.want), future: pct(byCls.future) };
    const rest = Math.max(0, 100 - p.need - p.want - p.future);
    const okN = p.need <= 50.5, okW = p.want <= 30.5, okF = p.future >= 19.5;
    $('#splitState').innerHTML = assignedSum() === 0
      ? `<span class="muted">noch nichts zugewiesen</span>`
      : (okN && okW && okF ? `<span class="ok">${icon('check-circle', 'icon icon-sm')}im Soll</span>` : `<span class="ink">${icon('alert', 'icon icon-sm')}${!okN ? 'Bedarf über 50 %' : !okW ? 'Wunsch über 30 %' : 'Zukunft unter 20 %'}</span>`);
    $('#splitBand').innerHTML = `
      <div class="sb-scale" aria-hidden="true"><span style="left:50%">50</span><span style="left:80%">80</span><span style="left:100%">100 %</span></div>
      <div class="sb-bar" role="img" aria-label="Zugewiesen: Bedarf ${nf0.format(p.need)} %, Wunsch ${nf0.format(p.want)} %, Zukunft ${nf0.format(p.future)} % der Einnahmen. Soll 50, 30, 20.">
        <span class="sb-seg hatch-need" style="width:${Math.min(p.need, 100)}%"></span><span class="sb-seg hatch-want" style="width:${Math.min(p.want, 100)}%"></span><span class="sb-seg hatch-future" style="width:${Math.min(p.future, 100)}%"></span>${rest > 0.3 ? `<span class="sb-seg sb-rest" style="width:${rest}%"></span>` : ''}
        <i class="sb-mark" style="left:50%"></i><i class="sb-mark" style="left:80%"></i>
      </div>
      <div class="sb-legend">
        <span><i class="sw hatch-need"></i>Bedarf <b>${nf0.format(p.need)} %</b></span>
        <span><i class="sw hatch-want"></i>Wunsch <b>${nf0.format(p.want)} %</b></span>
        <span><i class="sw hatch-future"></i>Zukunft <b>${nf0.format(p.future)} %</b></span>
      </div>`;
  }

  // ---------- Render: triage (a state above the unchanged table) ----------
  function coverSource(x) {
    const amount = -avail(x.id);
    const pool = CATS.filter((y) => y.id !== x.id && y.stage === 2 && avail(y.id) >= amount);
    pool.sort((a, b) => (a.cls === 'want' ? -1 : 1) - (b.cls === 'want' ? -1 : 1) || avail(b.id) - avail(a.id));
    return pool[0] || CATS.filter((y) => y.id !== x.id && avail(y.id) >= amount).sort((a, b) => avail(b.id) - avail(a.id))[0];
  }
  function renderTriage() {
    const over = overspent();
    const tb = toBudget();
    const sec = $('#triage');
    const rows = [];
    let letter = 65;
    over.forEach((x) => {
      const src = coverSource(x);
      const opts = CATS.filter((y) => y.id !== x.id && avail(y.id) > 0).map((y) => `<option value="${y.id}"${src && y.id === src.id ? ' selected' : ''}>${esc(y.name)} · ${eur(avail(y.id))}</option>`).join('');
      rows.push(`<tr class="rev-row is-urgent">
        <td class="rev-mark">${revTri(String.fromCharCode(letter++))}</td>
        <td class="rev-what"><strong>${esc(x.name)} ist überzogen</strong><span>${eur(avail(x.id))} · Stufe ${x.stage} ${esc(STAGES[x.stage - 1].short)}</span></td>
        <td class="rev-src"><label class="sr-only" for="src-${x.id}">Aus Envelope</label><select class="select select-sm" id="src-${x.id}" data-src-for="${x.id}">${opts}</select></td>
        <td class="rev-act"><button class="btn btn-sm btn-alert" type="button" data-cover="${x.id}">Decken</button></td>
      </tr>`);
    });
    if (tb < -0.004) {
      rows.push(`<tr class="rev-row is-urgent">
        <td class="rev-mark">${revTri(String.fromCharCode(letter++))}</td>
        <td class="rev-what"><strong>Zu viel zugewiesen</strong><span>${eur(tb)} · von unten nach oben zurücknehmen, ab der tiefsten Stufe</span></td>
        <td class="rev-src"><span class="muted">Stufen ${bottomStagesLabel(-tb)}</span></td>
        <td class="rev-act"><button class="btn btn-sm btn-alert" type="button" data-unassign>Zurücknehmen</button></td>
      </tr>`);
    }
    sec.hidden = rows.length === 0;
    $('#triageBody').innerHTML = rows.join('');
    $('#triageNote').textContent = rows.length && tb > 0.004 ? 'Erst decken, dann verteilen.' : rows.length ? `${rows.length} offen` : '';
    // The red badge counts only what needs action (overspent, due but not covered), not normal distribution work.
    const urgent = triageGroups().filter((g) => g.key !== 'xmiss').reduce((a, g) => a + g.items.length, 0);
    $('#triageCount').textContent = urgent ? String(urgent) : '';
    $('#triageCount').hidden = !urgent;
  }
  const revTri = (id) => `<svg class="rev-tri" viewBox="0 0 26 24" aria-hidden="true"><path d="M13 2.5 24 21.5H2Z"/><text x="13" y="18" text-anchor="middle">${id}</text></svg>`;
  function unassignPlan(amount) {
    // take back from the lowest stages first, bottom row first
    const plan = [];
    let left = amount;
    for (const st of [...STAGES].reverse()) {
      for (const x of CATS.filter((y) => y.stage === st.n).reverse()) {
        if (left <= 0.004) break;
        const take = Math.min(assigned(x.id), left);
        if (take > 0.004) { plan.push([x.id, r2(take)]); left = r2(left - take); }
      }
    }
    return plan;
  }
  const bottomStagesLabel = (amount) => [...new Set(unassignPlan(amount).map(([id]) => byId(id).stage))].join(', ');

  // ---------- Render: rail ----------
  const targetOf = (x) => (x.kind === 'var' ? Math.max(0, r2(x.target - carry(x.id))) : x.target);
  const groupStats = (items) => {
    const target = r2(items.reduce((a, x) => a + targetOf(x), 0));
    const got = r2(items.reduce((a, x) => a + assigned(x.id), 0));
    const miss = r2(items.reduce((a, x) => a + need(x), 0));
    return { target, got, miss };
  };
  function renderRail() {
    const view = ui.view;
    const groups = groupsFor(view);
    const waterfall = view === 'stage';
    const nx = waterfall ? nextStage() : null;
    $('#railNav').setAttribute('aria-label', { stage: 'Wasserfall-Stufen', time: 'Fälligkeiten', group: 'Gruppen', class: 'Klassen', triage: 'Triage' }[view]);
    $('#rail').classList.toggle('is-flow', waterfall);
    const items = groups.map((g) => {
      const { target, got, miss } = groupStats(g.items);
      const empty = !g.items.length;
      const over = g.items.filter((x) => avail(x.id) < -0.004).length;
      const fill = target > 0 ? Math.min(1, got / target) : empty ? 0 : 1;
      const state = empty ? 'none' : over ? 'over' : miss <= 0.004 ? 'full' : got > 0.004 ? 'part' : 'empty';
      const isNext = nx && g.stage === nx.n;
      const level = isNext ? `<li class="rail-level" aria-hidden="true"><svg viewBox="0 0 12 10"><path d="M0.5 0.5h11L6 9.5Z"/></svg><span>Wasserstand</span></li>` : '';
      const statusTxt = empty ? (g.emptyText || 'keine Posten') : over ? `${over} überzogen` : miss <= 0.004 ? 'gedeckt' : `fehlt ${eur(miss)}`;
      const status = empty ? statusTxt : over ? `<span class="neg-alert">${statusTxt}</span>` : miss <= 0.004 ? `${icon('check', 'icon icon-sm')}gedeckt` : statusTxt;
      return `${level}<li class="rail-item is-${state}${isNext ? ' is-next' : ''}">
        <button type="button" class="rail-btn" data-jump="${esc(g.key)}" aria-label="${esc(g.title)}: ${statusTxt}${isNext ? ', hier endet das Geld' : ''}">
          <span class="rail-no">${g.no}</span>
          <span class="rail-name">${esc(g.title)}${g.sub ? `<small>${esc(g.sub)}</small>` : ''}</span>
          <span class="rail-fill" aria-hidden="true"><i style="width:${fill * 100}%"></i></span>
          <span class="rail-status">${status}</span>
        </button>
      </li>`;
    }).join('');
    const unc = uncoveredPrev();
    const head = `<li class="rail-io"><span class="tech">Zufluss</span><strong>${eur(incomeSum())}</strong></li>${unc > 0 ? `<li class="rail-io rail-io-sub"><span class="tech">Ungedeckt Sep.</span><strong>${eur(-unc)}</strong></li>` : ''}`;
    const foot = `<li class="rail-io"><span class="tech">Noch frei</span><strong class="${toBudget() < -0.004 ? 'neg-alert' : ''}">${eur(toBudget())}</strong></li>`;
    const none = view === 'triage' && !groups.some((g) => g.items.length) ? `<li class="rail-empty">${icon('check-circle')}Nichts offen.</li>` : '';
    $('#rail').innerHTML = head + (none || items) + foot;
  }

  // ---------- Time view: next required payment first, open-ended budgets last ----------
  const TODAY = { sep: new Date(2026, 8, 17), okt: new Date(2026, 8, 30) };
  const MONTH0 = { sep: 8, okt: 9 };
  const fmtDate = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
  function dueDate(x) {
    const m0 = MONTH0[M.key];
    if (x.kind === 'fix' || x.kind === 'invest') {
      const day = x.kind === 'invest' ? 5 : x.due;
      const paid = activity(x.id) < 0;
      return new Date(2026, paid ? m0 + 1 : m0, day);
    }
    if ((x.kind === 'sink' || x.kind === 'save') && /^\d{2}\.\d{4}$/.test(x.due || '')) {
      const [mm, yy] = x.due.split('.');
      return new Date(+yy, +mm - 1, 1);
    }
    return null;
  }
  function timeGroups() {
    const today = TODAY[M.key];
    const in14 = new Date(today); in14.setDate(in14.getDate() + 14);
    const endNext = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    const buckets = [
      { key: 't14', title: 'Nächste 14 Tage', sub: `bis ${fmtDate(in14)}`, items: [] },
      { key: 'tnext', title: 'Bis Ende nächsten Monats', sub: `bis ${fmtDate(endNext)}`, items: [] },
      { key: 'tlater', title: 'Später', sub: 'mit Termin', items: [] },
      { key: 'topen', title: 'Ohne festen Termin', sub: 'Sparen, Puffer, Tilgung', items: [] },
      { key: 'trun', title: 'Laufend', sub: 'variable Monatsbudgets', items: [] },
    ];
    const dated = CATS.map((x) => ({ x, d: dueDate(x) }));
    dated.sort((a, b) => (a.d && b.d ? a.d - b.d : a.d ? -1 : b.d ? 1 : 0));
    for (const { x, d } of dated) {
      if (x.kind === 'var') buckets[4].items.push(x);
      else if (!d) buckets[3].items.push(x);
      else if (d <= in14) buckets[0].items.push(x);
      else if (d <= endNext) buckets[1].items.push(x);
      else buckets[2].items.push(x);
    }
    return buckets.map((b, i) => ({ ...b, no: i + 1, emptyText: 'nichts fällig' }));
  }

  // ---------- Triage view: what needs a decision, most urgent first ----------
  function triageItems() {
    return CATS.filter((x) => avail(x.id) < -0.004 || (x.kind === 'fix' && activity(x.id) === 0 && avail(x.id) < x.target - 0.004) || need(x) > 0.004);
  }
  function triageGroups() {
    const over = CATS.filter((x) => avail(x.id) < -0.004);
    const dueShort = CATS.filter((x) => !over.includes(x) && x.kind === 'fix' && activity(x.id) === 0 && avail(x.id) < x.target - 0.004);
    const missing = CATS.filter((x) => !over.includes(x) && !dueShort.includes(x) && need(x) > 0.004);
    return [
      { key: 'xover', title: 'Überzogen', sub: 'aus anderem Envelope decken', items: over, emptyText: 'nichts überzogen' },
      { key: 'xdue', title: 'Fällig, nicht gedeckt', sub: 'Rechnung kommt, Geld fehlt', items: dueShort, emptyText: 'alles gedeckt' },
      { key: 'xmiss', title: 'Fehlt zum Ziel', sub: 'in Wasserfall-Reihenfolge', items: missing, emptyText: 'alle Ziele erreicht' },
    ].map((g, i) => ({ ...g, no: i + 1 }));
  }

  // ---------- Render: table (parts list) ----------
  function barFor(x) {
    const a = avail(x.id);
    if (x.kind === 'var') {
      const base = carry(x.id) + assigned(x.id);
      const spent = -activity(x.id);
      const over = a < -0.004;
      const fill = base > 0 ? Math.min(1, spent / base) : spent > 0 ? 1 : 0;
      const pace = M.day > 0 ? M.day / M.days : null;
      const meta = M.day > 0
        ? (over ? `${eur(spent)} von ${eur(base)} · ${eur(-a)} überzogen` : `${eur(spent)} von ${eur(base)} ausgegeben${pace !== null && fill > pace + 0.08 ? ' · über Pace' : ''}`)
        : `Ziel ${eur(x.target)} verfügbar${carry(x.id) > 0 ? ` · Übertrag ${eur(carry(x.id))}` : ''}`;
      return `<span class="pbar${over ? ' is-over' : ''}" aria-hidden="true"><i class="pbar-fill hatch-${x.cls}" style="width:${(over ? 1 : fill) * 100}%"></i>${pace !== null ? `<i class="pbar-tick" style="left:${pace * 100}%"></i>` : ''}</span><span class="pmeta">${meta}</span>`;
    }
    if (x.kind === 'fix') {
      const paid = activity(x.id) < 0;
      return `<span class="pmeta">${paid ? `${icon('check', 'icon icon-xs')}bezahlt am ${String(x.due).padStart(2, '0')}. · nächste am ${fmtDate(dueDate(x))}` : `${icon('clock', 'icon icon-xs')}fällig am ${String(x.due).padStart(2, '0')}.`}</span>`;
    }
    if (x.kind === 'sink' || x.kind === 'save') {
      if (!x.total) return `<span class="pmeta">${esc(x.note || '')}</span>`;
      const have = carry(x.id) + assigned(x.id);
      const fill = Math.min(1, have / x.total);
      return `<span class="pbar" aria-hidden="true"><i class="pbar-fill hatch-${x.cls}" style="width:${fill * 100}%"></i><i class="pbar-goal" style="left:100%"></i></span><span class="pmeta">${eur(have)} von ${eur(x.total)} · ${x.due === 'laufend' || x.due === 'Minimum' || x.due === 'Ziel' ? x.due : 'bis ' + x.due}${x.note ? ' · ' + esc(x.note) : ''}</span>`;
    }
    if (x.kind === 'invest') {
      const have = assigned(x.id);
      const fill = x.target > 0 ? Math.min(1, have / x.target) : 0;
      const gap = Math.max(0, r2(x.target - have));
      return `<span class="pbar" aria-hidden="true"><i class="pbar-fill hatch-${x.cls}" style="width:${fill * 100}%"></i><i class="pbar-goal" style="left:100%"></i></span><span class="pmeta">${eur(have)} von ${eur(x.target)}${gap > 0.004 ? ` · fehlt ${eur(gap)}` : ''} · nächste Ausführung ${fmtDate(dueDate(x))}</span>`;
    }
    return `<span class="pmeta">${esc(x.note || '')}</span>`;
  }
  function rowHtml(x, pos, sug) {
    const a = avail(x.id);
    const over = a < -0.004;
    const editing = ui.editing === x.id;
    const s = sug[x.id];
    return `<tr class="prow${over ? ' is-over' : ''}" data-row="${x.id}">
      <td class="col-pos"><span class="pos">${pos}</span>${over ? revTri('!') : ''}</td>
      <td class="col-name">
        <button class="pname" type="button" data-open-cat="${x.id}"><span class="sw hatch-${x.cls}" aria-hidden="true"></span>${esc(x.name)}<span class="env-class">${CLASS_LABEL[x.cls]}</span></button>
        ${barFor(x)}
      </td>
      <td class="col-num col-assign" data-label="Zugewiesen">
        ${editing
          ? `<input class="assign-input" id="assign-${x.id}" inputmode="decimal" autocomplete="off" value="${nf2.format(assigned(x.id))}" aria-label="Zugewiesen für ${esc(x.name)}. Rechnen erlaubt, +50 addiert.">`
          : `<button class="assign-btn" type="button" data-assign="${x.id}" aria-label="Zugewiesen ${eur(assigned(x.id))} für ${esc(x.name)} ändern">${eur(assigned(x.id))}</button>`}
        ${s && ui.distribute ? `<button class="ghost" type="button" data-take="${x.id}" aria-label="Vorschlag ${eur(s)} für ${esc(x.name)} übernehmen">+${nf2.format(s)}</button>` : ''}
      </td>
      <td class="col-num col-act" data-label="Aktivität">${activity(x.id) ? eur(activity(x.id)) : '<span class="muted">0,00 €</span>'}</td>
      <td class="col-num col-avail${over ? ' neg-alert' : ''}" data-label="Verfügbar">${eur(a)}</td>
    </tr>`;
  }
  function groupsFor(view) {
    if (view === 'stage') return STAGES.map((st) => ({ key: `s${st.n}`, no: st.n, title: st.name, items: CATS.filter((x) => x.stage === st.n), stage: st.n, emptyText: 'keine Posten' }));
    if (view === 'time') return timeGroups();
    if (view === 'triage') return triageGroups();
    if (view === 'class') return ['need', 'want', 'future'].map((k, i) => ({ key: k, no: i + 1, title: CLASS_LABEL[k], items: CATS.filter((x) => x.cls === k) }));
    const names = [...new Set(CATS.map((x) => x.group))];
    return names.map((g, i) => ({ key: g, no: i + 1, title: g, items: CATS.filter((x) => x.group === g) }));
  }
  function renderTable() {
    const sug = ui.distribute ? suggestions() : {};
    const html = [];
    for (const g of groupsFor(ui.view)) {
      const items = g.items;
      const sumA = r2(g.items.reduce((a, x) => a + assigned(x.id), 0));
      const sumAct = r2(g.items.reduce((a, x) => a + activity(x.id), 0));
      const sumAv = r2(g.items.reduce((a, x) => a + avail(x.id), 0));
      const collapsed = ui.collapsed.has(g.key);
      const sugSum = r2(g.items.reduce((a, x) => a + (sug[x.id] || 0), 0));
      const miss = groupStats(g.items).miss;
      const overN = g.items.filter((x) => avail(x.id) < -0.004).length;
      const status = !g.items.length ? (g.emptyText || 'keine Posten') : overN ? `<span class="neg-alert">${overN} überzogen</span>` : miss <= 0.004 ? `${icon('check', 'icon icon-xs')}gedeckt` : `fehlt ${eur(miss)}`;
      html.push(`<tr class="pgroup${collapsed ? ' is-collapsed' : ''}" id="grp-${esc(g.key)}" data-group="${esc(g.key)}">
        <td class="col-pos"><span class="grp-no">${g.no}</span></td>
        <td class="col-name">
          <button class="grp-toggle" type="button" data-toggle="${esc(g.key)}" aria-expanded="${!collapsed}">${icon('chevron-down', 'icon icon-sm')}<span class="grp-title">${esc(g.title)}</span>${g.sub ? `<span class="grp-sub">${esc(g.sub)}</span>` : ''}</button>
          ${status ? `<span class="grp-status">${status}</span>` : ''}
          ${ui.distribute && sugSum > 0 ? `<button class="btn btn-ghost btn-xs" type="button" data-take-stage="${g.key}">Stufe übernehmen · ${eur(sugSum)}</button>` : ''}
        </td>
        <td class="col-num col-assign" data-label="Zugewiesen">${eur(sumA)}</td>
        <td class="col-num col-act" data-label="Aktivität">${eur(sumAct)}</td>
        <td class="col-num col-avail" data-label="Verfügbar">${eur(sumAv)}</td>
      </tr>`);
      if (!g.items.length) {
        if (g.stage === 9) html.push(`<tr class="prow is-empty"><td class="col-pos"></td><td class="col-name" colspan="4"><span class="pmeta">Keine günstigen Schulden. Was übrig bleibt, geht in Stufe 8.</span></td></tr>`);
        continue;
      }
      if (collapsed) continue;
      items.forEach((x) => html.push(rowHtml(x, `${g.no}.${g.items.indexOf(x) + 1}`, sug)));
    }
    $('#ptbody').innerHTML = html.join('');
    if (ui.editing) {
      const inp = $(`#assign-${ui.editing}`);
      if (inp) { inp.focus(); inp.select(); }
    }
    // distribute actions
    const tb = toBudget();
    const total = r2(Object.values(sug).reduce((a, v) => a + v, 0));
    $('#distActions').innerHTML = ui.distribute
      ? `<span class="dist-left">noch ${eur(tb)}</span>${total > 0 ? `<button class="btn btn-primary btn-sm" type="button" data-take-all>Alle übernehmen · ${eur(total)}</button>` : ''}<button class="btn btn-ghost btn-sm" type="button" data-dist-end>Fertig</button>`
      : `<button class="btn ${tb > 0.004 && !overspent().length ? 'btn-primary' : 'btn-ghost'} btn-sm" type="button" data-dist-start${tb <= 0.004 ? ' disabled title="Nichts zu verteilen"' : ''}>${icon('fill', 'icon icon-sm')}Geld verteilen</button>`;
    $('.ptable').classList.toggle('is-distributing', ui.distribute);
  }

  function render() {
    renderHead();
    renderTriage();
    renderRail();
    renderTable();
  }

  // ---------- Actions ----------
  function commitAssign(id, raw) {
    const cur = assigned(id);
    const t = raw.trim();
    let v = /^[+\-−]/.test(t) ? r2(cur + evaluate(t)) : evaluate(t);
    ui.editing = null;
    if (!isFinite(v) || v < 0) { render(); toast('Das lässt sich nicht als Betrag lesen.'); return; }
    if (Math.abs(v - cur) < 0.005) { render(); return; }
    change(`${byId(id).name}: ${eur(cur)} → ${eur(v)} zugewiesen`, () => setAssigned(id, v));
  }
  function cover(id, srcId) {
    const x = byId(id), src = byId(srcId);
    const amount = -avail(id);
    if (!src || amount <= 0) return;
    const move = Math.min(amount, Math.max(0, avail(srcId)));
    change(`${eur(move)} von ${src.name} zu ${x.name} verschoben`, () => {
      setAssigned(srcId, assigned(srcId) - move);
      setAssigned(id, assigned(id) + move);
    });
  }
  function takeSuggestions(ids) {
    const sug = suggestions();
    const list = ids.filter((id) => sug[id]);
    if (!list.length) return;
    const sum = r2(list.reduce((a, id) => a + sug[id], 0));
    change(`${eur(sum)} verteilt`, () => {
      list.forEach((id) => setAssigned(id, assigned(id) + sug[id]));
      if (toBudget() <= 0.004) ui.distribute = false;
    });
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    const q = (sel) => t.closest(sel);
    let el;
    if ((el = q('[data-assign]'))) { ui.editing = el.dataset.assign; renderTable(); return; }
    if ((el = q('[data-take]'))) { takeSuggestions([el.dataset.take]); return; }
    if ((el = q('[data-take-stage]'))) { const g = groupsFor(ui.view).find((x) => x.key === el.dataset.takeStage); takeSuggestions(g.items.map((x) => x.id)); return; }
    if (q('[data-take-all]')) { takeSuggestions(CATS.map((x) => x.id)); return; }
    if (q('[data-dist-start]')) { ui.distribute = true; ui.view = 'stage'; syncView(); renderRail(); renderTable(); return; }
    if (q('[data-dist-end]')) { ui.distribute = false; renderTable(); return; }
    if ((el = q('[data-toggle]'))) { const k = el.dataset.toggle; ui.collapsed.has(k) ? ui.collapsed.delete(k) : ui.collapsed.add(k); renderTable(); return; }
    if ((el = q('[data-cover]'))) { const sel = $(`[data-src-for="${el.dataset.cover}"]`); cover(el.dataset.cover, sel && sel.value); return; }
    if (q('[data-unassign]')) {
      const plan = unassignPlan(-toBudget());
      change(`${eur(-toBudget())} zurückgenommen`, () => plan.forEach(([id, v]) => setAssigned(id, assigned(id) - v)));
      return;
    }
    if ((el = q('[data-jump]'))) {
      const k = el.dataset.jump;
      ui.collapsed.delete(k); renderTable();
      const row = document.getElementById(`grp-${k}`);
      if (row) { row.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); row.classList.add('is-flash'); setTimeout(() => row.classList.remove('is-flash'), 900); }
      return;
    }
    if ((el = q('[data-open-cat]'))) { openCat(el.dataset.openCat); return; }
    if ((el = q('[data-term]'))) { openTerm(el.dataset.term); return; }
    if (q('[data-open-income]')) { openTerm('income'); return; }
    if ((el = q('[data-view]'))) { ui.view = el.dataset.view; syncView(); renderRail(); renderTable(); return; }
    if (q('[data-open-booking]')) { location.href = 'index.html#buchung'; return; }
    if (q('[data-open="inbox"]')) { location.href = 'konten.html#posteingang'; return; }
    if ((el = q('[data-soon]'))) { e.preventDefault(); toast(`„${el.dataset.soon}“ ist im Prototyp noch nicht gebaut.`); }
  });
  function syncView() { $$('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === ui.view)); }

  document.addEventListener('keydown', (e) => {
    const inp = e.target.closest && e.target.closest('.assign-input');
    if (inp) {
      const id = inp.id.replace('assign-', '');
      if (e.key === 'Enter') { e.preventDefault(); commitAssign(id, inp.value); }
      if (e.key === 'Escape') { e.preventDefault(); ui.editing = null; renderTable(); $(`[data-assign="${id}"]`)?.focus(); }
      return;
    }
    if (e.key === 'Escape' && $('#panel').classList.contains('is-open')) closePanel();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#search').focus(); }
  });
  document.addEventListener('focusout', (e) => {
    const inp = e.target.closest && e.target.closest('.assign-input');
    if (inp && ui.editing) commitAssign(inp.id.replace('assign-', ''), inp.value);
  });

  $('#monthPrev').addEventListener('click', () => { clearToast(); M = months.sep; ui.distribute = false; ui.editing = null; render(); });
  $('#monthNext').addEventListener('click', () => { clearToast(); M = months.okt; ui.editing = null; render(); });

  // ---------- Panel ----------
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
  const kvRows = (rows, total) => `<div class="kv" style="border-top:0"><span class="tech">Posten</span><span class="tech">Betrag</span></div>` +
    rows.map(([a, b]) => `<div class="kv"><span>${esc(a)}</span><span>${b}</span></div>`).join('') +
    (total ? `<div class="kv" style="border-top:1.5px solid var(--line)"><span style="color:var(--ink);font-weight:600">${esc(total[0])}</span><span>${total[1]}</span></div>` : '');

  function openTerm(key) {
    if (key === 'income') {
      openPanel(`Einnahmen · ${M.title}`, `<p class="panel-sub">Nach Einnahmenart. Erwartete Einnahmen zählen erst, wenn sie eingegangen sind.</p>${kvRows(M.income.map(([n, v]) => [n, eur(v)]), ['= Einnahmen', eur(incomeSum())])}`);
    } else if (key === 'assigned') {
      openPanel('Zugewiesen je Stufe', `<p class="panel-sub">Was diesen Monat jeder Stufe des Wasserfalls zugewiesen ist.</p>${kvRows(STAGES.map((st) => [`${st.n} ${st.name}`, eur(stageAssigned(st.n))]), ['= Zugewiesen', eur(assignedSum())])}`);
    } else if (key === 'uncovered') {
      openPanel('Ungedeckt aus September', `<p class="panel-sub">Überziehungen, die im September nicht gedeckt wurden, mindern „Zu verteilen“ im Oktober.</p>${kvRows(CATS.filter((x) => r2(SEP.rows[x.id].reduce((a, b) => a + b, 0)) < 0).map((x) => [x.name, eur(r2(SEP.rows[x.id].reduce((a, b) => a + b, 0)))]), ['= Ungedeckt', eur(-uncoveredPrev())])}`);
    }
  }

  function history(x) {
    // deterministic 12-month sample: plan mark vs actual bar (bullet bars)
    let seed = [...x.id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const planV = x.target || 50;
    return Array.from({ length: 12 }, (_, i) => ({ m: ['Okt', 'Nov', 'Dez', 'Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep'][i], plan: planV, act: x.kind === 'fix' ? planV : planV * (0.65 + rnd() * 0.55) }));
  }
  function openCat(id) {
    const x = byId(id);
    const a = avail(id);
    const over = a < -0.004;
    const h = history(x);
    const max = Math.max(...h.map((d) => Math.max(d.plan, d.act))) * 1.1;
    const goalText = x.kind === 'var' ? `${eur(x.target)} pro Monat verfügbar halten`
      : x.kind === 'fix' ? `${eur(x.target)} am ${String(x.due).padStart(2, '0')}. jedes Monats`
        : x.total ? `${eur(x.total)} ${['laufend', 'Minimum', 'Ziel'].includes(x.due) ? '· ' + x.due : 'bis ' + x.due}, Monatsrate ${eur(x.target)}` : `${eur(x.target)} pro Monat`;
    openPanel(x.name, `
      <div class="panel-graticule" aria-hidden="true"></div>
      <div class="big${over ? ' neg-alert' : ''}">${eur(a)}</div>
      <p class="panel-sub">Verfügbar im ${M.title.split(' ')[0]} · ${CLASS_LABEL[x.cls]} · Stufe ${x.stage} ${esc(STAGES[x.stage - 1].name)} · Gruppe ${esc(x.group)}</p>
      ${kvRows([['Übertrag', eur(carry(id))], ['Zugewiesen', eur(assigned(id), { sign: true })], ['Aktivität', eur(activity(id))]], ['= Verfügbar', eur(a)])}
      <h3 class="panel-h">Zuweisen</h3>
      <div class="amount-field amount-field-sm">
        <div class="ops" role="group" aria-label="Rechenzeichen einfügen">
          <button type="button" data-pop="+" aria-label="plus">+</button><button type="button" data-pop="-" aria-label="minus">−</button><button type="button" data-pop="*" aria-label="mal">×</button><button type="button" data-pop="/" aria-label="geteilt durch">÷</button>
        </div>
        <input class="amount-input" id="panelAssign" inputmode="decimal" autocomplete="off" value="${nf2.format(assigned(id))}" aria-label="Zugewiesen für ${esc(x.name)}. Rechnen erlaubt, +50 addiert.">
        <span class="amount-cur" aria-hidden="true">€</span>
      </div>
      <div class="amount-hint" id="panelHint">Rechnen direkt im Feld, +50 addiert. Enter übernimmt.</div>
      <div class="panel-actions"><button class="btn btn-primary" type="button" id="panelAssignSave">Übernehmen</button>${need(x) > 0.004 && toBudget() > 0.004 ? `<button class="btn btn-ghost" type="button" id="panelFill">Ziel füllen · ${eur(Math.min(need(x), toBudget()))}</button>` : ''}</div>
      <h3 class="panel-h">Ziel</h3>
      <p class="panel-sub">${goalText}</p>
      <h3 class="panel-h">Verlauf · 12 Monate</h3>
      <svg class="hist" viewBox="0 0 360 96" role="img" aria-label="Plan gegen Ist der letzten 12 Monate">
        ${h.map((d, i) => { const bx = 6 + i * 29.5; const ah = (d.act / max) * 70; const py = 78 - (d.plan / max) * 70; return `<rect x="${bx}" y="${78 - ah}" width="14" height="${ah}" class="hist-bar${d.act > d.plan * 1.02 ? ' is-over' : ''}"/><line x1="${bx - 3}" x2="${bx + 17}" y1="${py}" y2="${py}" class="hist-plan" stroke-dasharray="7 5"/><text x="${bx + 7}" y="92" text-anchor="middle" class="svg-label">${d.m}</text>`; }).join('')}
      </svg>
      <p class="panel-sub small">Balken: Ist, dunkler über Plan · Strichlinie: Plan</p>
      <h3 class="panel-h">Notiz</h3>
      <input class="input" placeholder="Optional">
    `, (body) => {
      const save = () => { const inp = $('#panelAssign', body); const t = inp.value.trim(); const cur = assigned(id); const v = /^[+\-−]/.test(t) ? r2(cur + evaluate(t)) : evaluate(t); if (!isFinite(v) || v < 0) { inp.setAttribute('aria-invalid', 'true'); return; } closePanel(); if (Math.abs(v - cur) > 0.004) change(`${x.name}: ${eur(cur)} → ${eur(v)} zugewiesen`, () => setAssigned(id, v)); };
      $('#panelAssignSave', body).addEventListener('click', save);
      const inp = $('#panelAssign', body), hint = $('#panelHint', body);
      const hasOp = (raw) => /\d\s*[+\-*/×÷x:−]\s*\d/.test(raw) || /^[+\-−]\s*\d/.test(raw.trim());
      const upd = () => {
        const t = inp.value.trim();
        const v = /^[+\-−]/.test(t) ? r2(assigned(id) + evaluate(t)) : evaluate(t);
        inp.removeAttribute('aria-invalid');
        if (t && !isFinite(v)) hint.textContent = 'Das lässt sich nicht ausrechnen. Erlaubt sind Zahlen und + − × ÷.';
        else if (hasOp(t)) hint.textContent = `= ${nf2.format(v)} €  ·  Enter übernimmt`;
        else hint.textContent = 'Rechnen direkt im Feld, +50 addiert. Enter übernimmt.';
        hint.classList.toggle('is-result', hasOp(t) && isFinite(v));
      };
      inp.addEventListener('input', upd);
      $$('[data-pop]', body).forEach((b) => {
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => {
          const st = inp.selectionStart ?? inp.value.length, en = inp.selectionEnd ?? inp.value.length;
          const ch = { '+': '+', '-': '−', '*': '×', '/': '÷' }[b.dataset.pop];
          inp.value = inp.value.slice(0, st) + ch + inp.value.slice(en);
          inp.focus(); inp.setSelectionRange(st + 1, st + 1); upd();
        });
      });
      $('#panelAssign', body).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      const fill = $('#panelFill', body);
      if (fill) fill.addEventListener('click', () => { const v = Math.min(need(x), toBudget()); closePanel(); change(`${x.name}: Ziel mit ${eur(v)} gefüllt`, () => setAssigned(id, assigned(id) + v)); });
    });
  }

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
  const toggleTheme = () => { const next = isDark() ? 'light' : 'dark'; document.documentElement.dataset.theme = next; try { localStorage.setItem('fa-theme', next); } catch (e) { /* storage unavailable */ } syncThemeBtns(); };
  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#themeBtnM').addEventListener('click', toggleTheme);
  darkMQ.addEventListener('change', syncThemeBtns);
  syncThemeBtns();
  $('#collapseBtn').addEventListener('click', () => {
    const c2 = $('#app').classList.toggle('is-collapsed');
    $('#collapseBtn').setAttribute('aria-expanded', !c2);
    try { localStorage.setItem('fa-collapsed', c2 ? '1' : ''); } catch (e) { /* storage unavailable */ }
  });
  try { if (localStorage.getItem('fa-collapsed')) $('#app').classList.add('is-collapsed'); } catch (e) { /* storage unavailable */ }
  $('#search').addEventListener('keydown', (e) => { if (e.key === 'Enter') toast('Die Suche ist im Prototyp nicht verbunden.'); });
  $$('[data-inbox-count]').forEach((el) => { el.textContent = '9'; });

  if (location.hash === '#oktober') M = months.okt;
  // Narrow screens: keep the active register and view in view so their badges are never cut.
  const keepActiveVisible = () => { $$('.registers [aria-current="page"], .ptoolbar .seg [aria-pressed="true"]').forEach((el) => el.scrollIntoView({ block: 'nearest', inline: 'nearest' })); };
  window.addEventListener('hashchange', keepActiveVisible);
  document.addEventListener('click', (e) => { if (e.target.closest('[data-view]')) setTimeout(keepActiveVisible, 0); });
  render();
  keepActiveVisible();
})();
