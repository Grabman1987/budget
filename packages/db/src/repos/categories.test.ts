import { toBeAssignedFlow } from '@budget/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type Db } from '../client';
import { categoryGroup, payee } from '../schema';
import { undo } from './audit';
import { assignMany, budgetSummary, coverOverspending, moveMoney } from './budget';
import {
  categoryTree,
  createCategory,
  createCategoryGroup,
  deleteCategoryGroup,
  mergeCategories,
  setCategoryHidden,
  setCategoryTarget,
  sortCategories,
  splitOffCandidates,
  splitOffCategory,
  updateCategory,
} from './categories';
import { createBooking, deleteBooking } from './bookings';
import { accounts, createEntity, getEntity } from './entities';
import { getAssigned } from './envelopes';
import { budget } from './queries';

const ctx = { actor: 'tester' };
const MONTHS = ['2026-07', '2026-08', '2026-09', '2026-10'];
let db: Db;

function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Giro and a credit card on budget, two groups, four spending envelopes and the card envelope. */
function setup() {
  db = createTestDatabase().db;
  for (const [id, type] of [
    ['giro', 'checking'],
    ['karte', 'credit_card'],
  ] as const)
    accounts.create(
      db,
      { id, name: id, type, role: 'budget', onBudget: true, openingDate: '2026-07-01' },
      ctx,
    );
  createEntity(db, categoryGroup, { id: 'wohnen', name: 'Wohnen', sortOrder: 0 }, ctx);
  createEntity(db, categoryGroup, { id: 'genuss', name: 'Genuss', sortOrder: 1 }, ctx);
  const c = (id: string, groupId: string, kind: 'fixed' | 'variable' = 'variable') =>
    createCategory(db, { id, name: id, groupId, class: 'need', kind, stage: 2 } as never, ctx);
  c('miete', 'wohnen', 'fixed');
  c('strom', 'wohnen', 'fixed');
  c('essen', 'genuss');
  c('kaffee', 'genuss');
  createCategory(
    db,
    { name: 'Kartenzahlung', groupId: 'wohnen', kind: 'card_payment', cardAccountId: 'karte' },
    ctx,
  );
  createEntity(db, payee, { id: 'cafe', name: 'Café Eck', defaultCategoryId: 'kaffee' }, ctx);
}

/** Groups, categories (incl. opening envelope), targets and payees without their timestamps. */
function snapshot() {
  const strip = <T extends object>(rows: T[]) =>
    rows.map((row) => {
      const rest = { ...row } as Record<string, unknown>;
      delete rest['createdAt'];
      delete rest['updatedAt'];
      return rest;
    });
  const tree = categoryTree(db);
  return {
    groups: strip(tree.groups),
    categories: strip(tree.categories),
    targets: strip(tree.targets),
    payees: strip(db.select().from(payee).all()),
  };
}

const book = (accountId: string, date: string, amountCents: number, categoryId: string | null) =>
  createBooking(
    db,
    { accountId, date, amountCents, payeeId: 'cafe', splits: [{ categoryId, amountCents }] },
    ctx,
  );

/** A random ledger: income on giro, spending on giro and card, random assignments. */
function randomLedger(seed: number) {
  setup();
  const r = random(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]) => xs[int(0, xs.length - 1)] as T;
  for (const m of MONTHS) {
    book('giro', `${m}-01`, int(150_000, 300_000), null);
    for (let i = 0; i < 8; i++)
      book(
        pick(['giro', 'karte']),
        `${m}-${String(int(2, 28)).padStart(2, '0')}`,
        -int(500, 40_000),
        pick(['miete', 'strom', 'essen', 'kaffee']),
      );
    assignMany(
      db,
      m,
      ['miete', 'strom', 'essen', 'kaffee'].map((categoryId) => ({
        categoryId,
        assignedCents: int(0, 60_000),
      })),
      ctx,
    );
  }
  return { r, int, pick };
}

describe('categories', () => {
  beforeEach(setup);

  it('checks class, kind, card, stage and icon together', () => {
    const base = { name: 'X', groupId: 'genuss' };
    expect(() => createCategory(db, { ...base, class: null }, ctx)).toThrow(/Bedarf/);
    expect(() => createCategory(db, { ...base, kind: 'income', class: 'need' }, ctx)).toThrow(
      /keine Klasse/,
    );
    expect(() => createCategory(db, { ...base, class: 'want', stage: 10 }, ctx)).toThrow(/Stufe/);
    expect(() => createCategory(db, { ...base, class: 'want', icon: 'ab' }, ctx)).toThrow(/Emoji/);
    expect(() =>
      createCategory(db, { ...base, kind: 'card_payment', cardAccountId: 'karte' }, ctx),
    ).toThrow(/schon eine Kartenzahlung/);
    const row = createCategory(db, { ...base, class: 'want', icon: '👩‍🍳', stage: 2 }, ctx);
    expect(row).toMatchObject({ icon: '👩‍🍳', sortOrder: 2, kind: 'variable' });
    expect(updateCategory(db, row.id, { groupId: 'wohnen' }, ctx).sortOrder).toBe(3);
  });

  it('hides, sorts across groups and deletes only empty groups, each undoable', () => {
    setCategoryHidden(db, 'essen', true, ctx);
    expect(getEntity(db, categoryGroup, 'wohnen')).toBeTruthy();
    const { groupId } = sortCategories(
      db,
      [
        { id: 'genuss', categoryIds: ['kaffee', 'miete', 'essen'] },
        { id: 'wohnen', categoryIds: ['strom'] },
      ],
      ctx,
    );
    const tree = categoryTree(db);
    expect(tree.groups.map((g) => g.id)).toEqual(['genuss', 'wohnen']);
    const genuss = tree.categories.filter((c) => c.groupId === 'genuss').map((c) => c.id);
    expect(genuss).toEqual(['kaffee', 'miete', 'essen']);
    expect(tree.categories.find((c) => c.id === 'essen')?.hiddenAt).not.toBeNull();
    undo(db, { groupId }, ctx);
    expect(categoryTree(db).groups.map((g) => g.id)).toEqual(['wohnen', 'genuss']);
    const empty = createCategoryGroup(db, 'Leer', ctx);
    expect(() => deleteCategoryGroup(db, 'genuss', ctx)).toThrow(/noch Kategorien/);
    deleteCategoryGroup(db, empty.id, ctx);
    expect(categoryTree(db).groups).toHaveLength(2);
  });

  it('stores target versions and derives the need in the month summary', () => {
    setCategoryTarget(db, 'essen', { kind: 'monthly', amountCents: 30_000 }, '2026-07', ctx);
    setCategoryTarget(db, 'essen', { kind: 'monthly', amountCents: 40_000 }, '2026-10', ctx);
    setCategoryTarget(db, 'essen', { kind: 'monthly', amountCents: 45_000 }, '2026-10', ctx);
    assignMany(db, '2026-09', [{ categoryId: 'essen', assignedCents: 10_000 }], ctx);
    const env = (m: string) =>
      budgetSummary(db, m).summary.envelopes.find((e) => e.categoryId === 'essen');
    expect(env('2026-09')).toMatchObject({ goalCents: 30_000, needCents: 20_000 });
    // Refill: 450 € minus the 100 € carried from September.
    expect(env('2026-10')).toMatchObject({ goalCents: 35_000, needCents: 35_000 });
    expect(categoryTree(db).targets).toHaveLength(2);
    setCategoryTarget(db, 'essen', null, '2026-10', ctx);
    expect(env('2026-10')?.target).toBeNull();
  });
});

describe('budget writes', () => {
  beforeEach(setup);

  it('assigns, moves and covers overspending; each action is one undo', () => {
    book('giro', '2026-07-01', 200_000, null);
    book('giro', '2026-07-05', -12_000, 'essen');
    assignMany(db, '2026-07', [{ categoryId: 'kaffee', assignedCents: 20_000 }], ctx);
    const tba = () => budgetSummary(db, '2026-07').summary.toBeAssignedCents;
    // Overspending reduces "Zu verteilen" only next month (YNAB); this month it shows as −120 €.
    expect(tba()).toBe(180_000);
    const moved = moveMoney(db, '2026-07', 'kaffee', 'miete', 5_000, ctx);
    expect(getAssigned(db, '2026-07').map((r) => [r.categoryId, r.assignedCents])).toEqual([
      ['kaffee', 15_000],
      ['miete', 5_000],
    ]);
    const cover = coverOverspending(db, '2026-07', 'essen', 'kaffee', ctx);
    expect(cover.coveredCents).toBe(12_000);
    expect(budget(db, ['2026-07'])[0]?.envelopes['essen']?.availableCents).toBe(0);
    expect(() => coverOverspending(db, '2026-07', 'essen', null, ctx)).toThrow(/nicht überzogen/);
    undo(db, { groupId: cover.groupId }, ctx);
    undo(db, { groupId: moved.groupId }, ctx);
    expect(getAssigned(db, '2026-07').map((r) => r.assignedCents)).toEqual([20_000]);
    moveMoney(db, '2026-07', null, 'strom', 1_000, ctx);
    moveMoney(db, '2026-07', 'strom', null, 400, ctx);
    expect(budget(db, ['2026-07'])[0]?.envelopes['strom']?.assignedCents).toBe(600);
  });

  it('covering from "Zu verteilen" stops at what it holds unless going below 0 is confirmed', () => {
    book('giro', '2026-07-01', 5_000, null);
    book('giro', '2026-07-05', -12_000, 'essen');
    const tba = () => budgetSummary(db, '2026-07').summary.toBeAssignedCents;
    expect(tba()).toBe(5_000);
    const part = coverOverspending(db, '2026-07', 'essen', null, ctx);
    expect(part.coveredCents).toBe(5_000);
    expect(tba()).toBe(0);
    expect(() => coverOverspending(db, '2026-07', 'essen', null, ctx)).toThrow(/reicht nicht/);
    const rest = coverOverspending(db, '2026-07', 'essen', null, ctx, { allowNegative: true });
    expect(rest.coveredCents).toBe(7_000);
    expect(tba()).toBe(-7_000);
  });

  it('spending cannot be merged into an income category', () => {
    const lohn = createCategory(
      db,
      { name: 'Lohn', groupId: 'wohnen', kind: 'income', class: null },
      ctx,
    ).id;
    expect(() => mergeCategories(db, ['essen'], lohn, ctx)).toThrow(/nur Einnahmen/);
    const bonus = createCategory(
      db,
      { name: 'Bonus', groupId: 'wohnen', kind: 'income', class: null },
      ctx,
    ).id;
    expect(mergeCategories(db, [bonus], lohn, ctx).groupId).toBeTruthy();
  });

  it('a card payment envelope keeps its kind and card', () => {
    const kz = categoryTree(db).categories.find((c) => c.kind === 'card_payment')?.id as string;
    expect(() => updateCategory(db, kz, { kind: 'variable', class: 'need' }, ctx)).toThrow(
      /Kartenzahlung lässt sich nicht ändern/,
    );
    expect(() => updateCategory(db, kz, { cardAccountId: 'giro' }, ctx)).toThrow(/nicht ändern/);
    expect(updateCategory(db, kz, { name: 'Karte zahlen' }, ctx).name).toBe('Karte zahlen');
  });

  it('credit overspending on the card is reported apart from cash overspending', () => {
    book('giro', '2026-07-01', 100_000, null);
    assignMany(db, '2026-07', [{ categoryId: 'essen', assignedCents: 10_000 }], ctx);
    book('karte', '2026-07-03', -15_000, 'essen');
    book('giro', '2026-07-04', -3_000, 'kaffee');
    const { summary } = budgetSummary(db, '2026-07');
    expect(summary).toMatchObject({ creditOverspentCents: 5_000, cashOverspentCents: 3_000 });
    expect(summary.envelopes.find((e) => e.categoryId === 'essen')).toMatchObject({
      fundedCardCents: 10_000,
      creditOverspentCents: 5_000,
    });
    expect(summary.cards).toEqual([{ accountId: 'karte', cardDebtGrowthCents: 5_000 }]);
  });

  it('one category overspent on two cards: the credit part is shared by their spending', () => {
    accounts.create(
      db,
      {
        id: 'karte2',
        name: 'karte2',
        type: 'credit_card',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-07-01',
      },
      ctx,
    );
    createCategory(
      db,
      { name: 'Kartenzahlung 2', groupId: 'wohnen', kind: 'card_payment', cardAccountId: 'karte2' },
      ctx,
    );
    book('giro', '2026-07-01', 100_000, null);
    assignMany(db, '2026-07', [{ categoryId: 'essen', assignedCents: 10_000 }], ctx);
    book('karte', '2026-07-03', -9_000, 'essen');
    book('karte2', '2026-07-04', -3_000, 'essen');
    const { summary } = budgetSummary(db, '2026-07');
    expect(summary.envelopes.find((e) => e.categoryId === 'essen')).toMatchObject({
      fundedCardCents: 10_000,
      creditOverspentCents: 2_000,
      cashOverspentCents: 0,
    });
    expect(summary.cards).toEqual([
      { accountId: 'karte', cardDebtGrowthCents: 1_500 },
      { accountId: 'karte2', cardDebtGrowthCents: 500 },
    ]);
  });
});

// Integration-level properties (repositories + budget read model); the domain has its own 200-run
// property test of `budgetMonths`. Each ledger costs a fresh database, hence the longer timeout.
describe('property tests on random ledgers', { timeout: 60_000 }, () => {
  it('"Zu verteilen": stock = flow after random assign, move and cover actions (20 ledgers)', () => {
    for (let run = 0; run < 20; run++) {
      const { int, pick } = randomLedger(run + 1);
      for (let i = 0; i < 6; i++) {
        const m = pick(MONTHS);
        const envs = ['miete', 'strom', 'essen', 'kaffee'];
        const s = budgetSummary(db, m).summary;
        const over = s.envelopes.find((e) => e.overspentCents > 0);
        if (over && i % 2 === 0)
          coverOverspending(db, m, over.categoryId, null, ctx, { allowNegative: true });
        else {
          const [from, to] = [pick([null, ...envs]), pick(envs)];
          if (from !== to) moveMoney(db, m, from, to, int(1, 20_000), ctx);
        }
      }
      const months = budget(db, MONTHS);
      for (let i = 1; i < months.length; i++) {
        const [prev, cur] = [months[i - 1]!, months[i]!];
        const flow = toBeAssignedFlow({
          previousCents: prev.toBeAssignedCents,
          incomeCents: cur.incomeCents,
          assignedCents: cur.assignedCents,
          uncoveredCents: cur.uncoveredCents,
          heldPreviousCents: prev.heldCents,
          heldCents: cur.heldCents,
        });
        expect(flow, `run ${run} ${cur.month}`).toBe(cur.toBeAssignedCents);
        expect(budgetSummary(db, cur.month).summary.carryInCents).toBe(prev.toBeAssignedCents);
      }
    }
  });

  it('merge keeps every total and one undo restores the budget exactly (16 ledgers)', () => {
    let exactAvailable = 0;
    for (let run = 0; run < 16; run++) {
      const { pick } = randomLedger(1000 + run);
      // Every other ledger funds all envelopes generously: then even the carry is unchanged.
      if (run % 2 === 0)
        for (const m of MONTHS)
          assignMany(
            db,
            m,
            ['miete', 'strom', 'essen', 'kaffee'].map((categoryId) => ({
              categoryId,
              assignedCents: 400_000,
            })),
            ctx,
          );
      // Targets and opening envelopes on the sources, so the undo has them to restore too.
      setCategoryTarget(db, 'strom', { kind: 'monthly', amountCents: 9_000 }, '2026-07', ctx);
      setCategoryTarget(db, 'kaffee', { kind: 'monthly', amountCents: 4_000 }, '2026-08', ctx);
      updateCategory(db, 'kaffee', { openingAvailableCents: 1_500 } as never, ctx);
      const before = budget(db, MONTHS);
      const state = snapshot();
      const cardEnvelope = categoryTree(db).categories.find((c) => c.kind === 'card_payment')?.id;
      const target = pick(['miete', 'essen']);
      const sources = run % 3 === 0 ? ['strom', 'kaffee'] : [pick(['strom', 'kaffee'])];
      const merged = mergeCategories(db, sources, target, ctx);
      expect(getEntity(db, payee, 'cafe')?.defaultCategoryId).toBe(
        sources.includes('kaffee') ? target : 'kaffee',
      );
      const after = budget(db, MONTHS);
      const neverOverspent = before.every((m) =>
        [target, ...sources].every((id) => (m.envelopes[id]?.availableCents ?? 0) >= 0),
      );
      after.forEach((m, i) => {
        const b = before[i]!;
        const sum = (month: typeof m, f: 'assignedCents' | 'activityCents') =>
          Object.entries(month.envelopes)
            .filter(([id]) => id !== cardEnvelope)
            .reduce((a, [, e]) => a + e[f], 0);
        expect(m.assignedCents).toBe(b.assignedCents);
        expect(sum(m, 'activityCents')).toBe(sum(b, 'activityCents'));
        expect([m.incomeCents, m.cashCents]).toEqual([b.incomeCents, b.cashCents]);
        expect(m.envelopes[sources[0]!]).toBeUndefined();
        if (neverOverspent) {
          expect(m.toBeAssignedCents).toBe(b.toBeAssignedCents);
          expect(m.availableCents).toBe(b.availableCents);
        }
      });
      exactAvailable += neverOverspent ? 1 : 0;
      undo(db, { groupId: merged.groupId }, ctx);
      expect(budget(db, MONTHS)).toEqual(before);
      // … and the tree, targets, opening envelopes and payee defaults as they were.
      expect(snapshot()).toEqual(state);
    }
    expect(exactAvailable).toBeGreaterThan(0);
  });

  it('split-off moves the chosen bookings into a new category, one undo', () => {
    setup();
    book('giro', '2026-07-02', -1_000, 'essen');
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-07-03',
        amountCents: -2_500,
        memo: 'Pizza',
        splits: [{ categoryId: 'essen', amountCents: -2_500 }],
      },
      ctx,
    );
    const found = splitOffCandidates(db, 'essen', { q: 'pizz' });
    expect(found.map((f) => f.amountCents)).toEqual([-2_500]);
    const res = splitOffCategory(
      db,
      'essen',
      found.map((f) => f.splitId),
      { newCategory: { name: 'Lieferdienste', groupId: 'genuss', class: 'want', icon: '🍕' } },
      ctx,
    );
    const july = () => budget(db, ['2026-07'])[0]!.envelopes;
    expect(july()[res.targetId]?.activityCents).toBe(-2_500);
    expect(july()['essen']?.activityCents).toBe(-1_000);
    undo(db, { groupId: res.groupId }, ctx);
    expect(july()['essen']?.activityCents).toBe(-3_500);
    expect(categoryTree(db).categories.some((c) => c.name === 'Lieferdienste')).toBe(false);
  });

  it("split-off takes live bookings only and stores the new category's target", () => {
    setup();
    const gone = book('giro', '2026-07-02', -1_000, 'essen');
    const live = book('giro', '2026-07-03', -2_000, 'essen');
    const splitOf = (bookingId: string) =>
      splitOffCandidates(db, 'essen', {}).find((f) => f.bookingId === bookingId)?.splitId as string;
    const goneSplit = splitOf(gone);
    deleteBooking(db, gone, ctx);
    const into = { newCategory: { name: 'Neu', groupId: 'genuss', class: 'want' as const } };
    expect(() => splitOffCategory(db, 'essen', [goneSplit], into, ctx)).toThrow(/nicht \(mehr\)/);
    const res = splitOffCategory(
      db,
      'essen',
      [splitOf(live)],
      {
        ...into,
        target: { validFrom: '2026-07', target: { kind: 'monthly', amountCents: 3_000 } },
      },
      ctx,
    );
    expect(categoryTree(db).targets.filter((t) => t.categoryId === res.targetId)).toMatchObject([
      { kind: 'monthly', amountCents: 3_000, validFrom: '2026-07' },
    ]);
  });
});
