import { addDays, addMonths, monthOf } from '../date';
import { evenDaily, liquidityForecast, lowPoint } from '../forecast';
import {
  ageOfMoney,
  cardCovered,
  classShares,
  debtOrder,
  debtServiceRatio,
  emergencyCoverage,
  fixedCostRatio,
  lifestyleInflation,
  payYourselfFirst,
  ratioBp,
  sinkingFundsCovered,
  windfallCheck,
} from '../kpi';
import { cents as toCents, formatEuro, MINUS } from '../money';
import {
  allocationStatus,
  clusterRisk,
  freedomProgressBp,
  freedomTargetCents,
  speculativeShare,
} from '../wealth';
import { resolveParams, type RuleCode, type RuleParams } from './params';
import type { RuleEvaluation, RuleInputs, RuleStatus } from './types';

/**
 * The rule engine (concept §3.5): `evaluateRule` maps one rule code onto the pure KPI, forecast and
 * wealth functions and turns their facts into erfüllt / Warnung / verletzt with the figure as the
 * prototype shows it. A rule without data returns `null` ("nicht bewertbar"). No arithmetic of its
 * own beyond comparing with the thresholds: integer cents and basis points throughout.
 */

// ---- formatting (de-AT) ----

const tenthsOf = (bp: number): number => Math.floor((Math.abs(bp) + 5) / 10);

/** `14,2 %` from basis points; real minus; optional `+`. */
export function formatPercent(bp: number, sign = false): string {
  const t = tenthsOf(bp);
  const body = `${Math.trunc(t / 10)},${t % 10}`;
  const prefix = t === 0 ? '' : bp < 0 ? MINUS : sign ? '+' : '';
  return `${prefix}${body} %`;
}

/** `−4,0 Pp` from basis points of percentage points. */
const formatPoints = (bp: number): string => formatPercent(bp, true).replace(/ %$/, ' Pp');

const eur = (value: number): string => formatEuro(toCents(value), { cents: false });

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

type Rule<C extends RuleCode> = (
  params: RuleParams<C>,
  inputs: RuleInputs,
) => RuleEvaluation | null;

function result(
  status: RuleStatus,
  valueText: string,
  actionText: string | null,
  detail: Record<string, unknown>,
): RuleEvaluation {
  return {
    status,
    valueText,
    actionNeeded: status !== 'ok',
    actionText: status === 'ok' ? null : actionText,
    detail,
  };
}

/** ok within the limit, warn up to `badOverBp` beyond it, bad further out. */
function overLimit(excessBp: number, badOverBp: number): RuleStatus {
  return excessBp <= 0 ? 'ok' : excessBp <= badOverBp ? 'warn' : 'bad';
}

// ---- the rules ----

const r01: Rule<'R01'> = (p, i) => {
  if (!i.allocByMonth) return null;
  const rolling = classShares(i.allocByMonth, i.refMonth).rolling12;
  const income = rolling.incomeCents;
  if (income <= 0) return null;
  const need = ratioBp(rolling.needCents, income) ?? 0;
  const want = ratioBp(rolling.wantCents, income) ?? 0;
  const future = ratioBp(rolling.futureCents, income) ?? 0;
  const over = {
    need: need - p.needMaxBp,
    want: want - p.wantMaxBp,
    future: p.futureMinBp - future,
  };
  const worstKey = (Object.keys(over) as Array<keyof typeof over>).reduce((a, b) =>
    over[b] > over[a] ? b : a,
  );
  const worst = over[worstKey];
  const s = rolling.shares;
  const valueText = `${s.need} / ${s.want} / ${s.future} % · ${
    s.rest < 0 ? `aus Guthaben ${MINUS}${-s.rest}` : `übrig ${s.rest}`
  } %`;
  const euroOver = Math.round((Math.max(worst, 0) * income) / 10_000);
  const action = {
    need: `Bedarf liegt über ${formatPercent(p.needMaxBp)} des Einkommens: Fixkosten und Verträge prüfen (${eur(euroOver)} im Monat zu viel).`,
    want: `Wunsch-Envelopes um ${eur(euroOver)} im Monat kürzen.`,
    future: `Zukunft um ${eur(euroOver)} im Monat aufstocken.`,
  }[worstKey];
  return result(overLimit(worst, p.badOverBp), valueText, action, {
    needBp: need,
    wantBp: want,
    futureBp: future,
    shares: s,
    breach: worst > 0 ? worstKey : null,
  });
};

const r02: Rule<'R02'> = (p, i) => {
  if (!i.emergency) return null;
  const cov = emergencyCoverage({
    reserveCents: i.emergency.reserveCents,
    needSpending: i.emergency.needSpending,
    currentMonth: addMonths(i.refMonth, 1),
    firstMonth: i.emergency.firstMonth,
  });
  if (cov.tenthsOfMonth === null) return null;
  const t = cov.tenthsOfMonth;
  const status: RuleStatus =
    t >= p.targetMonths * 10 ? 'ok' : t >= p.minMonths * 10 ? 'warn' : 'bad';
  const goalMonths = status === 'bad' ? p.minMonths : p.targetMonths;
  const missing = Math.max(
    0,
    goalMonths * cov.averageNeedCents - Math.max(0, i.emergency.reserveCents),
  );
  return result(
    status,
    `${Math.trunc(t / 10)},${t % 10} Monate`,
    `Notgroschen um ${eur(missing)} aufstocken, bis ${goalMonths} Monate Bedarf gedeckt sind.`,
    {
      tenthsOfMonth: t,
      averageNeedCents: cov.averageNeedCents,
      months: cov.months,
      missingCents: missing,
    },
  );
};

const r03: Rule<'R03'> = (p, i) => {
  const age = ageOfMoney(i.moneyEvents, i.asOf);
  if (age.days === null) return null;
  const status: RuleStatus =
    age.days >= p.targetDays ? 'ok' : age.days < p.badBelowDays ? 'bad' : 'warn';
  return result(
    status,
    `Geldalter ${plural(age.days, 'Tag', 'Tage')}`,
    `Puffer im Budget-Konto aufbauen, Überschüsse erst ab ${p.targetDays} Tagen Geldalter abziehen.`,
    { days: age.days, outflowsCounted: age.outflowsCounted },
  );
};

const r04: Rule<'R04'> = (p, i) => {
  const data = i.payYourself;
  if (!data || data.targetCents <= 0) return null;
  const from = `${addMonths(monthOf(i.asOf), -(p.months - 1))}-01`;
  const days = data.salaryDays.filter((d) => d >= from && d <= i.asOf);
  const run = payYourselfFirst({
    salaryDays: days,
    assignments: data.assignments,
    targetCents: data.targetCents,
    withinDays: p.withinDays,
  });
  // A salary whose window is still open and not yet funded cannot be judged.
  const judged = run.occurrences.filter(
    (o) => o.ok || addDays(o.salaryDay, p.withinDays) <= i.asOf,
  );
  const latest = judged[judged.length - 1];
  if (!latest) return null;
  const missed = judged.filter((o) => !o.ok);
  // Nothing at all on the latest salary is verletzt; partly funded or an earlier miss is a Warnung.
  const status: RuleStatus =
    missed.length === 0 ? 'ok' : latest.ok || latest.fundedCents > 0 ? 'warn' : 'bad';
  const short = latest.ok ? 0 : latest.targetCents - latest.fundedCents;
  return result(
    status,
    status === 'ok'
      ? 'am Gehaltstag gefüllt'
      : `${missed.length} von ${judged.length} Gehältern ohne gefüllte Zukunft`,
    `Zukunft-Envelopes am Gehaltstag zuerst füllen${short > 0 ? ` (zuletzt fehlten ${eur(short)})` : ''}.`,
    { occurrences: judged, missed: missed.length },
  );
};

const r05: Rule<'R05'> = (p, i) => {
  if (i.sinkingFunds.length === 0) return null;
  const r = sinkingFundsCovered(i.sinkingFunds);
  const short = r.uncovered.reduce((a, u) => a + u.shortCents, 0);
  const uncovered = r.total - r.covered;
  const status: RuleStatus =
    uncovered === 0 ? 'ok' : uncovered * 10_000 >= p.badUncoveredBp * r.total ? 'bad' : 'warn';
  return result(
    status,
    `${r.covered} von ${r.total} gedeckt`,
    `Rücklagen für ${plural(uncovered, 'periodische Ausgabe', 'periodische Ausgaben')} aufstocken: diesen Monat fehlen ${eur(short)}.`,
    { covered: r.covered, total: r.total, uncovered: r.uncovered },
  );
};

const r06: Rule<'R06'> = (_p, i) => {
  if (i.cards.length === 0) return null;
  const r = cardCovered(i.cards);
  const short = r.cards.reduce((a, c) => a + c.shortCents, 0);
  const n = r.cards.filter((c) => !c.covered).length;
  return result(
    r.allCovered ? 'ok' : 'bad',
    r.allCovered ? 'Saldo gedeckt' : plural(n, 'Karte nicht gedeckt', 'Karten nicht gedeckt'),
    `Kartenzahlung um ${eur(short)} aufstocken.`,
    { cards: r.cards },
  );
};

const r07: Rule<'R07'> = (p, i) => {
  const f = i.forecast;
  if (!f) return null;
  const run = liquidityForecast({
    startDay: f.startDay,
    startCents: f.startCents,
    days: p.horizonDays,
    items: f.items,
    variablePerDay: evenDaily(() => f.variableMonthlyCents),
  });
  const low = lowPoint(run.days, p.horizonDays);
  if (!low) return null;
  const status: RuleStatus =
    low.cents >= p.minCents ? 'ok' : low.cents >= -f.overdraftLimitCents ? 'warn' : 'bad';
  return result(
    status,
    `Tiefpunkt ${eur(low.cents)}`,
    `Zahlungen verschieben oder bis zum ${low.day.slice(8)}.${low.day.slice(5, 7)}. ${eur(p.minCents - low.cents)} auf das Budget-Konto übertragen.`,
    { lowDay: low.day, lowCents: low.cents, overdraftLimitCents: f.overdraftLimitCents },
  );
};

const r08: Rule<'R08'> = (p, i) => {
  if (i.netIncomeMonthlyCents === null) return null;
  const ratio = debtServiceRatio({
    loanPaymentsCents: i.loanPaymentsMonthlyCents,
    netIncomeCents: i.netIncomeMonthlyCents,
  });
  if (ratio === null) return null;
  return result(
    overLimit(ratio - p.maxBp, p.badOverBp),
    formatPercent(ratio),
    `Kreditraten liegen ${formatPercent(ratio - p.maxBp)} über dem Limit: Laufzeit oder Umschuldung prüfen.`,
    { ratioBp: ratio, loanPaymentsCents: i.loanPaymentsMonthlyCents },
  );
};

const r09: Rule<'R09'> = (p, i) => {
  if (!i.debt) return null;
  const order = debtOrder({
    loans: i.debt.loans,
    availableCents: 0,
    strategy: p.strategy,
    thresholdBp: p.rateBp,
  });
  const first = order.priority[0];
  if (!first)
    return result('ok', `keine Kredite über ${formatPercent(p.rateBp)}`, null, { priority: [] });
  const from = addMonths(monthOf(i.asOf), -(p.lookbackMonths - 1));
  const extra = i.debt.extraRepayments
    .filter((e) => e.month >= from && e.month <= monthOf(i.asOf))
    .reduce((a, e) => a + e.cents, 0);
  const name = i.debt.loans.find((l) => l.id === first.id)?.name ?? first.id;
  const status: RuleStatus = extra > 0 ? 'ok' : i.debt.investingAssignedCents > 0 ? 'bad' : 'warn';
  return result(
    status,
    extra > 0 ? 'Sondertilgung aktiv' : 'Sondertilgung fehlt',
    `Sondertilgung für ${name} (${formatPercent(first.rateBp)} Zins) vor dem Investieren einplanen.`,
    { priority: order.priority.map((l) => l.id), extraRepaymentCents: extra },
  );
};

const r10: Rule<'R10'> = (p, i) => {
  if (!i.fixedCosts || i.netIncomeMonthlyCents === null) return null;
  const ratio = fixedCostRatio({ ...i.fixedCosts, netIncomeCents: i.netIncomeMonthlyCents });
  if (ratio === null) return null;
  return result(
    overLimit(ratio - p.maxBp, p.badOverBp),
    formatPercent(ratio),
    'Verträge und Fixkosten prüfen: Anbieter wechseln oder kündigen, wo die Frist es erlaubt.',
    { ratioBp: ratio, ...i.fixedCosts },
  );
};

const r11: Rule<'R11'> = (p, i) => {
  const infl = lifestyleInflation(i.flows, i.refMonth);
  if (infl.spendingGrowthBp === null || infl.incomeGrowthBp === null) return null;
  const excess = infl.spendingGrowthBp - infl.incomeGrowthBp - p.toleranceBp;
  return result(
    overLimit(excess, p.badOverBp),
    `Ausgaben ${formatPercent(infl.spendingGrowthBp, true)} · Einkommen ${formatPercent(infl.incomeGrowthBp, true)}`,
    'Neue Ausgaben nur aus dem Einkommenszuwachs finanzieren; Wunsch-Envelopes prüfen.',
    { ...infl },
  );
};

const r12: Rule<'R12'> = (p, i) => {
  const from = addMonths(monthOf(i.asOf), -(p.lookbackMonths - 1));
  const months = i.windfall.filter((w) => w.month >= from && w.month <= monthOf(i.asOf));
  const total = months.reduce((a, w) => a + w.windfallCents, 0);
  if (total <= 0) return result('ok', 'keine Sonderzahlung', null, { checks: [] });
  const checks = months.map((w) => {
    const enjoy = p.enjoyCategoryIds.reduce((a, id) => a + (w.assignedByCategory[id] ?? 0), 0);
    // Genuss may stay in "Zu verteilen" (it is for enjoying) when no envelope tracks it.
    const allowanceBp = p.slackBp + (p.enjoyCategoryIds.length === 0 ? p.enjoyBp : 0);
    const left = Math.max(
      0,
      w.undistributedCents - Math.round((w.windfallCents * allowanceBp) / 10_000),
    );
    return {
      month: w.month,
      ...windfallCheck({
        amountCents: w.windfallCents,
        assignedEnjoyCents: enjoy,
        assignedOtherCents: w.windfallCents - enjoy - left,
        enjoyBp: p.enjoyBp,
      }),
    };
  });
  const open = checks.reduce((a, c) => a + Math.max(0, c.undistributedCents), 0);
  const tooMuchEnjoy = checks.some((c) => !c.enjoyWithinShare);
  const ok = checks.every((c) => c.ok);
  return result(
    ok ? 'ok' : 'warn',
    ok
      ? 'Sonderzahlung verteilt'
      : open > 0
        ? `${eur(open)} der Sonderzahlung noch zu verteilen`
        : 'mehr als der Genuss-Anteil',
    tooMuchEnjoy
      ? `Genuss auf ${formatPercent(p.enjoyBp)} der Sonderzahlung begrenzen, den Rest nach Wasserfall verteilen.`
      : `${eur(open)} der Sonderzahlung verteilen: ${formatPercent(p.enjoyBp)} Genuss, der Rest nach Wasserfall.`,
    { checks },
  );
};

const r13: Rule<'R13'> = (p, i) => {
  if (i.classTargets.length === 0 || i.positions.length === 0) return null;
  const full = allocationStatus(i.positions, i.classTargets);
  if (full.totalCents <= 0) return null;
  // A speculative class that is over-weight is R15's business, not a rebalancing case.
  const covered = (r: (typeof full.rows)[number]) => r.speculativeOnly && r.side === 'over';
  const st = {
    ...full,
    breaches: full.breaches.filter((r) => !covered(r)),
    ok: full.breaches.every(covered),
  };
  const rows = full.rows.filter((r) => r.deviationBp !== null && !covered(r));
  const worst = rows.reduce<(typeof rows)[number] | null>(
    (a, r) => (a === null || Math.abs(r.deviationBp ?? 0) > Math.abs(a.deviationBp ?? 0) ? r : a),
    null,
  );
  if (!worst) return null;
  const nameOf = (key: string) => i.names.assetClasses[key] ?? key;
  const bad = st.breaches.some(
    (r) => Math.abs(r.deviationBp ?? 0) * 100 > (r.bandBp ?? 0) * p.badFactorPct,
  );
  const status: RuleStatus = st.ok ? 'ok' : bad ? 'bad' : 'warn';
  const under = st.breaches.find((r) => r.side === 'under');
  const action = under
    ? `Nächste Sparrate vollständig in ${nameOf(under.assetClass)} (fehlen ${eur(under.gapCents)}).`
    : `${nameOf(worst.assetClass)} nicht weiter aufstocken (${eur(-worst.gapCents)} über dem Soll).`;
  return result(
    status,
    `${nameOf(worst.assetClass)} ${formatPoints(worst.deviationBp ?? 0)}`,
    action,
    {
      maxDeviationBp: worst.deviationBp === null ? 0 : Math.abs(worst.deviationBp),
      breaches: st.breaches.map((r) => r.assetClass),
    },
  );
};

const r14: Rule<'R14'> = (p, i) => {
  const risk = clusterRisk(i.positions, { singleBp: p.singleBp, platformBp: p.platformBp });
  if (risk.totalCents <= 0) return null;
  const entries = [
    ...risk.singles.map((e) => ({ ...e, limit: p.singleBp, kind: 'single' as const })),
    ...risk.platforms.map((e) => ({ ...e, limit: p.platformBp, kind: 'platform' as const })),
  ];
  const worstExcess = entries.reduce((m, e) => Math.max(m, e.shareBp - e.limit), -10_000);
  const status: RuleStatus = risk.breach ? overLimit(worstExcess, p.badOverBp) : 'ok';
  const breached = entries.filter((e) => e.breach).sort((a, b) => b.shareBp - a.shareBp)[0];
  const label = (e: { id: string; kind: 'single' | 'platform' }) =>
    (e.kind === 'single' ? i.names.securities : i.names.platforms)[e.id] ?? e.id;
  const largest = risk.singles[0] ?? risk.platforms[0];
  const valueText = breached
    ? `${breached.kind === 'platform' ? 'Plattform ' : ''}${label(breached)} ${formatPercent(breached.shareBp)}`
    : largest
      ? `größte Position ${formatPercent(largest.shareBp)}`
      : 'keine Einzeltitel';
  const overCents = breached
    ? breached.valueCents - Math.floor((risk.totalCents * breached.limit) / 10_000)
    : 0;
  return result(
    status,
    valueText,
    breached
      ? `${label(breached)} nicht weiter aufstocken; ${eur(overCents)} über dem Limit von ${formatPercent(breached.limit)}.`
      : null,
    { totalCents: risk.totalCents, singles: risk.singles, platforms: risk.platforms },
  );
};

const r15: Rule<'R15'> = (p, i) => {
  const s = speculativeShare(i.positions, p.limitBp);
  if (s.totalCents <= 0) return null;
  return result(
    s.breach ? overLimit(s.shareBp - p.limitBp, p.badOverBp) : 'ok',
    formatPercent(s.shareBp),
    `Keine neuen Käufe in Krypto, P2P, Einzelaktien (${eur(s.overCents)} über dem Limit); Sparplan nur ETF.`,
    { shareBp: s.shareBp, valueCents: s.valueCents, overCents: s.overCents },
  );
};

const r16: Rule<'R16'> = (p, i) => {
  if (!i.freedom) return null;
  const target = freedomTargetCents(i.freedom.annualSpendCents, p.multiple);
  if (target <= 0) return null;
  const progress = freedomProgressBp(i.freedom.investedCents, target);
  const prev = i.freedom.previousProgressBp;
  const falling = prev !== null && progress < prev;
  return result(
    falling ? 'warn' : 'ok',
    formatPercent(progress),
    `Sparrate prüfen: der Fortschritt zur Freiheitszahl ist von ${formatPercent(prev ?? 0)} auf ${formatPercent(progress)} gesunken.`,
    { progressBp: progress, previousProgressBp: prev, targetCents: target },
  );
};

const RULES: { [C in RuleCode]: Rule<C> } = {
  R01: r01,
  R02: r02,
  R03: r03,
  R04: r04,
  R05: r05,
  R06: r06,
  R07: r07,
  R08: r08,
  R09: r09,
  R10: r10,
  R11: r11,
  R12: r12,
  R13: r13,
  R14: r14,
  R15: r15,
  R16: r16,
};

/**
 * Evaluates one rule. `params` is the stored parameter object (missing keys take the defaults);
 * returns `null` when the inputs hold nothing to judge ("nicht bewertbar").
 */
export function evaluateRule(
  code: RuleCode,
  params: unknown,
  inputs: RuleInputs,
): RuleEvaluation | null {
  const resolved = resolveParams(code, params);
  return (RULES[code] as Rule<RuleCode>)(resolved as never, inputs);
}
