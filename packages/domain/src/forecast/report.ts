import { addDays, addMonths, daysBetween, lastDayOfMonth, monthOf } from '../date';
import {
  evenDaily,
  liquidityForecast,
  lowPoint,
  type ForecastDay,
  type ForecastItem,
  type LiquidityForecast,
  type LowPoint,
} from './liquidity';

/**
 * Report 3.1 Liquiditätsprognose, calculated: the forecast of the budget accounts with and without
 * the planned events, with a 10 % buffer on the planned variable spending, the 6-month verdict, the
 * month outlook, the large movements per month and the levers. Port of `R.liquiditaet` in
 * `design/prototype/reports-zukunft.js` on top of `liquidityForecast`; every number comes in as data.
 * The surplus transfer of the prototype ("Überschuss → Tagesgeld") is not part of it: the app has
 * no stored rule for it, so the balance is the money that stays on the budget accounts.
 */

/** Variable spending rises by this share for the "mit Puffer" run (SPEC section 6). */
export const LIQUIDITY_BUFFER_PERCENT = 10;
/** Movements from this amount on get their own line in the movement list. */
export const BIG_MOVEMENT_CENTS = 25_000;
/** The verdict looks six months ahead. */
export const VERDICT_MONTHS = 6;

export type LiquidityHorizon = '90d' | '6m' | '12m';
export const LIQUIDITY_HORIZONS: ReadonlyArray<LiquidityHorizon> = ['90d', '6m', '12m'];

/**
 * Levers the plan can pull when it gets tight. Each one is derived from what the ledger holds:
 * - `pause-future`: payments into the Zukunft class (savings plans, reserves) stop for 90 days;
 * - `cancel-want`: scheduled payments of the Wunsch class stop from next month on (contracts);
 * - `trim-variable`: the planned variable spending shrinks by 10 %.
 */
export const LIQUIDITY_LEVERS = ['pause-future', 'cancel-want', 'trim-variable'] as const;
export type LiquidityLeverId = (typeof LIQUIDITY_LEVERS)[number];
export const PAUSE_FUTURE_DAYS = 90;
export const TRIM_VARIABLE_PERCENT = 10;

export interface LiquidityReportInput {
  /** Day 0 (today). */
  startDay: string;
  startCents: number;
  /** Scheduled income and payments (kinds `income` and `fixed`) on the budget accounts. */
  items: ReadonlyArray<ForecastItem>;
  /** Planned events (kind `event`) on the budget accounts. */
  events: ReadonlyArray<ForecastItem>;
  /** Planned variable spending per month, positive cents. */
  variableMonthlyCents: number;
  horizon: LiquidityHorizon;
  levers: ReadonlyArray<LiquidityLeverId>;
}

export interface LiquidityPoint {
  day: string;
  /** With planned events. */
  balanceCents: number;
  /** With planned events and 10 % more variable spending. */
  bufferCents: number;
  /** Without planned events. */
  plainCents: number;
}

export type VerdictStatus = 'ok' | 'warn' | 'bad';

export interface LiquidityVerdict {
  status: VerdictStatus;
  /** Month of the deepest point that decides the verdict (`warn`: with buffer, `bad`: without). */
  month: string | null;
  /** Positive amount that is missing in that month; 0 for `ok`. */
  shortfallCents: number;
}

export interface LiquidityMonthRow {
  month: string;
  startCents: number;
  incomeCents: number;
  /** Negative: scheduled payments. */
  fixedCents: number;
  /** Negative: planned variable spending. */
  variableCents: number;
  eventCents: number;
  endCents: number;
  lowCents: number;
  /** Lowest balance of the month with the buffer on variable spending. */
  lowBufferCents: number;
  /** The month starts after the start day (the first row) or ends before its last day (the last). */
  partialStart: boolean;
  partialEnd: boolean;
}

export interface LiquidityMovement {
  day: string;
  label: string;
  cents: number;
  afterCents: number;
  planned: boolean;
}

export interface LiquidityMovementMonth {
  month: string;
  startCents: number;
  endCents: number;
  lastDay: string;
  rows: LiquidityMovement[];
  /** Everything else of the month: variable spending and the small payments. */
  restCents: number;
}

export interface LiquidityLever {
  id: LiquidityLeverId;
  /** The ledger holds something this lever acts on. */
  available: boolean;
  active: boolean;
  /** Names of what the lever acts on (at most 4). */
  labels: string[];
  /** How much the lowest balance of the next 6 months rises (falls back when active) by switching. */
  gainCents: number;
}

export interface LiquidityReport {
  startDay: string;
  startCents: number;
  horizon: LiquidityHorizon;
  /** Days after the start day that the chart and the movements cover. */
  horizonDays: number;
  /** Days after the start day that the verdict and the month outlook cover (6 months). */
  verdictDays: number;
  verdictEnd: string;
  points: LiquidityPoint[];
  /** Planned events inside the horizon, for the chart marks. */
  eventMarks: { day: string; label: string; cents: number }[];
  /** Lowest balance within the horizon: with events, with buffer, without events. */
  low: LowPoint | null;
  lowBuffer: LowPoint | null;
  lowPlain: LowPoint | null;
  verdict: LiquidityVerdict;
  months: LiquidityMonthRow[];
  movements: LiquidityMovementMonth[];
  levers: LiquidityLever[];
}

/** The same day of the month `n` months later; a missing day (31st) falls to the month's last day. */
export function sameDayInMonths(day: string, n: number): string {
  const month = addMonths(monthOf(day), n);
  const last = lastDayOfMonth(month);
  const d = Math.min(Number(day.slice(8)), Number(last.slice(8)));
  return `${month}-${String(d).padStart(2, '0')}`;
}

/** Days after `startDay` that a horizon covers. */
export function horizonDays(horizon: LiquidityHorizon, startDay: string): number {
  if (horizon === '90d') return 90;
  return daysBetween(startDay, sameDayInMonths(startDay, horizon === '6m' ? 6 : 12));
}

const percentOf = (cents: number, percent: number): number => Math.round((cents * percent) / 100);

/** What the levers change: the scheduled items and the planned variable spending. */
function applyLevers(
  input: Pick<LiquidityReportInput, 'startDay' | 'items' | 'variableMonthlyCents'>,
  levers: ReadonlyArray<LiquidityLeverId>,
): { items: ForecastItem[]; variableMonthlyCents: number } {
  const pauseUntil = addDays(input.startDay, PAUSE_FUTURE_DAYS);
  const firstWantDay = `${addMonths(monthOf(input.startDay), 1)}-01`;
  const items = input.items.filter((i) => {
    if (i.cents >= 0) return true;
    if (levers.includes('pause-future') && i.group === 'future' && i.day <= pauseUntil)
      return false;
    if (levers.includes('cancel-want') && i.group === 'want' && i.day >= firstWantDay) return false;
    return true;
  });
  const variableMonthlyCents = levers.includes('trim-variable')
    ? input.variableMonthlyCents - percentOf(input.variableMonthlyCents, TRIM_VARIABLE_PERCENT)
    : input.variableMonthlyCents;
  return { items, variableMonthlyCents };
}

function run(
  input: LiquidityReportInput,
  levers: ReadonlyArray<LiquidityLeverId>,
  options: { events: boolean; buffer: boolean },
): LiquidityForecast {
  const applied = applyLevers(input, levers);
  const variable = options.buffer
    ? applied.variableMonthlyCents +
      percentOf(applied.variableMonthlyCents, LIQUIDITY_BUFFER_PERCENT)
    : applied.variableMonthlyCents;
  return liquidityForecast({
    startDay: input.startDay,
    startCents: input.startCents,
    days: daysBetween(input.startDay, sameDayInMonths(input.startDay, 12)),
    items: options.events ? [...applied.items, ...input.events] : applied.items,
    variablePerDay: evenDaily(() => variable),
  });
}

const lowIn = (days: ReadonlyArray<ForecastDay>, within: number): LowPoint | null =>
  lowPoint(days, within);

function verdictOf(low: LowPoint | null, lowBuffer: LowPoint | null): LiquidityVerdict {
  if (!low || !lowBuffer) return { status: 'ok', month: null, shortfallCents: 0 };
  if (lowBuffer.cents >= 0) return { status: 'ok', month: null, shortfallCents: 0 };
  if (low.cents >= 0)
    return { status: 'warn', month: monthOf(lowBuffer.day), shortfallCents: -lowBuffer.cents };
  return { status: 'bad', month: monthOf(low.day), shortfallCents: -low.cents };
}

/** Month rows of the first `days` days; the first month starts with the start balance. */
function monthRows(
  base: ReadonlyArray<ForecastDay>,
  buffer: ReadonlyArray<ForecastDay>,
  startCents: number,
  days: number,
): LiquidityMonthRow[] {
  const rows: LiquidityMonthRow[] = [];
  let row: LiquidityMonthRow | null = null;
  let previous = startCents;
  let previousBuffer = startCents;
  for (const d of base) {
    if (d.index > days) break;
    const month = monthOf(d.day);
    if (!row || row.month !== month) {
      row = {
        month,
        startCents: previous,
        incomeCents: 0,
        fixedCents: 0,
        variableCents: 0,
        eventCents: 0,
        endCents: previous,
        lowCents: previous,
        lowBufferCents: previousBuffer,
        partialStart: d.day !== `${month}-01`,
        partialEnd: false,
      };
      rows.push(row);
    }
    row.variableCents -= d.variableCents;
    for (const item of d.items) {
      if (item.kind === 'income') row.incomeCents += item.cents;
      else if (item.kind === 'fixed') row.fixedCents += item.cents;
      else if (item.kind === 'event') row.eventCents += item.cents;
    }
    row.endCents = d.balanceCents;
    row.lowCents = Math.min(row.lowCents, d.balanceCents);
    const b = buffer[d.index]?.balanceCents ?? d.balanceCents;
    row.lowBufferCents = Math.min(row.lowBufferCents, b);
    row.partialEnd = d.day !== lastDayOfMonth(month);
    previous = d.balanceCents;
    previousBuffer = b;
  }
  return rows;
}

/** Large movements and planned events per month, the rest folded into one line. */
function movementMonths(
  base: ReadonlyArray<ForecastDay>,
  startCents: number,
  days: number,
): LiquidityMovementMonth[] {
  const out: LiquidityMovementMonth[] = [];
  let block: LiquidityMovementMonth | null = null;
  let previous = startCents;
  let big = 0;
  for (const d of base) {
    if (d.index > days) break;
    const month = monthOf(d.day);
    if (!block || block.month !== month) {
      block = {
        month,
        startCents: previous,
        endCents: previous,
        lastDay: d.day,
        rows: [],
        restCents: 0,
      };
      big = 0;
      out.push(block);
    }
    let balance = previous - d.variableCents;
    for (const item of d.items) {
      balance += item.cents;
      const planned = item.kind === 'event';
      if (planned || Math.abs(item.cents) >= BIG_MOVEMENT_CENTS) {
        block.rows.push({
          day: d.day,
          label: item.label ?? (item.cents >= 0 ? 'Einnahme' : 'Zahlung'),
          cents: item.cents,
          afterCents: balance,
          planned,
        });
        big += item.cents;
      }
    }
    block.endCents = d.balanceCents;
    block.lastDay = d.day;
    block.restCents = block.endCents - block.startCents - big;
    previous = d.balanceCents;
  }
  return out;
}

const uniqueLabels = (items: ReadonlyArray<ForecastItem>): string[] => [
  ...new Set(items.flatMap((i) => (i.label ? [i.label] : []))),
];

/** What each lever acts on right now, from the items of the horizon. */
function leverTargets(input: LiquidityReportInput): Record<LiquidityLeverId, string[] | null> {
  const pauseUntil = addDays(input.startDay, PAUSE_FUTURE_DAYS);
  const firstWantDay = `${addMonths(monthOf(input.startDay), 1)}-01`;
  const last = sameDayInMonths(input.startDay, 12);
  const outflows = input.items.filter((i) => i.cents < 0 && i.day <= last);
  const future = outflows.filter((i) => i.group === 'future' && i.day <= pauseUntil);
  const want = outflows.filter((i) => i.group === 'want' && i.day >= firstWantDay);
  return {
    'pause-future': future.length > 0 ? uniqueLabels(future).slice(0, 4) : null,
    'cancel-want': want.length > 0 ? uniqueLabels(want).slice(0, 4) : null,
    'trim-variable': input.variableMonthlyCents > 0 ? [] : null,
  };
}

export function liquidityReport(input: LiquidityReportInput): LiquidityReport {
  const active = LIQUIDITY_LEVERS.filter((id) => input.levers.includes(id));
  const withEvents = run(input, active, { events: true, buffer: false });
  const buffered = run(input, active, { events: true, buffer: true });
  const plain = run(input, active, { events: false, buffer: false });

  const hDays = horizonDays(input.horizon, input.startDay);
  const vDays = horizonDays('6m', input.startDay);
  const points: LiquidityPoint[] = withEvents.days
    .filter((d) => d.index <= hDays)
    .map((d) => ({
      day: d.day,
      balanceCents: d.balanceCents,
      bufferCents: buffered.days[d.index]?.balanceCents ?? d.balanceCents,
      plainCents: plain.days[d.index]?.balanceCents ?? d.balanceCents,
    }));
  const end = addDays(input.startDay, hDays);
  const eventMarks = input.events
    .filter((e) => e.day > input.startDay && e.day <= end)
    .map((e) => ({ day: e.day, label: e.label ?? 'Ereignis', cents: e.cents }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const low6 = lowIn(withEvents.days, vDays);
  const lowBuffer6 = lowIn(buffered.days, vDays);
  const targets = leverTargets(input);
  const levers = LIQUIDITY_LEVERS.map((id): LiquidityLever => {
    const isActive = active.includes(id);
    const toggled = isActive ? active.filter((l) => l !== id) : [...active, id];
    const gainRun = run(input, toggled, { events: true, buffer: false });
    const gain = (lowIn(gainRun.days, vDays)?.cents ?? 0) - (low6?.cents ?? 0);
    return {
      id,
      available: targets[id] !== null,
      active: isActive,
      labels: targets[id] ?? [],
      gainCents: gain,
    };
  });

  return {
    startDay: input.startDay,
    startCents: input.startCents,
    horizon: input.horizon,
    horizonDays: hDays,
    verdictDays: vDays,
    verdictEnd: addDays(input.startDay, vDays),
    points,
    eventMarks,
    low: lowIn(withEvents.days, hDays),
    lowBuffer: lowIn(buffered.days, hDays),
    lowPlain: lowIn(plain.days, hDays),
    verdict: verdictOf(low6, lowBuffer6),
    months: monthRows(withEvents.days, buffered.days, input.startCents, vDays),
    movements: movementMonths(withEvents.days, input.startCents, hDays),
    levers,
  };
}
