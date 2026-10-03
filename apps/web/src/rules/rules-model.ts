import { formatPrivateEuro as formatEuro, maskMoneyText } from '@budget/ui';
import { STAGES, cents, parseScaledDecimal } from '@budget/domain';

/**
 * Presentation model of Einstellungen › Regelwerk: the typed threshold fields per rule, the
 * threshold summary line and the stage ranges. Shares are basis points (bp) on the wire and
 * percent with a decimal comma on screen; the conversion is integer math.
 */

export type FieldUnit = 'pct' | 'count' | 'euro' | 'factor' | 'choice' | 'boolean';

export interface FieldSpec {
  key: string;
  label: string;
  unit: FieldUnit;
  /** Suffix shown behind the field (`%`, `Monate`, `Tage` ...). */
  suffix?: string;
  /** Inclusive bounds in the wire unit (bp, count, cents). */
  min?: number;
  max?: number;
  hint?: string;
  choices?: ReadonlyArray<{ value: string; label: string }>;
}

const pct = (key: string, label: string, hint?: string): FieldSpec => ({
  key,
  label,
  unit: 'pct',
  suffix: '%',
  min: 0,
  max: 100_000,
  ...(hint ? { hint } : {}),
});
const count = (key: string, label: string, suffix: string, hint?: string, min = 0): FieldSpec => ({
  key,
  label,
  unit: 'count',
  suffix,
  min,
  max: 1_200,
  ...(hint ? { hint } : {}),
});

const OVER = 'Ab so viel jenseits der Grenze gilt die Regel als verletzt, davor als Warnung.';

/** The thresholds of each rule (the keys are those of `PARAM_SCHEMAS` in `@budget/domain`). */
export const RULE_FIELDS: Readonly<Record<string, ReadonlyArray<FieldSpec>>> = {
  R01: [
    pct('needMaxBp', 'Bedarf höchstens'),
    pct('wantMaxBp', 'Wunsch höchstens'),
    pct('futureMinBp', 'Zukunft mindestens'),
    pct('badOverBp', 'Verletzt ab Abstand', OVER),
  ],
  R02: [
    count('minMonths', 'Mindestens', 'Monate', 'Monate Bedarf, darunter Warnung.'),
    count('targetMonths', 'Ziel', 'Monate', 'Monate Bedarf, ab hier erfüllt.'),
  ],
  R03: [
    count('targetDays', 'Ziel Geldalter', 'Tage'),
    count('badBelowDays', 'Verletzt unter', 'Tage'),
  ],
  R04: [
    count('withinDays', 'Zukunft gefüllt binnen', 'Tage', 'Tage nach dem Gehalt.'),
    count('months', 'Gehälter der letzten', 'Monate', undefined, 1),
  ],
  R05: [pct('badUncoveredBp', 'Verletzt ab Anteil ungedeckter Rücklagen')],
  R06: [],
  R07: [
    { ...count('horizonDays', 'Vorschau', 'Tage', undefined, 1), max: 365 },
    {
      key: 'minCents',
      label: 'Tiefpunkt mindestens',
      unit: 'euro',
      min: -100_000_000,
      max: 100_000_000,
    },
  ],
  R08: [pct('maxBp', 'Höchstens'), pct('badOverBp', 'Verletzt ab Abstand', OVER)],
  R09: [
    pct('rateBp', 'Zins, ab dem getilgt wird'),
    {
      key: 'strategy',
      label: 'Tilgungsreihenfolge',
      unit: 'choice',
      choices: [
        { value: 'avalanche', label: 'Höchster Zins zuerst' },
        { value: 'snowball', label: 'Kleinster Saldo zuerst' },
      ],
    },
    count('lookbackMonths', 'Sondertilgung innerhalb der letzten', 'Monate'),
  ],
  R10: [pct('maxBp', 'Höchstens'), pct('badOverBp', 'Verletzt ab Abstand', OVER)],
  R11: [
    pct('toleranceBp', 'Toleranz', 'So viel dürfen die Ausgaben das Einkommen übersteigen.'),
    pct('badOverBp', 'Verletzt ab Abstand', OVER),
  ],
  R12: [
    pct('enjoyBp', 'Genuss-Anteil'),
    pct('slackBp', 'Spielraum', 'Was zusätzlich in „Zu verteilen“ bleiben darf.'),
    count('lookbackMonths', 'Rückblick', 'Monate'),
  ],
  R13: [
    {
      key: 'badFactorPct',
      label: 'Verletzt ab Vielfachem des Bands',
      unit: 'factor',
      suffix: '%',
      min: 100,
      max: 1_000,
      hint: '200 % heißt: doppelt so weit vom Zielanteil entfernt, wie das Band erlaubt.',
    },
  ],
  R14: [
    pct('singleBp', 'Einzeltitel höchstens'),
    pct('platformBp', 'Plattform höchstens'),
    pct('badOverBp', 'Verletzt ab Abstand', OVER),
  ],
  R15: [pct('limitBp', 'Höchstens'), pct('badOverBp', 'Verletzt ab Abstand', OVER)],
  R16: [
    {
      key: 'multiple',
      label: 'Jahresausgaben mal',
      unit: 'factor',
      min: 1,
      max: 100,
      hint: '25 entspricht der 4-Prozent-Regel.',
    },
  ],
  R17: [
    pct('targetBp', 'Ziel Bruttoquote'),
    pct('minBp', 'Mindestens Bruttoquote'),
    { key: 'includeEmployerPension', label: 'Arbeitgeberbeitrag mitzählen', unit: 'boolean' },
    {
      key: 'maxSeverity',
      label: 'Höchste Schwere',
      unit: 'choice',
      choices: [
        { value: 'bad', label: 'Verletzt möglich' },
        { value: 'warn', label: 'Nur Warnung' },
      ],
    },
  ],
  R18: [
    count('okFromX100', 'Erfüllt ab Index × 100', ''),
    count('warnFromX100', 'Unterer Richtwert × 100', ''),
    count('aboveAverageX100', 'Überdurchschnittlich ab Index × 100', ''),
    count('minAge', 'Mindestalter', 'Jahre'),
    { key: 'includeCapitalIncome', label: 'Kapitalerträge mitzählen', unit: 'boolean' },
  ],
  R19: [
    pct('minGrowthBp', 'Mindestens Einkommenszuwachs'),
    pct('targetBp', 'Ziel Grenz-Sparquote'),
    pct('minBp', 'Mindestens Grenz-Sparquote'),
  ],
  R20: [
    { ...count('okMonths', 'Erfüllt ab', 'Monaten'), max: 12 },
    { ...count('warnMonths', 'Warnung ab', 'Monaten'), max: 12 },
    {
      key: 'exemptDebtPriority',
      label: 'Sondertilgung bei R09-Vorrang mitzählen',
      unit: 'boolean',
    },
  ],
  R21: [
    pct('leverageMaxBp', 'Hebelanteil höchstens'),
    pct('leverageBadOverBp', 'Hebel verletzt ab Abstand', OVER),
    pct('debitWarnFromBp', 'Plattform-Minus Warnung ab'),
    pct('debitBadOverBp', 'Plattform-Minus verletzt über'),
    {
      key: 'ignoreBelowCents',
      label: 'Technischen Minusstand ignorieren bis',
      unit: 'euro',
      min: 0,
      max: 100_000_000,
    },
  ],
  R22: [
    pct('maxBp', 'Fondskosten höchstens'),
    pct('badOverBp', 'Verletzt ab Abstand', OVER),
    {
      key: 'maxUnknownSharePct',
      label: 'Unbekannter Fondswert höchstens',
      unit: 'count',
      suffix: '%',
      min: 0,
      max: 100,
    },
    { key: 'excludeLeveraged', label: 'Hebelfonds getrennt anzeigen', unit: 'boolean' },
  ],
};

/** Basis points as percent text with a decimal comma: 5000 → "50", 1250 → "12,5". */
export function formatBp(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const frac = String(Math.abs(bp % 100))
    .padStart(2, '0')
    .replace(/0+$/, '');
  return frac ? `${whole},${frac}` : String(whole);
}

/** Percent text ("12,5", "12.5") as basis points; `null` when it is not a number with ≤ 2 decimals. */
export function parseBp(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return parseScaledDecimal(t, 2);
}

/** Field text of a stored value. */
export function fieldText(spec: FieldSpec, value: unknown): string {
  if (spec.unit === 'choice' || spec.unit === 'boolean') return String(value ?? '');
  if (typeof value !== 'number') return '';
  if (spec.unit === 'pct') return formatBp(value);
  return String(value);
}

const unit = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const eur = (c: number) => formatEuro(cents(c), { cents: c % 100 !== 0 });
const pc = (bp: number) => `${formatBp(bp)} %`;

const num = (p: Record<string, unknown>, key: string): number => Number(p[key] ?? 0);

/** The threshold line under a rule's name, derived from the stored parameters. */
export function thresholdText(code: string, p: Record<string, unknown>): string {
  switch (code) {
    case 'R01':
      return `Bedarf ≤ ${pc(num(p, 'needMaxBp'))}, Wunsch ≤ ${pc(num(p, 'wantMaxBp'))}, Zukunft ≥ ${pc(num(p, 'futureMinBp'))}`;
    case 'R02':
      return `min. ${num(p, 'minMonths')}, Ziel ${unit(num(p, 'targetMonths'), 'Monat', 'Monate')}`;
    case 'R03':
      return `Geldalter ≥ ${unit(num(p, 'targetDays'), 'Tag', 'Tage')}`;
    case 'R04':
      return num(p, 'withinDays') === 0
        ? 'Zukunft am Gehaltstag zuerst'
        : `Zukunft binnen ${unit(num(p, 'withinDays'), 'Tag', 'Tagen')} nach Gehalt`;
    case 'R05':
      return 'bei Fälligkeit gedeckt';
    case 'R06':
      return 'immer gedeckt';
    case 'R07':
      return `Tiefpunkt ≥ ${eur(num(p, 'minCents'))} in ${unit(num(p, 'horizonDays'), 'Tag', 'Tagen')}`;
    case 'R08':
      return `≤ ${pc(num(p, 'maxBp'))} des Nettoeinkommens`;
    case 'R09':
      return `über ${pc(num(p, 'rateBp'))} Zins: tilgen`;
    case 'R10':
      return `≤ ${pc(num(p, 'maxBp'))}`;
    case 'R11':
      return num(p, 'toleranceBp') === 0
        ? 'Ausgaben ≤ Einkommen, 12 M'
        : `Ausgaben ≤ Einkommen + ${pc(num(p, 'toleranceBp'))}, 12 M`;
    case 'R12':
      return `${pc(num(p, 'enjoyBp'))} Genuss, Rest nach Wasserfall`;
    case 'R13':
      return '5 Pp oder 25 % relativ';
    case 'R14':
      return `Einzeltitel ≤ ${pc(num(p, 'singleBp'))}, Plattform ≤ ${pc(num(p, 'platformBp'))}`;
    case 'R15':
      return `≤ ${pc(num(p, 'limitBp'))}`;
    case 'R16':
      return `Investiert ÷ ${num(p, 'multiple')} Jahresausgaben`;
    case 'R17':
      return `Ziel ${pc(num(p, 'targetBp'))}, min. ${pc(num(p, 'minBp'))} vom Brutto`;
    case 'R18':
      return `Index ≥ ${formatBp(num(p, 'okFromX100'))}; nur Warnung`;
    case 'R19':
      return `Ziel ${pc(num(p, 'targetBp'))} des Zuwachses, Wachstum ≥ ${pc(num(p, 'minGrowthBp'))}`;
    case 'R20':
      return `${num(p, 'okMonths')} von 12 Monaten`;
    case 'R21':
      return `Hebel ≤ ${pc(num(p, 'leverageMaxBp'))}, Plattform-Minus verletzt > ${pc(num(p, 'debitBadOverBp'))}`;
    case 'R22':
      return `Fondskosten ≤ ${pc(num(p, 'maxBp'))}`;
    default:
      return '';
  }
}

const rangeEuro = (c: number) =>
  c >= 100_000_000
    ? maskMoneyText(`${c / 100_000_000} Mio. €`)
    : formatEuro(cents(c), { cents: false });

/** "bis 10.000 €", "10.000 bis 100.000 €", "100.000 bis 1 Mio. €" from the stage model. */
export function stageRange(stage: number): string {
  const def = STAGES.find((s) => s.stage === stage);
  if (!def) return '';
  const to = rangeEuro(def.toCents);
  return def.fromCents === 0
    ? `bis ${to}`
    : `${formatEuro(cents(def.fromCents), { cents: false }).replace(/ €$/, '')} bis ${to}`;
}

/** Message for a field whose text does not fit; `null` when it is fine. */
export function fieldError(spec: FieldSpec, text: string): string | null {
  if (spec.unit === 'boolean')
    return text === 'true' || text === 'false' ? null : 'Bitte ein oder aus wählen.';
  if (spec.unit === 'choice' || spec.unit === 'euro') return null;
  const value =
    spec.unit === 'pct' ? parseBp(text) : /^\d+$/.test(text.trim()) ? Number(text) : null;
  const min = spec.min ?? 0;
  const max = spec.max ?? Number.MAX_SAFE_INTEGER;
  if (value === null)
    return spec.unit === 'pct'
      ? 'Bitte eine Zahl mit höchstens zwei Nachkommastellen.'
      : 'Bitte eine ganze Zahl.';
  if (value < min || value > max)
    return spec.unit === 'pct'
      ? `Zwischen ${formatBp(min)} und ${formatBp(max)}.`
      : `Zwischen ${min} und ${max}.`;
  return null;
}

/** The wire value of a valid field text. */
export function fieldValue(spec: FieldSpec, text: string): number | string | boolean {
  if (spec.unit === 'boolean') return text === 'true';
  if (spec.unit === 'choice') return text;
  return spec.unit === 'pct' ? (parseBp(text) as number) : Number(text);
}
