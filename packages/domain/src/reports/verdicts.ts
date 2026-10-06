import { monthNameOnly } from '../date';
import { cents, formatEuro } from '../money';
import { formatPercent } from '../rules/format';
import { VERDICT_TEMPLATES } from './verdict-templates';
export { VERDICT_TEMPLATES } from './verdict-templates';

export type VerdictUnit = 'money' | 'percent' | 'points' | 'count';
export interface VerdictMetric {
  label: string;
  value: number | null;
  unit: VerdictUnit;
  better?: 'higher' | 'lower';
}
/** A labelled money figure shown after the sentence unless the winning fact already names it. */
export interface VerdictDetail {
  label: string;
  value: number | null;
  skipFor?: readonly VerdictFactType[];
}
export interface VerdictPoint {
  month: string;
  value: number | null;
}
/** Values come from the report's own read model; no ledger calculations live here. */
export interface VerdictFacts {
  reportId: string;
  period: string;
  metric?: VerdictMetric | undefined;
  /** Extra signed figures appended after the sentence, e.g. market effect and net-worth change. */
  details?: readonly VerdictDetail[];
  partial?: boolean | undefined;
  estimated?: boolean | undefined;
  unavailable?: boolean | undefined;
  history?: readonly VerdictPoint[];
  historyScope?: 'all' | 'window';
  comparisons?: readonly { reference: string; value: number | null }[];
  savingsRates?: readonly VerdictPoint[];
  savingsTargetBp?: number;
  budgetMargins?: readonly VerdictPoint[];
  wealthChanges?: readonly VerdictPoint[];
  netWorth?: { currentCents: number; previousCents: number };
  emergency?: { months: number; previousMonths: number };
  debt?: { currentCents: number; previousCents: number };
  marketCents?: number;
  ownCents?: number;
  rules?: { bad: number; warn: number; ok: number };
  categoryStreaks?: readonly { category: string; margins: readonly VerdictPoint[] }[];
  equivalents?: readonly {
    category: string;
    costCents: number;
    unit: 'Monatsbeträgen' | 'Ausgaben';
  }[];
}
export type VerdictFactType =
  | 'record-high'
  | 'record-low'
  | 'streak-savings'
  | 'streak-budget'
  | 'streak-wealth'
  | 'comparison-up'
  | 'comparison-down'
  | 'threshold-wealth'
  | 'threshold-emergency'
  | 'debt-down'
  | 'market-up'
  | 'market-down'
  | 'effort'
  | 'rule-bad'
  | 'rule-warn'
  | 'rule-ok'
  | 'milestone'
  | 'category-streak'
  | 'equivalent'
  | 'negative'
  | 'summary'
  | 'neutral'
  | 'unavailable';
export interface VerdictCandidate {
  type: VerdictFactType;
  strength: number;
  label?: string;
  value?: number;
  unit?: VerdictUnit;
  /** The report's own figure; comparisons show it next to the difference in `value`. */
  current?: number;
  currentUnit?: VerdictUnit;
  better?: 'higher' | 'lower';
  /** Round marks (thresholds) carry no private information and stay readable. */
  visible?: boolean;
  n?: number;
  rank?: number;
  threshold?: number;
  reference?: string;
  scope?: string;
  category?: string;
  equivalent?: number;
  equivalentUnit?: string;
}
export interface VerdictTemplate {
  id: string;
  type: VerdictFactType;
  tone: 'sachlich' | 'anerkennend' | 'trocken-humorvoll' | 'warnend';
  text: string;
}
const valid = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n);
const monthIndex = (month: string) => {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
};
const endMonth = (period: string) => period.match(/\d{4}-(?:0[1-9]|1[0-2])/g)?.at(-1) ?? '';
/** Histories must end at this period and contain no gaps, duplicate or missing months. */
const contiguous = (points: readonly VerdictPoint[], period: string) =>
  points.length > 0 &&
  points.at(-1)?.month === endMonth(period) &&
  points.every(
    (p, i) =>
      valid(p.value) &&
      monthIndex(p.month) !== null &&
      (i === 0 || monthIndex(p.month)! === monthIndex(points[i - 1]!.month)! + 1),
  );
const tailCount = (points: readonly VerdictPoint[], test: (n: number) => boolean) => {
  let n = 0;
  for (let i = points.length - 1; i >= 0 && valid(points[i]!.value) && test(points[i]!.value!); i--)
    n++;
  return n;
};

function candidate(
  f: VerdictFacts,
  type: VerdictFactType,
  strength: number,
  data: Partial<VerdictCandidate> = {},
): VerdictCandidate {
  return {
    label: f.metric?.label ?? 'Stand',
    unit: f.metric?.unit ?? 'money',
    ...(valid(f.metric?.value) ? { value: f.metric.value } : {}),
    ...(f.metric?.better ? { better: f.metric.better } : {}),
    type,
    strength,
    ...data,
  };
}
function detectWarnings(f: VerdictFacts): VerdictCandidate[] {
  const m = f.metric;
  const result: VerdictCandidate[] = [];
  const add = (type: VerdictFactType, strength: number, data: Partial<VerdictCandidate> = {}) =>
    result.push(candidate(f, type, strength, data));
  if (valid(m?.value) && m.value < 0 && m.better === 'higher') add('negative', 85);
  if (f.rules) {
    const { bad, warn, ok } = f.rules;
    if ([bad, warn, ok].every((n) => valid(n) && n >= 0)) {
      if (bad > 0) add('rule-bad', 95, { n: bad });
      else if (warn > 0) add('rule-warn', 80, { n: warn });
      else if (ok > 0) add('rule-ok', 50, { n: ok });
    }
  }
  if (valid(f.marketCents) && f.marketCents !== 0) {
    add(f.marketCents > 0 ? 'market-up' : 'market-down', 65, {
      value: Math.abs(f.marketCents),
      unit: 'money',
    });
    if (f.marketCents < 0 && valid(f.ownCents) && f.ownCents > Math.abs(f.marketCents))
      add('effort', 90, { value: f.ownCents, unit: 'money' });
  }
  return result;
}

function detectRecords(f: VerdictFacts): VerdictCandidate[] {
  const m = f.metric;
  const result: VerdictCandidate[] = [];
  const add = (type: VerdictFactType, strength: number, data: Partial<VerdictCandidate> = {}) =>
    result.push(candidate(f, type, strength, data));
  const completeHistory = f.history ?? [];
  const windows =
    completeHistory.length > 12 ? [completeHistory, completeHistory.slice(-12)] : [completeHistory];
  for (const history of windows) {
    if (
      m?.better &&
      valid(m.value) &&
      history.length >= 3 &&
      contiguous(history, f.period) &&
      history.at(-1)?.value === m.value
    ) {
      const previous = history.slice(0, -1).map((p) => p.value!);
      const higher = m.better === 'higher';
      const rank = 1 + previous.filter((v) => (higher ? v > m.value! : v < m.value!)).length;
      const scope =
        f.historyScope === 'all' && history === completeHistory
          ? 'seit Aufzeichnungsbeginn'
          : `in ${history.length} Monaten`;
      if (rank <= 3 && !previous.includes(m.value))
        add('record-high', rank === 1 ? 88 : 60, { rank, n: rank, scope });
      const worst = higher ? Math.min(...previous) : Math.max(...previous);
      if (higher ? m.value < worst : m.value > worst) add('record-low', 89, { scope });
    }
  }
  return result;
}

function detectStreaks(f: VerdictFacts): VerdictCandidate[] {
  const result: VerdictCandidate[] = [];
  const add = (type: VerdictFactType, strength: number, data: Partial<VerdictCandidate> = {}) =>
    result.push(candidate(f, type, strength, data));
  const streak = (
    points: readonly VerdictPoint[] | undefined,
    type: VerdictFactType,
    test: (n: number) => boolean,
    threshold?: number,
  ) => {
    if (!points || !contiguous(points, f.period)) return;
    const n = tailCount(points, test);
    if (n >= 3)
      add(type, 72 + Math.min(n, 12), { n, ...(threshold === undefined ? {} : { threshold }) });
  };
  if (valid(f.savingsTargetBp) && f.savingsTargetBp > 0)
    streak(f.savingsRates, 'streak-savings', (n) => n >= f.savingsTargetBp!, f.savingsTargetBp);
  streak(f.budgetMargins, 'streak-budget', (n) => n >= 0);
  streak(f.wealthChanges, 'streak-wealth', (n) => n > 0);
  return result;
}

function detectMilestones(f: VerdictFacts): VerdictCandidate[] {
  const result: VerdictCandidate[] = [];
  const add = (type: VerdictFactType, strength: number, data: Partial<VerdictCandidate> = {}) =>
    result.push(candidate(f, type, strength, data));
  if (
    f.historyScope === 'all' &&
    f.budgetMargins &&
    contiguous(f.budgetMargins, f.period) &&
    f.budgetMargins.length >= 2 &&
    f.budgetMargins.at(-1)!.value! >= 0 &&
    f.budgetMargins.slice(0, -1).every((p) => p.value! < 0)
  )
    add('milestone', 87);
  for (const c of f.categoryStreaks ?? [])
    if (contiguous(c.margins, f.period)) {
      const n = tailCount(c.margins, (v) => v >= 0);
      if (n >= 3) add('category-streak', 70, { n, category: c.category });
    }
  return result;
}

function detectComparisons(f: VerdictFacts): VerdictCandidate[] {
  const m = f.metric;
  const result: VerdictCandidate[] = [];
  const add = (type: VerdictFactType, strength: number, data: Partial<VerdictCandidate> = {}) =>
    result.push(candidate(f, type, strength, data));
  for (const c of f.comparisons ?? [])
    if (
      valid(c.value) &&
      valid(m?.value) &&
      m.value !== c.value &&
      Number.isSafeInteger(m.value - c.value)
    )
      add(m.value > c.value ? 'comparison-up' : 'comparison-down', 45, {
        reference: c.reference,
        current: m.value,
        currentUnit: m.unit,
        value: Math.abs(m.value - c.value),
        unit: m?.unit === 'percent' ? 'points' : m?.unit,
      });
  return result;
}

function detectThresholds(f: VerdictFacts): VerdictCandidate[] {
  const result: VerdictCandidate[] = [];
  const add = (type: VerdictFactType, strength: number, data: Partial<VerdictCandidate> = {}) =>
    result.push(candidate(f, type, strength, data));
  if (f.netWorth && valid(f.netWorth.currentCents) && valid(f.netWorth.previousCents)) {
    const { currentCents: now, previousCents: before } = f.netWorth;
    // Round milestones at 10k, 100k and million-euro scales; never infer unseen crossings.
    const step = now >= 100000000 ? 100000000 : now >= 10000000 ? 10000000 : 1000000;
    const crossed = Math.floor(now / step) * step;
    if (crossed > 0 && before < crossed && now >= crossed)
      add('threshold-wealth', 92, { value: crossed, unit: 'money', visible: true });
  }
  if (
    f.emergency &&
    Number.isFinite(f.emergency.months) &&
    Number.isFinite(f.emergency.previousMonths)
  ) {
    const n = Math.floor(f.emergency.months);
    if (n >= 1 && f.emergency.previousMonths >= 0 && f.emergency.previousMonths < n)
      add('threshold-emergency', 86, { n });
  }
  if (
    f.debt &&
    valid(f.debt.currentCents) &&
    valid(f.debt.previousCents) &&
    f.debt.currentCents >= 0 &&
    f.debt.previousCents > f.debt.currentCents
  )
    add('debt-down', 76, { value: f.debt.previousCents - f.debt.currentCents, unit: 'money' });
  return result;
}

function detectEquivalents(f: VerdictFacts): VerdictCandidate[] {
  const m = f.metric;
  const result: VerdictCandidate[] = [];
  const add = (type: VerdictFactType, strength: number, data: Partial<VerdictCandidate> = {}) =>
    result.push(candidate(f, type, strength, data));
  if (valid(m?.value) && m.unit === 'money' && m.value > 0)
    for (const e of f.equivalents ?? [])
      if (valid(e.costCents) && e.costCents > 0 && m.value >= e.costCents)
        add('equivalent', 40, {
          category: e.category,
          equivalent: m.value / e.costCents,
          equivalentUnit: e.unit,
        });
  return result;
}
export function detectVerdictFacts(f: VerdictFacts): VerdictCandidate[] {
  if (f.unavailable || (f.metric && !valid(f.metric.value)))
    return [candidate(f, 'unavailable', 100)];
  const result = [candidate(f, f.metric ? 'summary' : 'neutral', 0), ...detectWarnings(f)];
  // Partial months never compete with full months; estimates never earn records or milestones.
  if (f.partial || f.estimated) return result;
  return [
    ...result,
    ...detectRecords(f),
    ...detectStreaks(f),
    ...detectMilestones(f),
    ...detectComparisons(f),
    ...detectThresholds(f),
    ...detectEquivalents(f),
  ];
}

const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');
const short = (s: string) => s.replace(/[{}\r\n]/g, '').slice(0, 32);
const ordinals = ['beste', 'zweitbeste', 'drittbeste'];
function numberText(value: number | undefined, unit: VerdictUnit, hidden: boolean, signed = false) {
  if (!valid(value)) return '–';
  if (hidden)
    return unit === 'money'
      ? '••• €'
      : unit === 'percent'
        ? '••• %'
        : unit === 'points'
          ? '••• Pp'
          : '•••';
  if (unit === 'money')
    return formatEuro(cents(value), { cents: Math.abs(value) < 10000, sign: signed });
  if (unit === 'percent') return formatPercent(value, signed);
  if (unit === 'points') return formatPercent(value, signed).replace(/ %$/, ' Pp');
  return String(Object.is(value, -0) ? 0 : value);
}
/** ` · Markt +12 € · Nettovermögen +30 €` for the details that the sentence does not already name. */
function detailSuffix(facts: VerdictFacts, type: VerdictFactType, hidden: boolean) {
  return (facts.details ?? [])
    .filter((d) => valid(d.value) && !d.skipFor?.includes(type))
    .map((d) => ` · ${short(d.label)} ${numberText(d.value!, 'money', hidden, true)}`)
    .join('');
}
export function renderVerdictTemplate(
  template: VerdictTemplate,
  candidate: VerdictCandidate,
  facts: VerdictFacts,
  hidden = false,
): string {
  const single = /^\d{4}-\d{2}(?:-\d{2})?$/.test(facts.period);
  const monthName = single ? monthNameOnly(endMonth(facts.period)) : '';
  // A range has no month to name: drop the leading "Monat: " instead of printing "Zeitraum:".
  const dropPrefix = !monthName && template.text.startsWith('{month}: ');
  const text = dropPrefix ? template.text.slice('{month}: '.length) : template.text;
  const count = (n: number | undefined) => numberText(n, 'count', hidden);
  const oneEquivalent = Math.round((candidate.equivalent ?? 0) * 10) === 10;
  const monthlyEquivalent = (candidate.equivalentUnit ?? 'Monatsbeträgen') === 'Monatsbeträgen';
  const equivalentUnitNom = monthlyEquivalent
    ? oneEquivalent
      ? 'Monatsbetrag'
      : 'Monatsbeträge'
    : oneEquivalent
      ? 'Ausgabe'
      : 'Ausgaben';
  const values: Record<string, string> = {
    month: monthName || 'Zeitraum',
    label: short(candidate.label ?? 'Stand'),
    amount: numberText(candidate.value, candidate.unit ?? 'money', hidden && !candidate.visible),
    current: numberText(
      candidate.current ?? candidate.value,
      candidate.currentUnit ?? candidate.unit ?? 'money',
      hidden,
    ),
    strongest: candidate.better === 'lower' ? 'sparsamsten' : 'stärksten',
    worst: candidate.better === 'lower' ? 'teuerste' : 'schwächste',
    n: count(candidate.n),
    months: candidate.n === 1 ? 'Monat' : 'Monate',
    rules: candidate.n === 1 ? 'Regel' : 'Regeln',
    verb: candidate.n === 1 ? 'braucht' : 'brauchen',
    rank: hidden
      ? '•••'
      : (ordinals[(candidate.rank ?? 1) - 1] ?? `${count(candidate.rank)}.-beste`),
    scope: hidden ? (candidate.scope ?? '').replace(/\d+/g, '•••') : (candidate.scope ?? ''),
    threshold: numberText(candidate.threshold, 'percent', hidden),
    reference: short(candidate.reference ?? 'Vergleich'),
    category: short(candidate.category ?? 'eigene Kategorie'),
    equivalent: hidden
      ? '•••'
      : Number.isFinite(candidate.equivalent)
        ? oneDecimal(candidate.equivalent!)
        : '–',
    equivalentUnit: monthlyEquivalent && !oneEquivalent ? 'Monatsbeträgen' : equivalentUnitNom,
    equivalentUnitNom,
  };
  const rendered = text.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (!(key in values)) throw new Error(`Unknown verdict placeholder: ${key}`);
    return values[key]!;
  });
  return dropPrefix ? rendered.charAt(0).toUpperCase() + rendered.slice(1) : rendered;
}
const hash = (s: string) => {
  let h = 0;
  for (const c of s) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  return h;
};
export function reportVerdict(
  facts: VerdictFacts,
  options: { hidden?: boolean; previousTemplateId?: string } = {},
) {
  const fact = detectVerdictFacts(facts).sort((a, b) => b.strength - a.strength)[0]!;
  const flags = `${facts.partial ? ' · laufend' : ''}${facts.estimated ? ' · vorläufig' : ''}`;
  const extra = (hidden: boolean) => detailSuffix(facts, fact.type, hidden);
  const suffix = (hidden: boolean) => extra(hidden) + flags;
  const month = endMonth(facts.period);
  const periodIndex = monthIndex(month) ?? hash(facts.period);
  const parity = (t: VerdictTemplate) =>
    Number(t.id.slice(t.id.lastIndexOf('-') + 1)) % 2 === periodIndex % 2;
  // Eligibility uses both renderings so toggling privacy never changes the wording.
  const length = (t: VerdictTemplate) =>
    Math.max(
      renderVerdictTemplate(t, fact, facts).length + suffix(false).length,
      renderVerdictTemplate(t, fact, facts, true).length + suffix(true).length,
    );
  const ofType = VERDICT_TEMPLATES.filter(
    (t) => t.type === fact.type && t.id !== options.previousTemplateId,
  );
  // Disjoint month banks prevent repeats even when values change the fitting templates.
  const choices = ofType.filter((t) => parity(t) && length(t) <= 140);
  const seed = hash(facts.reportId + facts.period);
  // No template fits: the shortest one of the winning type, never a different fact.
  const shortest = (list: readonly VerdictTemplate[]) =>
    list.reduce((best, t) => (length(t) < length(best) ? t : best));
  const template =
    choices[seed % choices.length] ??
    shortest(ofType.filter(parity).length ? ofType.filter(parity) : ofType);
  return {
    text:
      renderVerdictTemplate(template, fact, facts, options.hidden) +
      suffix(Boolean(options.hidden)),
    templateId: template.id,
    fact,
  };
}
