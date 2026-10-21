import { afterEach, beforeEach, expect, it } from 'vitest';
import { candidateFits, parseStatementText, type StatementBonusEvidence } from '@budget/domain';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { categoryGroup, payee } from '../schema';
import { accounts, categories, createEntity } from './entities';
import { createBooking, createTransfer, getBooking } from './bookings';
import { history } from './audit';
import { balanceSeries } from './ledger-queries';
import { stageStatementIntake, mutateStatementIntake } from './statement-intake';
import { performStatementAction } from './statement-settlement';
import { statementForecastLegs } from './statement-settlement-read';
import { accountPreview, unbookedAccountOccurrences } from './account-preview';
import { forecastInputs, loadFacts, scheduled } from './rule-inputs';
import { liquidityReportView } from './liquidity-report';
import { readPaymentsPreview } from './payments-preview';
import { createExpectedPayment, upcoming } from './expected';

const FUND = '72700000-0000-4000-8000-000000000001';
const CARD = '72700000-0000-4000-8000-000000000002';
const GROUP = '72700000-0000-4000-8000-000000000010';
const EXPENSE = '72700000-0000-4000-8000-000000000011';
const PAYEE = '72700000-0000-4000-8000-000000000020';
const ctx = { actor: 'synthetic-727-projections' };
let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
});
afterEach(() => opened.close());
const action = (input: unknown) => performStatementAction(opened.db, input, ctx);
const nativeBalances = (day: string) =>
  Object.fromEntries(
    [FUND, CARD].map((id) => [
      id,
      balanceSeries(opened.db, id, { from: day, to: day })[0]!.balanceCents,
    ]),
  );
const readSnapshot = () =>
  JSON.stringify([
    opened.sqlite.prepare('SELECT total_changes() AS n').get(),
    ...(
      opened.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as { name: string }[]
    ).map(({ name }) => [
      name,
      opened.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
    ]),
  ]);
function readOnly<T>(read: () => T): T {
  const before = readSnapshot(),
    result = read();
  expect(readSnapshot()).toBe(before);
  return result;
}
function fixture(
  options: {
    payable?: number;
    debitDate?: string;
    issueDate?: string;
    purchases?: [number, string][];
  } = {},
) {
  const payable = options.payable ?? 10000,
    debitDate = options.debitDate ?? '2026-10-10';
  for (const [id, type, openingBalanceCents] of [
    [FUND, 'checking', 50000],
    [CARD, 'credit_card', 0],
  ] as const)
    accounts.create(
      opened.db,
      {
        id,
        name: id === FUND ? 'Synthetic funding' : 'Synthetic card',
        type,
        role: 'budget',
        onBudget: true,
        openingDate: '2026-09-01',
        openingBalanceCents,
      },
      ctx,
    );
  createEntity(opened.db, categoryGroup, { id: GROUP, name: 'Synthetic expenses' }, ctx);
  // A real fixed category makes the unrelated variable-spending estimate zero.
  categories.create(
    opened.db,
    { id: EXPENSE, groupId: GROUP, name: 'Synthetic fixed expense', kind: 'fixed', class: 'need' },
    ctx,
  );
  const purchaseFacts: [number, string][] = options.purchases ?? [
    [-10000, '2026-09-20'],
    [-3000, '2026-10-05'],
  ];
  const purchases = purchaseFacts.map(([amountCents, date]) =>
    createBooking(
      opened.db,
      {
        accountId: CARD,
        date,
        amountCents,
        status: 'confirmed',
        splits: [{ categoryId: EXPENSE, amountCents }],
      },
      ctx,
    ),
  );
  const sha256 = 'a'.repeat(64),
    issueDate = options.issueDate ?? '2026-10-01';
  const staged = stageStatementIntake(
    opened.db,
    {
      accountId: CARD,
      sha256,
      sizeBytes: 50,
      filename: 'synthetic.pdf',
      proposal: parseStatementText(
        'Rechnungsnummer SYNTHETIC-727\nAbrechnungsbetrag 100,00 EUR',
        sha256,
      ),
    },
    ctx,
  ).intake;
  const intake = mutateStatementIntake(
    opened.db,
    staged.id,
    staged,
    'review',
    {
      facts: {
        reference: 'SYNTHETIC-727',
        issueDate,
        periodFrom: null,
        periodTo: null,
        payableCents: payable,
        currency: 'EUR',
        debitDate,
        accountHint: null,
      },
    },
    ctx,
  ).intake;
  const source = { intakeId: intake.id, revision: intake.revision, sha256, accountId: CARD };
  let revision: string | undefined;
  const configure = (enabled = true) =>
    (revision ??= action({
      operation: 'configure',
      key: 'synthetic-727-projection-config',
      cardAccountId: CARD,
      fundingAccountId: FUND,
      enabled,
      expectedRevision: null,
    }).configRevision!);
  const accept = (legacy?: { paymentId: string; dueDate: string }) => {
    const configRevision = configure();
    const accepted = action({
      operation: 'confirm',
      key: 'synthetic-727-projection-accept',
      source,
      configRevision,
      ...(legacy ? { legacy } : {}),
    });
    return {
      source,
      configRevision,
      settlementId: accepted.settlementId!,
      expectedRevision: accepted.settlementRevision!,
    };
  };
  const bonus = (treatment: 'gross_then_credit' | 'already_net') => {
    const purchase = getBooking(opened.db, purchases[0]!)!,
      split = purchase.splits[0]!;
    const evidence: StatementBonusEvidence = {
      origin: 'owner',
      bonusCents: 125,
      creditDate: '2026-10-02',
      treatment,
      existingCreditsReviewed: true,
      feesAdjustmentsReviewed: true,
      selectedOriginals: [
        {
          bookingId: purchase.id,
          bookingRevision: history(opened.db, 'booking', purchase.id)[0]!.id,
          splitId: split.id,
          splitRevision: history(opened.db, 'booking_split', split.id)[0]!.id,
          accountId: CARD,
          currency: 'EUR',
          bookingAmountCents: purchase.amountCents,
          splitAmountCents: split.amountCents,
          categoryId: EXPENSE,
        },
      ],
      allocations: [{ categoryId: EXPENSE, amountCents: 125 }],
    };
    const configRevision = configure(),
      accepted = action({
        operation: 'confirm_bonus',
        key: 'synthetic-727-projection-bonus',
        source,
        configRevision,
        evidence,
      });
    return {
      source,
      configRevision,
      bonusId: accepted.bonusId!,
      expectedRevision: accepted.bonusRevision!,
      selectedOriginals: evidence.selectedOriginals.map(
        ({ bookingId, bookingRevision, splitId, splitRevision }) => ({
          bookingId,
          bookingRevision,
          splitId,
          splitRevision,
        }),
      ),
    };
  };
  return { source, configure, accept, bonus };
}
const legs = (asOf: string, universe: string[], included: string[] = []) =>
  statementForecastLegs(opened.db, asOf, '2027-10-31', new Set(universe), new Set(included));
const household = (day: string) =>
  forecastInputs(loadFacts(opened.db, day), day, { byAccount: nativeBalances(day) });
const point = (day: string, target: string) =>
  liquidityReportView(opened.db, day, { horizon: '90d', levers: [] }).report!.points.find(
    (p) => p.day === target,
  )!;
// The existing preview keeps one EUR bucket even when its payment plan is empty.
const zeroAnnualCurrency = () => ({
  currency: 'EUR',
  months: Array.from({ length: 12 }, () => ({ baseCents: 0, upperCents: 0 })),
  periodicMonths: Array.from({ length: 12 }, () => ({ baseCents: 0, upperCents: 0 })),
  total: { baseCents: 0, upperCents: 0 },
  periodicTotal: { baseCents: 0, upperCents: 0 },
  average: { baseCents: 0, upperCents: 0 },
  highestMonth: null,
});
const legFacts = (rows: ReturnType<typeof statementForecastLegs>) =>
  rows.map((r) => ({
    accountId: r.accountId,
    cents: r.cents,
    kind: r.kind,
    bookingId: r.bookingId,
  }));

it('projects the open10000 as exactly two native legs and preserves both/funding/card/empty universes without writes', () => {
  fixture().accept();
  readOnly(() => {
    expect(nativeBalances('2026-10-09')).toEqual({ [FUND]: 50000, [CARD]: -13000 });
    expect(legFacts(legs('2026-10-10', [FUND, CARD]))).toEqual([
      { accountId: FUND, cents: -10000, kind: 'settlement', bookingId: null },
      { accountId: CARD, cents: 10000, kind: 'settlement', bookingId: null },
    ]);
    expect(legs('2026-10-10', [FUND]).map((r) => r.cents)).toEqual([-10000]);
    expect(legs('2026-10-10', [CARD]).map((r) => r.cents)).toEqual([10000]);
    expect(legs('2026-10-10', [])).toEqual([]);
    expect(
      accountPreview(opened.db, FUND, 'EUR', '2026-10-09', 1).points.at(-1)!.balanceCents,
    ).toBe(40000);
    expect(
      accountPreview(opened.db, CARD, 'EUR', '2026-10-09', 1).points.at(-1)!.balanceCents,
    ).toBe(-3000);
    const inputs = household('2026-10-09');
    expect(inputs.startCents).toBe(37000);
    expect(inputs.variableMonthlyCents).toBe(0);
    expect(inputs.items.map((i) => ({ day: i.day, cents: i.cents, kind: i.kind }))).toEqual([
      { day: '2026-10-10', cents: -10000, kind: 'event' },
      { day: '2026-10-10', cents: 10000, kind: 'event' },
    ]);
    expect(point('2026-10-09', '2026-10-10').balanceCents).toBe(37000);
  });
});
it.each(['pending', 'confirmed'] as const)(
  'counts represented%s future legs once and never repeats them after the cash date',
  (status) => {
    const accepted = fixture().accept();
    action({
      operation: 'create_transfer',
      key: 'synthetic-727-projection-transfer',
      ...accepted,
      status,
    });
    const bookings = opened.sqlite
      .prepare('SELECT id,status FROM booking WHERE transfer_id IS NOT NULL ORDER BY id')
      .all() as { id: string; status: string }[];
    expect(bookings).toHaveLength(2);
    expect(bookings.map((b) => b.status)).toEqual([status, status]);
    readOnly(() => {
      expect(
        legs(
          '2026-10-10',
          [FUND, CARD],
          bookings.map((b) => b.id),
        ),
      ).toEqual([]);
      expect(
        legs('2026-10-10', [FUND, CARD])
          .map((r) => r.cents)
          .sort((a, b) => a - b),
      ).toEqual([-10000, 10000]);
      expect(
        accountPreview(opened.db, FUND, 'EUR', '2026-10-09', 1).points.at(-1)!.balanceCents,
      ).toBe(40000);
      expect(
        accountPreview(opened.db, CARD, 'EUR', '2026-10-09', 1).points.at(-1)!.balanceCents,
      ).toBe(-3000);
      expect(
        household('2026-10-09')
          .items.map((i) => i.cents)
          .sort((a, b) => a - b),
      ).toEqual([-10000, 10000]);
      expect(point('2026-10-09', '2026-10-10').balanceCents).toBe(37000);
      // An Oct-start annual window contains the actual represented Oct10 transfer.
      const annual = readPaymentsPreview(opened.db, '2026-09-30');
      expect(annual.from).toBe('2026-10-01');
      expect(annual.statementTransfers).toEqual([
        expect.objectContaining({ date: '2026-10-10', amountCents: 10000, state: 'represented' }),
      ]);
      expect(annual.rows).toEqual([]);
      expect(annual.currencies).toEqual([zeroAnnualCurrency()]);

      expect(nativeBalances('2026-10-10')).toEqual({ [FUND]: 40000, [CARD]: -3000 });
      expect(legs('2026-10-11', [FUND, CARD])).toEqual([]);
      expect(household('2026-10-10').items).toEqual([]);
      expect(
        accountPreview(opened.db, FUND, 'EUR', '2026-10-10', 1).points.at(-1)!.balanceCents,
      ).toBe(40000);
      expect(
        accountPreview(opened.db, CARD, 'EUR', '2026-10-10', 1).points.at(-1)!.balanceCents,
      ).toBe(-3000);
    });
  },
);
it.each(['stored', 'unmaterialized'] as const)(
  'replaces only selected Nov10 legacy identity with%s occurrence storage, retaining the other payment and Dec10',
  (storage) => {
    const f = fixture({ debitDate: '2026-11-10' }),
      asOf = '2026-10-09';
    createEntity(opened.db, payee, { id: PAYEE, name: 'Synthetic settlement counterparty' }, ctx);
    const selected = createExpectedPayment(
      opened.db,
      {
        name: 'Synthetic selected monthly',
        accountId: FUND,
        categoryId: null,
        payeeId: PAYEE,
        kind: 'outflow',
        rhythm: 'monthly',
        dueDay: 10,
        startDate: '2026-11-10',
      },
      { validFrom: '2026-11-10', amountCents: 10000, currency: 'EUR' },
      ctx,
      asOf,
    ).payment;
    const unrelated = createExpectedPayment(
      opened.db,
      {
        name: 'Synthetic unrelated one-off',
        accountId: FUND,
        categoryId: null,
        payeeId: PAYEE,
        kind: 'outflow',
        rhythm: 'monthly',
        dueDay: 10,
        startDate: '2026-11-10',
        endDate: '2026-11-10',
      },
      { validFrom: '2026-11-10', amountCents: 10000, currency: 'EUR' },
      ctx,
      asOf,
    ).payment;
    expect(
      upcoming(opened.db, '2026-11-10', '2026-11-10')
        .map((o) => o.paymentId)
        .sort(),
    ).toEqual([selected.id, unrelated.id].sort());
    const accepted = f.accept({ paymentId: selected.id, dueDate: '2026-11-10' });
    if (storage === 'unmaterialized')
      opened.sqlite
        .prepare('DELETE FROM expected_occurrence WHERE expected_payment_id=? AND due_date=?')
        .run(selected.id, '2026-11-10');
    expect(
      opened.sqlite
        .prepare(
          'SELECT count(*) AS n FROM expected_occurrence WHERE expected_payment_id=? AND due_date=?',
        )
        .get(selected.id, '2026-11-10'),
    ).toEqual({ n: storage === 'stored' ? 1 : 0 });
    const assertConsumers = (state: 'open' | 'represented') =>
      readOnly(() => {
        const planned = scheduled(loadFacts(opened.db, asOf), '2026-11-10', '2026-12-10', asOf);
        expect(planned.map((o) => [o.payment.id, o.dueDate, o.cents]).sort()).toEqual(
          [
            [selected.id, '2026-12-10', -10000],
            [unrelated.id, '2026-11-10', -10000],
          ].sort(),
        );
        expect(
          unbookedAccountOccurrences(opened.db, FUND, asOf, '2026-11-10', '2026-11-10').map(
            (o) => o.paymentId,
          ),
        ).toEqual([unrelated.id]);
        expect(accountPreview(opened.db, FUND, 'EUR', asOf, 32).points.at(-1)).toEqual({
          date: '2026-11-10',
          balanceCents: 30000,
        });
        expect(accountPreview(opened.db, CARD, 'EUR', asOf, 32).points.at(-1)).toEqual({
          date: '2026-11-10',
          balanceCents: -3000,
        });
        expect(point(asOf, '2026-11-10').balanceCents).toBe(27000);
        const preview = readPaymentsPreview(opened.db, asOf);
        expect(preview.from).toBe('2026-11-01');
        expect(preview.to).toBe('2027-10-31');
        expect(preview.currencies.find((c) => c.currency === 'EUR')!.total.baseCents).toBe(120000);
        expect(
          preview.rows.find((r) => r.paymentId === selected.id)!.events.map((e) => e.dueDate),
        ).toEqual([
          '2026-12-10',
          '2027-01-10',
          '2027-02-10',
          '2027-03-10',
          '2027-04-10',
          '2027-05-10',
          '2027-06-10',
          '2027-07-10',
          '2027-08-10',
          '2027-09-10',
          '2027-10-10',
        ]);
        expect(
          preview.rows.find((r) => r.paymentId === unrelated.id)!.events.map((e) => e.dueDate),
        ).toEqual(['2026-11-10']);
        expect(preview.statementTransfers).toEqual([
          expect.objectContaining({
            date: '2026-11-10',
            amountCents: 10000,
            fundingAccountId: FUND,
            cardAccountId: CARD,
            state,
          }),
        ]);
      });
    assertConsumers('open');
    const pair = createTransfer(
      opened.db,
      {
        fromAccountId: FUND,
        toAccountId: CARD,
        date: '2026-11-10',
        amountCents: 10000,
        status: 'pending',
        payeeId: PAYEE,
      },
      ctx,
    );
    const debit = getBooking(opened.db, pair.fromBookingId)!;
    const unrelatedOccurrence = upcoming(opened.db, '2026-11-10', '2026-11-10').find(
      (o) => o.paymentId === unrelated.id,
    )!;
    // The real payee makes this exact debit a matching candidate before ownership excludes it.
    expect(
      candidateFits(unrelatedOccurrence, {
        accountId: debit.accountId,
        payeeId: debit.payeeId,
        payeeContactId: null,
        categoryIds: debit.splits.flatMap((s) => (s.categoryId ? [s.categoryId] : [])),
        incomeTypeIds: debit.splits.flatMap((s) => (s.incomeTypeId ? [s.incomeTypeId] : [])),
      }),
    ).toBe(true);
    expect([debit.date, debit.amountCents, debit.status]).toEqual([
      '2026-11-10',
      -10000,
      'pending',
    ]);
    const beforeLink = [debit, getBooking(opened.db, pair.toBookingId)!];
    action({
      operation: 'link_transfer',
      key: 'synthetic-727-projection-legacy-transfer',
      ...accepted,
      ...pair,
      fromRevision: history(opened.db, 'booking', pair.fromBookingId)[0]!.id,
      toRevision: history(opened.db, 'booking', pair.toBookingId)[0]!.id,
    });
    expect([
      getBooking(opened.db, pair.fromBookingId),
      getBooking(opened.db, pair.toBookingId),
    ]).toEqual(beforeLink);
    assertConsumers('represented');
  },
);
it('preserves full legacy serialization with absent or disabled config and never adds a statementTransfers own field', () => {
  const f = fixture({ debitDate: '2026-11-10' }),
    asOf = '2026-10-09';
  createExpectedPayment(
    opened.db,
    {
      name: 'Synthetic only legacy occurrence',
      accountId: FUND,
      categoryId: EXPENSE,
      kind: 'outflow',
      dueDay: 10,
      startDate: '2026-11-10',
      endDate: '2026-11-10',
    },
    { validFrom: '2026-11-10', amountCents: 10000, currency: 'EUR' },
    ctx,
    asOf,
  );
  const before = readOnly(() => {
    const preview = readPaymentsPreview(opened.db, asOf);
    expect(preview.rows).toHaveLength(1);
    expect(preview.currencies[0]!.total.baseCents).toBe(10000);
    expect(preview.from).toBe('2026-11-01');
    expect(preview.to).toBe('2027-10-31');
    expect(Object.hasOwn(preview, 'statementTransfers')).toBe(false);
    expect(legs('2026-10-10', [FUND, CARD])).toEqual([]);
    return JSON.stringify(preview);
  });
  expect(readOnly(() => JSON.stringify(readPaymentsPreview(opened.db, asOf)))).toBe(before);
  f.configure(false);
  readOnly(() => {
    const disabled = readPaymentsPreview(opened.db, asOf);
    expect(Object.hasOwn(disabled, 'statementTransfers')).toBe(false);
    expect(JSON.stringify(disabled)).toBe(before);
    expect(legs('2026-10-10', [FUND, CARD])).toEqual([]);
  });
});
it.each(['gross_then_credit', 'already_net'] as const)(
  'projects explicit125 correctly for%s and never makes it income, a transfer, investment or a second discount',
  (treatment) => {
    const gross = treatment === 'gross_then_credit',
      asOf = '2026-09-29';
    const f = fixture({
      payable: 7875,
      issueDate: '2026-09-28',
      purchases: [[gross ? -8000 : -7875, '2026-09-20']],
    });
    const bonus = f.bonus(treatment);
    f.accept();
    readOnly(() => {
      expect(legs('2026-09-30', [CARD]).filter((r) => r.kind === 'bonus')).toEqual([]);
      expect(household(asOf).items.filter((i) => i.label === 'Ausgabengutschrift')).toEqual([]);
    });
    if (gross)
      action({
        operation: 'create_bonus',
        key: 'synthetic-727-projection-credit',
        ...bonus,
        status: 'pending',
      });
    readOnly(() => {
      const projected = legs('2026-09-30', [FUND, CARD]);
      expect(
        projected.filter((r) => r.kind === 'bonus').map((r) => [r.day, r.accountId, r.cents]),
      ).toEqual(gross ? [['2026-10-02', CARD, 125]] : []);
      expect(
        projected.filter((r) => r.kind === 'settlement').map((r) => [r.day, r.accountId, r.cents]),
      ).toEqual([
        ['2026-10-10', FUND, -7875],
        ['2026-10-10', CARD, 7875],
      ]);
      const native = accountPreview(opened.db, CARD, 'EUR', asOf, 11);
      expect(native.points.find((p) => p.date === '2026-10-02')!.balanceCents).toBe(-7875);
      expect(native.points.at(-1)!.balanceCents).toBe(0);
      expect(accountPreview(opened.db, FUND, 'EUR', asOf, 11).points.at(-1)!.balanceCents).toBe(
        42125,
      );
      const inputs = household(asOf);
      expect(inputs.startCents).toBe(gross ? 42000 : 42125);
      expect(
        inputs.items
          .filter((i) => i.label === 'Ausgabengutschrift')
          .map((i) => ({ day: i.day, cents: i.cents, kind: i.kind })),
      ).toEqual(gross ? [{ day: '2026-10-02', cents: 125, kind: 'event' }] : []);
      expect(inputs.items.filter((i) => i.kind === 'income')).toEqual([]);
      expect(point(asOf, '2026-10-10').balanceCents).toBe(42125);
      const preview = readPaymentsPreview(opened.db, asOf);
      expect(preview.from).toBe('2026-10-01');
      expect(preview.statementTransfers).toEqual([
        expect.objectContaining({
          date: '2026-10-10',
          amountCents: 7875,
          fundingAccountId: FUND,
          cardAccountId: CARD,
          state: 'open',
        }),
      ]);
      expect(preview.rows).toEqual([]);
      expect(preview.currencies).toEqual([zeroAnnualCurrency()]);
    });
  },
);
