import { cents, formatEuro, mulDivRound, ratioBp, MINUS } from '@budget/domain';
import type {
  ClassGroup,
  PlanProposal,
  PortfolioSummary,
  PositionLine,
  PricePoint,
  PriceSource,
  RebalanceProposal,
  SavingsProposal,
} from './portfolio-api';

/** Display model of Vermögen › Portfolio. Pure: the figures come from the API, nothing is recomputed. */

const decimal = (value: number, digits: number) =>
  new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(value));

/** `77,8 %` from basis points (tenths of a percent, rounded half up). */
export function pctBp(bp: number, sign = false): string {
  const tenths = Math.round(Math.abs(bp) / 10);
  const text = `${decimal(tenths / 10, 1)} %`;
  return (bp < 0 && tenths > 0 ? MINUS : sign && tenths > 0 ? '+' : '') + text;
}

/** A limit without a needless decimal: `10 %` instead of `10,0 %`. */
export const limitText = (bp: number) => pctBp(bp).replace(',0 %', ' %');

/** `+6,0 %` from a ratio (TTWROR, IRR, benchmark). `–` when there is none. */
export function pctRatio(value: number | null | undefined, sign = true): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return pctBp(Math.round(value * 10_000), sign);
}

/** `−4,0 Pp` (percentage points) from basis points. */
export function ppBp(bp: number): string {
  const tenths = Math.round(Math.abs(bp) / 10);
  const sign = tenths === 0 ? '' : bp < 0 ? MINUS : '+';
  return `${sign}${decimal(tenths / 10, 1)} Pp`;
}

export const whole = (value: number, sign = false) =>
  formatEuro(cents(value), { cents: false, sign });
export const withCents = (value: number) => formatEuro(cents(value));

/** Units with two decimals, `,00` dropped: `612,40`, `218`, `0,04`. */
export function unitsText(unitsE8: number): string {
  const hundredths = Math.round(unitsE8 / 1_000_000);
  return decimal(hundredths / 100, 2).replace(/,00$/, '');
}

/** Price per unit in cents from the position's value (exact BigInt product). */
export function unitPriceCents(valueCents: number, unitsE8: number): number | null {
  return unitsE8 > 0 ? mulDivRound(valueCents, 100_000_000, unitsE8) : null;
}

/** Return since purchase in bp (gain over cost basis); `null` without a cost basis. */
export function gainBp(position: { gainCents: number; costCents: number }): number | null {
  return ratioBp(position.gainCents, position.costCents);
}

// ---------- lead ----------

export interface LeadState {
  ok: boolean;
  text: string;
}

export function leadState(p: PortfolioSummary): LeadState {
  const n = p.allocation.breaches.length;
  if (n === 0) return { ok: true, text: 'Allocation im Band' };
  return { ok: false, text: `${n} ${n === 1 ? 'Klasse' : 'Klassen'} außerhalb des Bands` };
}

export interface Kpi {
  id: string;
  label: string;
  value: string;
  note: string;
}

const PERIOD_TEXT: Record<string, string> = {
  '1M': 'letzter Monat',
  '3M': 'letzte 3 Monate',
  YTD: 'seit Jahresbeginn',
  '1J': 'letzte 12 Monate',
  '3J': 'letzte 3 Jahre',
  Alles: 'seit Beginn',
};
export const periodText = (period: string) => PERIOD_TEXT[period] ?? period;

/** `0,16 %`: a cost rate needs two decimals. */
const costRate = (bp: number) => `${decimal(bp / 100, 2)} %`;

/** Wert · TTWROR · IRR · Weltindex · Kosten · Ausschüttungen (costs and income: last 12 months). */
export function kpiRow(p: PortfolioSummary): Kpi[] {
  const perf = p.performance;
  const long = perf !== null && perf.days > 366;
  return [
    { id: 'wert', label: 'Wert', value: whole(p.valueCents), note: 'heute' },
    { id: 'ttwror', label: 'TTWROR', value: pctRatio(perf?.ttwror), note: periodText(p.period) },
    {
      id: 'irr',
      label: 'IRR',
      value: pctRatio(perf?.moneyWeighted),
      note: long ? 'je Jahr' : periodText(p.period),
    },
    {
      id: 'index',
      label: 'Weltindex',
      value: pctRatio(perf?.benchmarkTtwror),
      note: p.benchmark?.name ?? 'kein Vergleich',
    },
    {
      id: 'kosten',
      label: 'Kosten',
      value: whole(p.costs.totalCents),
      note: `12 M · ${costRate(p.costs.costRateBp)}`,
    },
    {
      id: 'ausschuettung',
      label: 'Ausschüttungen',
      value: whole(p.income.grossCents),
      note: `12 M · netto ${whole(p.income.netCents)}`,
    },
  ];
}

// ---------- Sparpläne ----------

export interface PlanRowView {
  id: string;
  name: string;
  nowCents: number;
  nextCents: number;
  reason: string;
}

const KIND_LABEL: Record<string, string> = { stock: 'Einzelaktien', crypto: 'Krypto', p2p: 'P2P' };
const SPECULATIVE_ORDER = ['stock', 'crypto', 'p2p'];

/** Sub-line of a speculative class: "Einzelaktien, Krypto, P2P". */
export function classNote(group: ClassGroup): string | null {
  const present = new Set(group.positions.map((p) => p.kind));
  const kinds = SPECULATIVE_ORDER.filter((k) => present.has(k as never));
  return kinds.length > 0 && kinds.length === present.size
    ? kinds.map((k) => KIND_LABEL[k]).join(', ')
    : null;
}

/**
 * Rows of the Sparpläne table, largest rate first, with the reason in words. The first plan that
 * R15 pauses carries the full sentence, the following ones only the rule.
 */
export function planRows(summary: PortfolioSummary, data: SavingsProposal): PlanRowView[] {
  const securityOfPlan = new Map(data.basis.map((b) => [b.id, b.securityId]));
  const classOfSecurity = new Map(summary.positions.map((p) => [p.securityId, p.assetClassId]));
  const rowOfClass = new Map(summary.allocation.rows.map((r) => [r.assetClass, r]));
  const rowFor = (plan: PlanProposal) => {
    const security = securityOfPlan.get(plan.id);
    const klass = security ? classOfSecurity.get(security) : null;
    return klass ? rowOfClass.get(klass) : undefined;
  };
  let r15Said = false;
  return [...data.proposal.plans]
    .sort((a, b) => b.currentCents - a.currentCents || a.name.localeCompare(b.name, 'de'))
    .map((plan) => {
      const row = rowFor(plan);
      const soll = row?.targetBp != null ? pctBp(row.targetBp) : null;
      const ist = row ? pctBp(row.shareBp) : null;
      let reason: string;
      switch (plan.reason) {
        case 'paused_r15':
          reason = r15Said
            ? 'R15'
            : `spekulativer Anteil ${pctBp(summary.speculative.shareBp)} über ${limitText(summary.speculative.limitBp)}, R15`;
          r15Said = true;
          break;
        case 'steer_r13_under':
          reason = `unter Soll (${ist ?? '–'} statt ${soll ?? '–'}), R13`;
          break;
        case 'paused_r13_over':
          reason = `über Soll (${ist ?? '–'} statt ${soll ?? '–'}), R13`;
          break;
        case 'redistributed':
          reason = 'Rate aus pausierten Plänen verteilt';
          break;
        case 'rounded':
          reason =
            soll && ist
              ? `Soll ${soll.replace(',0 %', ' %')}, Ist ${ist}: bleibt Hauptposition`
              : 'auf volle Stufe gerundet';
          break;
        default:
          reason = 'keine Änderung';
      }
      return {
        id: plan.id,
        name: plan.name,
        nowCents: plan.currentCents,
        nextCents: plan.proposedCents,
        reason,
      };
    });
}

/** "400 € im Monat · am 5." (the day when all plans share one). */
export function plansAside(data: SavingsProposal): string {
  const total = whole(data.proposal.totalCents);
  const days = [...new Set(data.basis.map((b) => b.dayOfMonth))];
  if (days.length === 1) return `${total} im Monat · am ${String(days[0])}.`;
  return `${total} im Monat${days.length > 1 ? ' · an mehreren Tagen' : ''}`;
}

// ---------- Aufteilung Soll/Ist ----------

export interface TrackView {
  key: string;
  name: string;
  note: string | null;
  out: boolean;
  /** Everything in percent of the track (0-100). */
  bandLeft: number;
  bandWidth: number;
  istWidth: number;
  sollLeft: number;
  ist: string;
  soll: string;
  /** Spoken for screen readers: the track itself is a drawing. */
  summary: string;
}

const pctOfTrack = (bp: number) => Math.min(100, Math.max(0, bp / 100));

export function tracks(p: PortfolioSummary): TrackView[] {
  const rowOf = new Map(p.allocation.rows.map((r) => [r.assetClass, r]));
  return p.classes.flatMap((group) => {
    const row = group.assetClassId ? rowOf.get(group.assetClassId) : undefined;
    if (!row || row.targetBp === null) return [];
    const band = row.bandBp ?? 0;
    const deviation = row.shareBp - row.targetBp;
    const bandLeft = pctOfTrack(row.targetBp - band);
    return [
      {
        key: group.assetClassId ?? group.name,
        name: group.name,
        note: row.speculativeOnly ? classNote(group) : null,
        out: row.breach,
        bandLeft,
        bandWidth: Math.min(100 - bandLeft, (band * 2) / 100),
        istWidth: pctOfTrack(row.shareBp),
        sollLeft: pctOfTrack(row.targetBp),
        ist: pctBp(row.shareBp),
        soll: pctBp(row.targetBp),
        summary: `Abweichung vom Soll ${ppBp(deviation)}, Band ±${ppBp(band).replace('+', '')}${
          row.breach ? ', außerhalb' : ', im Band'
        }`,
      },
    ];
  });
}

// ---------- Rebalancing ----------

export interface RebalanceRowView {
  id: string;
  letter: string;
  title: string;
  detail: string;
  /** What the action does: scroll to the savings plans or open the rule. */
  action: 'plans' | 'rule';
  actionLabel: string;
}

const LETTERS = 'ABCDEFGHIJ';

export function rebalanceRows(p: PortfolioSummary): RebalanceRowView[] {
  const className = (id: string | null) => (id ? (p.names.assetClasses[id] ?? '–') : '–');
  const rule = 'Regel ansehen';
  const describe = (r: RebalanceProposal): Omit<RebalanceRowView, 'id' | 'letter'> => {
    const gap = whole(r.gapCents);
    switch (r.code) {
      case 'r13_under':
        return {
          title: `${className(r.assetClass)} unter Soll`,
          detail: `${pctBp(r.shareBp)} statt ${pctBp(r.referenceBp)} · ${gap} fehlen. Nächste Sparraten dorthin lenken (Wasserfall Stufe 8: am stärksten untergewichtete Klasse zuerst).`,
          action: 'plans',
          actionLabel: 'Sparplan umlenken',
        };
      case 'r13_over':
        return {
          title: `${className(r.assetClass)} über Soll`,
          detail: `${pctBp(r.shareBp)} statt ${pctBp(r.referenceBp)} · ${gap} darüber. Keine Zukäufe, bis die Klasse im Band liegt.`,
          action: 'rule',
          actionLabel: rule,
        };
      case 'r14_single':
        return {
          title: `${p.names.securities[r.subjectId ?? ''] ?? 'Einzeltitel'} ${pctBp(r.shareBp)} über ${limitText(r.referenceBp)} (R14)`,
          detail: `${gap} über der Grenze für einen Einzeltitel.`,
          action: 'rule',
          actionLabel: rule,
        };
      case 'r14_platform':
        return {
          title: `${p.names.institutions[r.subjectId ?? ''] ?? 'Plattform'} ${pctBp(r.shareBp)} über ${limitText(r.referenceBp)} (R14)`,
          detail: `${gap} über der Grenze je Plattform.`,
          action: 'rule',
          actionLabel: rule,
        };
      case 'r15_speculative':
        return {
          title: `Spekulativer Anteil ${pctBp(r.shareBp)} über ${limitText(r.referenceBp)} (R15)`,
          detail: `${gap} über der Grenze. Keine Zukäufe bei Krypto, P2P und Einzelaktien, bis der Anteil unter ${limitText(r.referenceBp)} liegt.`,
          action: 'rule',
          actionLabel: rule,
        };
    }
  };
  return p.proposals.map((r, i) => ({
    id: `${r.code}-${r.assetClass ?? r.subjectId ?? ''}`,
    letter: LETTERS[i] ?? String(i + 1),
    ...describe(r),
  }));
}

// ---------- Positionen ----------

export interface PositionView {
  position: PositionLine;
  no: string;
  platform: string;
  units: string;
  price: string;
  value: string;
  share: string;
  gain: string;
}

export interface GroupView {
  key: string;
  no: number;
  name: string;
  value: string;
  share: string;
  positions: PositionView[];
}

export function positionGroups(p: PortfolioSummary): GroupView[] {
  return p.classes.map((group, gi) => ({
    key: group.assetClassId ?? group.name,
    no: gi + 1,
    name: group.name,
    value: whole(group.valueCents),
    share: pctBp(group.shareBp),
    positions: group.positions.map((pos, pi) => {
      // P2P loans have no quote; the platform reports the value.
      const manual = pos.kind === 'p2p';
      const price = manual ? null : unitPriceCents(pos.valueCents, pos.unitsE8);
      const gain = gainBp(pos);
      return {
        position: pos,
        no: `${gi + 1}.${pi + 1}`,
        platform: pos.institutionId ? (p.names.institutions[pos.institutionId] ?? '–') : '–',
        units: manual ? '—' : unitsText(pos.unitsE8),
        price: price === null ? 'manuell' : withCents(price),
        value: whole(pos.valueCents),
        share: pctBp(pos.shareBp),
        gain: gain === null ? '–' : pctBp(gain, true),
      };
    }),
  }));
}

// ---------- price history of a product ----------

export const SOURCE_LABEL: Record<PriceSource, string> = {
  yfinance: 'yfinance',
  ariva: 'Ariva',
  manual: 'von Hand',
  import: 'Import',
};

/** `111,86 €` for a price in micro units. */
export function priceText(priceMicro: number, currency: string): string {
  const hundredths = mulDivRound(priceMicro, 1, 10_000);
  return `${hundredths < 0 ? MINUS : ''}${decimal(hundredths / 100, 2)} ${currency === 'EUR' ? '€' : currency}`;
}

/** Source of every price in short: "yfinance 214 · von Hand 2". */
export function sourceSummary(prices: ReadonlyArray<PricePoint>): string {
  const counts = new Map<PriceSource, number>();
  for (const p of prices) counts.set(p.source, (counts.get(p.source) ?? 0) + 1);
  return [...counts.entries()].map(([s, n]) => `${SOURCE_LABEL[s]} ${n}`).join(' · ');
}
