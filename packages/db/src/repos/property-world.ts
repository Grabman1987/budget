import { addDays } from '@budget/domain';
import fc from 'fast-check';
import type { OpenedDatabase } from '../client';
import { categoryGroup } from '../schema';
import type { AuditContext } from './audit';
import { createBooking, type BookingInput } from './bookings';
import { accounts, categories, createEntity } from './entities';
import { testCtx } from './test-helpers';

/**
 * Synthetic world and generators of the randomized money-invariant tests (cockpit F8). Test code
 * only; every name and amount is synthetic.
 */
export const BASE_DAY = '2025-12-20';
export const WORLD_DAYS = 150;
export const WORLD_MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
export const CATEGORY_IDS = ['miete', 'essen', 'reise'] as const;
export const BUDGET_ACCOUNTS = ['giro', 'spar'] as const;
export const ALL_ACCOUNTS = ['giro', 'spar', 'depot'] as const;
export type AccountId = (typeof ALL_ACCOUNTS)[number];
export type CategoryId = (typeof CATEGORY_IDS)[number];

export interface WorldSpec {
  openings: Record<AccountId, { balanceCents: number; day: number }>;
}

export const dayArb = fc.integer({ min: 0, max: WORLD_DAYS }).map((n) => addDays(BASE_DAY, n));

const openingArb = fc.record({
  balanceCents: fc.integer({ min: -50_000, max: 500_000 }),
  // Opening dates inside the range, so bookings fall before, on and after the boundary.
  day: fc.integer({ min: 11, max: 90 }),
});
export const worldArb: fc.Arbitrary<WorldSpec> = fc.record({
  openings: fc.record({ giro: openingArb, spar: openingArb, depot: openingArb }),
});

/** Create accounts (two on budget, one tracking) and three envelopes in a fresh test database. */
export function seedWorld(db: OpenedDatabase['db'], spec: WorldSpec): void {
  const ctx = testCtx;
  const base = {
    giro: { name: 'Giro', type: 'checking', role: 'budget', onBudget: true },
    spar: { name: 'Sparen', type: 'savings', role: 'reserve', onBudget: true },
    depot: { name: 'Depot', type: 'other_asset', role: 'investment', onBudget: false },
  } as const;
  ALL_ACCOUNTS.forEach((id, index) => {
    const opening = spec.openings[id];
    accounts.create(
      db,
      {
        id,
        ...base[id],
        openingDate: addDays(BASE_DAY, opening.day),
        openingBalanceCents: opening.balanceCents,
        sortOrder: index,
      },
      ctx,
    );
  });
  createEntity(db, categoryGroup, { id: 'g', name: 'Fixkosten' }, ctx);
  for (const id of CATEGORY_IDS)
    categories.create(db, { id, name: id, groupId: 'g', class: 'need' }, ctx);
}

export interface BookingSpec {
  account: AccountId;
  date: string;
  sign: 1 | -1;
  /** Positive split parts; the booking amount is their signed sum. */
  parts: number[];
  categories: Array<CategoryId | null>;
  status: 'pending' | 'confirmed';
}

export const bookingSpecArb: fc.Arbitrary<BookingSpec> = fc.record({
  account: fc.constantFrom(...ALL_ACCOUNTS),
  date: dayArb,
  sign: fc.constantFrom<1 | -1>(1, -1),
  parts: fc.array(fc.integer({ min: 1, max: 50_000 }), { minLength: 1, maxLength: 4 }),
  categories: fc.array(fc.constantFrom<CategoryId | null>(...CATEGORY_IDS, null), {
    minLength: 4,
    maxLength: 4,
  }),
  status: fc.constantFrom('pending', 'confirmed', 'confirmed'),
});

/** The write input of a spec: only outflows on budget accounts carry an envelope. */
export function bookingInputOf(spec: BookingSpec): BookingInput {
  const budget = spec.account !== 'depot';
  const amountCents = spec.sign * spec.parts.reduce((a, b) => a + b, 0);
  return {
    accountId: spec.account,
    date: spec.date,
    amountCents,
    status: spec.status,
    splits: spec.parts.map((part, i) => ({
      amountCents: spec.sign * part,
      categoryId: budget && spec.sign === -1 ? (spec.categories[i] ?? null) : null,
    })),
  };
}

export function createFromSpec(
  db: OpenedDatabase['db'],
  spec: BookingSpec,
  ctx: AuditContext = testCtx,
): string {
  return createBooking(db, bookingInputOf(spec), ctx);
}
