import { balanceChain, type ChainTerm } from '../chain';
import { daysBetween } from '../date';
import { cents } from '../money/cents';
import type { BudgetClass } from '../ledger/alloc';

/**
 * "Frei verfügbar bis Gehalt" (the Leitmaß of Heute): what is available in all Bedarf and Wunsch
 * envelopes minus the outflows that are still open and due before the next payday. Overspent
 * envelopes are negative and lower it. Port of `freeUntilPayday` and `renderChain` in
 * `design/prototype/app.js`. Integer cents.
 */

export interface FreeEnvelope {
  id: string;
  name: string;
  class: BudgetClass;
  /** Verfügbar: carry + assigned - spent. */
  availableCents: number;
}

export interface OpenOutflow {
  id: string;
  label: string;
  /** Due day `YYYY-MM-DD`. */
  day: string;
  /** Positive amount still to pay. */
  cents: number;
}

export interface FreeUntilPaydayInput {
  envelopes: ReadonlyArray<FreeEnvelope>;
  /** Expected outflows that are not paid yet (paid ones must not be passed). */
  openOutflows: ReadonlyArray<OpenOutflow>;
  /** `YYYY-MM-DD` of the next salary. Outflows due on or after it are not deducted. */
  payday: string;
  today: string;
  /** Rounding of the chain terms (`balanceChain`). Default: whole euros, the largest term absorbs. */
  precision?: 'euro' | 'cent';
}

export interface FreeUntilPayday {
  needCents: number;
  wantCents: number;
  openCents: number;
  freeCents: number;
  /** Whole days from today to payday (0 on payday, negative when it has passed). */
  daysToPayday: number;
  /** Maßkette: Bedarf + Wunsch - offen bis Gehalt = frei verfügbar, terms balanced for display. */
  chain: ChainTerm[];
  /** Drill-down behind the terms. */
  items: {
    need: FreeEnvelope[];
    want: FreeEnvelope[];
    open: OpenOutflow[];
  };
}

const sum = (xs: ReadonlyArray<number>): number => xs.reduce((a, v) => a + v, 0);

export function freeUntilPayday(input: FreeUntilPaydayInput): FreeUntilPayday {
  const need = input.envelopes.filter((e) => e.class === 'need');
  const want = input.envelopes.filter((e) => e.class === 'want');
  const open = input.openOutflows.filter((o) => o.day < input.payday);
  const needCents = sum(need.map((e) => e.availableCents));
  const wantCents = sum(want.map((e) => e.availableCents));
  const openCents = sum(open.map((o) => o.cents));
  const freeCents = needCents + wantCents - openCents;
  return {
    needCents,
    wantCents,
    openCents,
    freeCents,
    daysToPayday: daysBetween(input.today, input.payday),
    chain: balanceChain(
      [
        { label: 'Bedarf', value: cents(needCents) },
        { label: 'Wunsch', value: cents(wantCents), op: '+' },
        { label: 'offen bis Gehalt', value: cents(openCents), op: '-' },
        { label: 'frei verfügbar', value: cents(freeCents), op: '=', result: true },
      ],
      input.precision ?? 'euro',
    ),
    items: { need, want, open },
  };
}
