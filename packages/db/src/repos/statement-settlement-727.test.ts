import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  parseStatementText,
  statementBonusEvidenceSchema,
  type SettlementSource,
  type StatementBonusEvidence,
} from '@budget/domain';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { categoryGroup, statementSettlement, statementBonus, INCOME_TYPES } from '../schema';
import { accounts, categories } from './entities';
import { createEntity } from './entities';
import { createBooking, createTransfer, getBooking } from './bookings';
import { balanceSeries } from './ledger-queries';
import { history, undo } from './audit';
import {
  stageStatementIntake,
  mutateStatementIntake,
  getStatementIntake,
} from './statement-intake';
import {
  performStatementAction,
  replayStatementAction,
  statementSettlementState,
} from './statement-settlement';
import { statementSettlementCandidates } from './statement-settlement-read';

let opened: OpenedDatabase;
const ctx = { actor: 'synthetic-727' };
const FUND = '72700000-0000-4000-8000-000000000001',
  CARD = '72700000-0000-4000-8000-000000000002';
const GROUP = '72700000-0000-4000-8000-000000000010',
  EXPENSE = '72700000-0000-4000-8000-000000000011';
beforeEach(() => {
  opened = createTestDatabase();
  accounts.create(
    opened.db,
    {
      id: FUND,
      name: 'Synthetic funding',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-09-01',
      openingBalanceCents: 50000,
    },
    ctx,
  );
  accounts.create(
    opened.db,
    {
      id: CARD,
      name: 'Synthetic card',
      type: 'credit_card',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-09-01',
      openingBalanceCents: 0,
    },
    ctx,
  );
  createEntity(opened.db, categoryGroup, { id: GROUP, name: 'Synthetic costs' }, ctx);
  categories.create(
    opened.db,
    { id: EXPENSE, groupId: GROUP, name: 'Synthetic expense', class: 'need' },
    ctx,
  );
});
afterEach(() => opened.close());
const act = (body: unknown) => performStatementAction(opened.db, body, ctx);
const configure = () =>
  act({
    operation: 'configure',
    key: 'synthetic-727-configuration',
    cardAccountId: CARD,
    fundingAccountId: FUND,
    expectedRevision: null,
    enabled: true,
  }).configRevision!;
function source(
  amount = 10000,
  sha = 'a'.repeat(64),
  reference = 'SYNTHETIC-727',
): SettlementSource {
  const proposal = parseStatementText(
    `Rechnungsnummer ${reference}\nRechnungsdatum 01.10.2026\nAbrechnungsbetrag 100,00 EUR`,
    sha,
  );
  const intake = stageStatementIntake(
    opened.db,
    { accountId: CARD, sha256: sha, sizeBytes: 50, filename: 'synthetic.pdf', proposal },
    ctx,
  ).intake;
  const reviewed = mutateStatementIntake(
    opened.db,
    intake.id,
    intake,
    'review',
    {
      facts: {
        reference,
        issueDate: '2026-10-01',
        periodFrom: null,
        periodTo: null,
        payableCents: amount,
        currency: 'EUR',
        debitDate: '2026-10-10',
        accountHint: null,
      },
    },
    ctx,
  ).intake;
  return { intakeId: reviewed.id, accountId: CARD, sha256: sha, revision: reviewed.revision };
}
const expense = (n: number, date = '2026-09-20') =>
  createBooking(
    opened.db,
    {
      accountId: CARD,
      date,
      amountCents: n,
      status: 'confirmed',
      splits: [{ categoryId: EXPENSE, amountCents: n }],
    },
    ctx,
  );
const balances = () =>
  Object.fromEntries(
    [FUND, CARD].map((id) => [
      id,
      balanceSeries(opened.db, id, { from: '2026-10-10', to: '2026-10-10' })[0]!.balanceCents,
    ]),
  );
const snapshot = () =>
  JSON.stringify(
    [
      'account',
      'booking',
      'booking_split',
      'transfer',
      'statement_settlement_config',
      'statement_settlement',
      'statement_bonus',
      'statement_settlement_delivery',
      'audit_log',
    ].map((t) => opened.sqlite.prepare('SELECT * FROM ' + t + ' ORDER BY rowid').all()),
  );
function accepted(amount = 10000) {
  const configRevision = configure(),
    s = source(amount);
  const r = act({
    operation: 'confirm',
    key: 'synthetic-727-confirmation',
    source: s,
    configRevision,
  });
  return {
    configRevision,
    source: s,
    settlementId: r.settlementId!,
    expectedRevision: r.settlementRevision!,
  };
}
function bonusInput(
  purchaseId: string,
  treatment: 'gross_then_credit' | 'already_net' = 'gross_then_credit',
): StatementBonusEvidence {
  const p = getBooking(opened.db, purchaseId)!;
  const split = p.splits[0]!;
  return {
    origin: 'owner',
    bonusCents: 125,
    creditDate: '2026-09-30',
    treatment,
    existingCreditsReviewed: true,
    feesAdjustmentsReviewed: true,
    selectedOriginals: [
      {
        bookingId: p.id,
        bookingRevision: history(opened.db, 'booking', p.id)[0]!.id,
        splitId: split.id,
        splitRevision: history(opened.db, 'booking_split', split.id)[0]!.id,
        accountId: CARD,
        currency: 'EUR',
        bookingAmountCents: p.amountCents,
        splitAmountCents: split.amountCents,
        categoryId: split.categoryId!,
      },
    ],
    allocations: [{ categoryId: EXPENSE, amountCents: 125 }],
  };
}
function createBonus(
  source: SettlementSource,
  configRevision: string,
  evidence: StatementBonusEvidence,
) {
  const ready = act({
    operation: 'confirm_bonus',
    key: 'synthetic-727-bonus-confirm',
    source,
    configRevision,
    evidence,
  });
  const selectedOriginals = evidence.selectedOriginals.map(
    ({ bookingId, bookingRevision, splitId, splitRevision }) => ({
      bookingId,
      bookingRevision,
      splitId,
      splitRevision,
    }),
  );
  const input = {
    operation: 'create_bonus',
    key: 'synthetic-727-bonus-create',
    bonusId: ready.bonusId,
    expectedRevision: ready.bonusRevision,
    source,
    configRevision,
    selectedOriginals,
    status: 'confirmed',
  };
  return { ready, input };
}

it('uses issued10000, preserves newer3000 and conserves combined37000 through whole Undo/Redo', () => {
  expense(-10000);
  const newerId = expense(-3000, '2026-10-05'),
    newer = getBooking(opened.db, newerId),
    newerAudit = history(opened.db, 'booking', newerId);
  const a = accepted();
  expect(balances()).toEqual({ [FUND]: 50000, [CARD]: -13000 });
  const posted = act({
    operation: 'create_transfer',
    key: 'synthetic-727-transfer-create',
    ...a,
    status: 'confirmed',
  });
  expect(balances()).toEqual({ [FUND]: 40000, [CARD]: -3000 });
  expect(getBooking(opened.db, newerId)).toEqual(newer);
  expect(history(opened.db, 'booking', newerId)).toEqual(newerAudit);
  const reverted = undo(opened.db, { groupId: posted.groupId! }, ctx);
  expect(balances()).toEqual({ [FUND]: 50000, [CARD]: -13000 });
  expect(statementSettlementState(opened.db, CARD).settlements[0]!.state).toBe('open');
  undo(opened.db, { groupId: reverted.groupId }, ctx);
  expect(balances()).toEqual({ [FUND]: 40000, [CARD]: -3000 });
});
it('looks up same-key canonical receipts before eligibility and after Undo, with zero writes', () => {
  expense(-10000);
  const a = accepted();
  const input = {
    operation: 'create_transfer',
    key: 'synthetic-727-replay-create',
    ...a,
    status: 'pending',
  };
  const receipt = act(input);
  undo(opened.db, { groupId: receipt.groupId! }, ctx);
  const before = snapshot();
  expect(act(Object.fromEntries(Object.entries(input).reverse()))).toEqual(receipt);
  expect(snapshot()).toBe(before);
  expect(() => act({ ...input, status: 'confirmed' })).toThrow();
  expect(snapshot()).toBe(before);
  expect(replayStatementAction(opened.db, input)).toEqual(receipt);
});
it('acknowledges fresh-key identical confirmation with delivery-only writes and no duplicate obligation', () => {
  const a = accepted();
  const original = opened.db.select().from(statementSettlement).get()!,
    audit = history(opened.db, 'statement_settlement', original.id);
  const receipt = act({
    operation: 'confirm',
    key: 'synthetic-727-confirm-other-key',
    source: a.source,
    configRevision: a.configRevision,
  });
  expect(receipt.groupId).toBeNull();
  expect(receipt.settlementId).toBe(original.id);
  expect(opened.db.select().from(statementSettlement).all()).toEqual([original]);
  expect(history(opened.db, 'statement_settlement', original.id)).toEqual(audit);
  expect(
    opened.sqlite.prepare('SELECT count(*) AS n FROM statement_settlement_delivery').get(),
  ).toEqual({ n: 3 });
});
it('rolls back an observed first leg when the second constraint fails, then reuses the key', () => {
  expense(-10000);
  const a = accepted(),
    before = snapshot();
  let sawFirst = false;
  opened.sqlite.function('observe_statement_first', (count, amount, status) => {
    sawFirst = count === 1 && amount === -10000 && status === 'confirmed';
    return 0;
  });
  opened.sqlite
    .exec(`CREATE TEMP TRIGGER reject_statement_second BEFORE INSERT ON booking WHEN NEW.account_id='${CARD}' AND NEW.amount_cents=10000 BEGIN
    SELECT observe_statement_first((SELECT count(*) FROM booking WHERE account_id='${FUND}' AND amount_cents=-10000),(SELECT amount_cents FROM booking WHERE account_id='${FUND}' AND amount_cents=-10000 LIMIT 1),(SELECT status FROM booking WHERE account_id='${FUND}' AND amount_cents=-10000 LIMIT 1));
    SELECT RAISE(ABORT,'synthetic second-leg constraint'); END;`);
  const input = {
    operation: 'create_transfer',
    key: 'synthetic-727-atomic-transfer',
    ...a,
    status: 'confirmed',
  };
  expect(() => act(input)).toThrow();
  expect(sawFirst).toBe(true);
  expect(snapshot()).toBe(before);
  opened.sqlite.exec('DROP TRIGGER reject_statement_second');
  act(input);
  expect(balances()).toEqual({ [FUND]: 40000, [CARD]: 0 });
});
it.each([0, -125])(
  'keeps nonpositive payable%s nonposting and refuses financial creation',
  (amount) => {
    const a = accepted(amount),
      before = snapshot();
    expect(statementSettlementState(opened.db, CARD).settlements[0]!.state).toBe(
      amount === 0 ? 'zero' : 'credit_manual',
    );
    expect(() =>
      act({ operation: 'create_transfer', key: 'synthetic-727-nonpositive-pay', ...a }),
    ).toThrow();
    expect(snapshot()).toBe(before);
    expect(balances()).toEqual({ [FUND]: 50000, [CARD]: 0 });
  },
);
it('links an exact existing pair without money edits and unlinks without undoing that independent payment', () => {
  expense(-10000);
  const a = accepted();
  const pair = createTransfer(
    opened.db,
    {
      fromAccountId: FUND,
      toAccountId: CARD,
      date: '2026-10-10',
      amountCents: 10000,
      status: 'pending',
    },
    ctx,
  );
  const rows = [getBooking(opened.db, pair.fromBookingId), getBooking(opened.db, pair.toBookingId)];
  const linked = act({
    operation: 'link_transfer',
    key: 'synthetic-727-link-existing',
    ...a,
    ...pair,
    fromRevision: history(opened.db, 'booking', pair.fromBookingId)[0]!.id,
    toRevision: history(opened.db, 'booking', pair.toBookingId)[0]!.id,
  });
  expect([
    getBooking(opened.db, pair.fromBookingId),
    getBooking(opened.db, pair.toBookingId),
  ]).toEqual(rows);
  undo(opened.db, { groupId: linked.groupId! }, ctx);
  expect(balances()).toEqual({ [FUND]: 40000, [CARD]: 0 });
  expect([
    getBooking(opened.db, pair.fromBookingId),
    getBooking(opened.db, pair.toBookingId),
  ]).toEqual(rows);
});
it('preserves gross8000 and creates125 as an expense refund, independently of the7875 settlement and its Undo', () => {
  const purchaseId = expense(-8000),
    purchase = getBooking(opened.db, purchaseId),
    purchaseAudit = history(opened.db, 'booking', purchaseId);
  const a = accepted(7875),
    b = createBonus(a.source, a.configRevision, bonusInput(purchaseId));
  const credit = act(b.input);
  expect(balances()).toEqual({ [FUND]: 50000, [CARD]: -7875 });
  const payment = act({ operation: 'create_transfer', key: 'synthetic-727-independent-pay', ...a });
  expect(balances()).toEqual({ [FUND]: 42125, [CARD]: 0 });
  undo(opened.db, { groupId: payment.groupId! }, ctx);
  expect(balances()).toEqual({ [FUND]: 50000, [CARD]: -7875 });
  expect(statementSettlementState(opened.db, CARD).bonuses[0]!.state).toBe('represented');
  undo(opened.db, { groupId: credit.groupId! }, ctx);
  expect(balances()).toEqual({ [FUND]: 50000, [CARD]: -8000 });
  expect(statementSettlementState(opened.db, CARD).bonuses[0]!.state).toBe('ready');
  expect(getBooking(opened.db, purchaseId)).toEqual(purchase);
  expect(history(opened.db, 'booking', purchaseId)).toEqual(purchaseAudit);
});
it('keeps already-net7875 nonposting and never changes it to7750', () => {
  const purchaseId = expense(-7875),
    a = accepted(7875),
    b = createBonus(a.source, a.configRevision, bonusInput(purchaseId, 'already_net'));
  const before = snapshot();
  expect(statementSettlementState(opened.db, CARD).bonuses[0]!.state).toBe('already_net');
  expect(() => act(b.input)).toThrow();
  expect(snapshot()).toBe(before);
  expect(balances()).toEqual({ [FUND]: 50000, [CARD]: -7875 });
});
it('refuses active original consumption across changed-hash same-reference evidence without residue', () => {
  const purchaseId = expense(-8000),
    a = accepted(7875);
  createBonus(a.source, a.configRevision, bonusInput(purchaseId));
  const replacement = source(7875, 'b'.repeat(64)),
    before = snapshot();
  expect(() =>
    act({
      operation: 'confirm_bonus',
      key: 'synthetic-727-duplicate-evidence',
      source: replacement,
      configRevision: a.configRevision,
      evidence: bonusInput(purchaseId),
    }),
  ).toThrow();
  expect(snapshot()).toBe(before);
});
it('retains the independent bonus source guard after settlement withdrawal', () => {
  const purchaseId = expense(-8000),
    a = accepted(7875);
  createBonus(a.source, a.configRevision, bonusInput(purchaseId));
  act({
    operation: 'withdraw',
    key: 'synthetic-727-settlement-withdraw',
    settlementId: a.settlementId,
    expectedRevision: a.expectedRevision,
  });
  const before = snapshot();
  expect(() =>
    mutateStatementIntake(opened.db, a.source.intakeId, a.source, 'reopen', {}, ctx),
  ).toThrow();
  expect(snapshot()).toBe(before);
});
it('rejects an old settlement revision and partial force Undo without changing financial or delivery rows', () => {
  expense(-10000);
  const a = accepted(),
    posted = act({ operation: 'create_transfer', key: 'synthetic-727-partial-test', ...a });
  const row = opened.db.select().from(statementSettlement).get()!,
    entry = history(opened.db, 'booking', row.fromBookingId!)[0]!;
  const before = snapshot();
  expect(() => undo(opened.db, { auditId: entry.id }, ctx, { force: true })).toThrow();
  expect(snapshot()).toBe(before);
  expect(() =>
    act({
      operation: 'withdraw',
      key: 'synthetic-727-stale-withdraw',
      settlementId: a.settlementId,
      expectedRevision: a.expectedRevision,
    }),
  ).toThrow();
  expect(snapshot()).toBe(before);
  expect(posted.groupId).not.toBeNull();
});
it('rejects NULL representation kind for otherwise complete represented settlement and bonus SQL tuples', () => {
  const purchaseId = expense(-8000),
    a = accepted(7875),
    b = createBonus(a.source, a.configRevision, bonusInput(purchaseId));
  act(b.input);
  act({ operation: 'create_transfer', key: 'synthetic-727-sql-null-kind', ...a });
  const before = snapshot();
  expect(() =>
    opened.sqlite
      .prepare('UPDATE statement_settlement SET representation_kind=NULL WHERE id=?')
      .run(a.settlementId),
  ).toThrow();
  expect(() =>
    opened.sqlite
      .prepare('UPDATE statement_bonus SET representation_kind=NULL WHERE id=?')
      .run(b.ready.bonusId),
  ).toThrow();
  expect(snapshot()).toBe(before);
});
it('refuses an existing bonus credit with duplicateA60 instead of approvedA60B60 despite identical total and split count', () => {
  const other = '72700000-0000-4000-8000-000000000012';
  categories.create(
    opened.db,
    { id: other, groupId: GROUP, name: 'Synthetic second expense', class: 'need' },
    ctx,
  );
  const purchaseA = expense(-8000),
    purchaseB = createBooking(
      opened.db,
      {
        accountId: CARD,
        date: '2026-09-21',
        amountCents: -8000,
        splits: [{ categoryId: other, amountCents: -8000 }],
      },
      ctx,
    );
  const a = accepted(15880),
    first = bonusInput(purchaseA),
    second = bonusInput(purchaseB);
  const evidence: StatementBonusEvidence = {
    ...first,
    bonusCents: 120,
    selectedOriginals: [...first.selectedOriginals, ...second.selectedOriginals],
    allocations: [
      { categoryId: EXPENSE, amountCents: 60 },
      { categoryId: other, amountCents: 60 },
    ],
  };
  const ready = act({
    operation: 'confirm_bonus',
    key: 'synthetic-727-multiset-confirm',
    source: a.source,
    configRevision: a.configRevision,
    evidence,
  });
  const existing = createBooking(
    opened.db,
    {
      accountId: CARD,
      date: '2026-09-30',
      amountCents: 120,
      status: 'confirmed',
      splits: [
        { categoryId: EXPENSE, amountCents: 60, incomeTypeId: INCOME_TYPES.refund.id },
        { categoryId: EXPENSE, amountCents: 60, incomeTypeId: INCOME_TYPES.refund.id },
      ],
    },
    ctx,
  );
  const credit = getBooking(opened.db, existing)!;
  expect(credit.amountCents).toBe(120);
  expect(credit.splits.map((s) => s.categoryId)).toEqual([EXPENSE, EXPENSE]);
  expect(evidence.allocations.map((s) => s.categoryId)).toEqual([EXPENSE, other]);
  const before = snapshot();
  expect(() =>
    act({
      operation: 'link_bonus',
      key: 'synthetic-727-multiset-link',
      bonusId: ready.bonusId,
      expectedRevision: ready.bonusRevision,
      source: a.source,
      configRevision: a.configRevision,
      selectedOriginals: evidence.selectedOriginals.map(
        ({ bookingId, bookingRevision, splitId, splitRevision }) => ({
          bookingId,
          bookingRevision,
          splitId,
          splitRevision,
        }),
      ),
      bookingId: existing,
      bookingRevision: history(opened.db, 'booking', existing)[0]!.id,
      splitRevisions: credit.splits.map((s) => ({
        splitId: s.id,
        revision: history(opened.db, 'booking_split', s.id)[0]!.id,
      })),
    }),
  ).toThrow();
  expect(snapshot()).toBe(before);
});
it.each(['income', 'unrelated'] as const)(
  'refuses bonus allocations to a live%s category absent from selected original expenses',
  (kind) => {
    const unrelated = '72700000-0000-4000-8000-000000000013';
    categories.create(
      opened.db,
      {
        id: unrelated,
        groupId: GROUP,
        name: 'Synthetic unselected category',
        class: kind === 'income' ? null : 'need',
        kind: kind === 'income' ? 'income' : 'variable',
      },
      ctx,
    );
    const purchase = expense(-8000),
      a = accepted(7875);
    const evidence: StatementBonusEvidence = {
      ...bonusInput(purchase),
      allocations: [{ categoryId: unrelated, amountCents: 125 }],
    };
    expect(opened.sqlite.prepare('SELECT kind FROM category WHERE id=?').get(unrelated)).toEqual({
      kind: kind === 'income' ? 'income' : 'variable',
    });
    expect(evidence.selectedOriginals[0]!.categoryId).toBe(EXPENSE);
    expect(evidence.bonusCents).toBe(125);
    const before = snapshot();
    expect(() =>
      act({
        operation: 'confirm_bonus',
        key: 'synthetic-727-bad-allocation-' + kind,
        source: a.source,
        configRevision: a.configRevision,
        evidence,
      }),
    ).toThrow();
    expect(snapshot()).toBe(before);
  },
);

it('rejects a mixed advance8000 and eligible expense1 as original evidence for a125 bonus without writes', () => {
  const advanceCategory = '72700000-0000-4000-8000-000000000012';
  categories.create(
    opened.db,
    {
      id: advanceCategory,
      groupId: GROUP,
      name: 'Synthetic advance',
      kind: 'advance',
      class: null,
    },
    ctx,
  );
  const advanceId = createBooking(
    opened.db,
    {
      accountId: CARD,
      date: '2026-09-20',
      amountCents: -8000,
      status: 'confirmed',
      splits: [{ categoryId: advanceCategory, amountCents: -8000 }],
    },
    ctx,
  );
  const eligibleId = expense(-1),
    a = accepted(8001);
  const advanceEvidence = bonusInput(advanceId),
    eligibleEvidence = bonusInput(eligibleId);
  const evidence: StatementBonusEvidence = {
    ...eligibleEvidence,
    selectedOriginals: [
      ...advanceEvidence.selectedOriginals,
      ...eligibleEvidence.selectedOriginals,
    ],
  };
  expect(balances()).toEqual({ [FUND]: 50000, [CARD]: -8001 });
  expect(
    opened.sqlite.prepare('SELECT kind,class FROM category WHERE id=?').get(advanceCategory),
  ).toEqual({ kind: 'advance', class: null });
  expect(getBooking(opened.db, advanceId)!.splits[0]!.categoryId).toBe(advanceCategory);
  expect(
    evidence.selectedOriginals.map((o) => [o.bookingAmountCents, o.splitAmountCents, o.categoryId]),
  ).toEqual([
    [-8000, -8000, advanceCategory],
    [-1, -1, EXPENSE],
  ]);
  for (const original of evidence.selectedOriginals) {
    expect(original.bookingRevision).toBe(history(opened.db, 'booking', original.bookingId)[0]!.id);
    expect(original.splitRevision).toBe(
      history(opened.db, 'booking_split', original.splitId)[0]!.id,
    );
  }
  expect(evidence.bonusCents).toBe(125);
  expect(evidence.allocations).toEqual([{ categoryId: EXPENSE, amountCents: 125 }]);
  expect(statementBonusEvidenceSchema.parse(evidence)).toEqual(evidence);
  const beforeRead = snapshot();
  const candidates = statementSettlementCandidates(opened.db, {
    cardAccountId: CARD,
    kind: 'original',
    limit: 25,
  });
  expect(
    candidates.items.map((candidate) =>
      candidate.kind === 'original' ? candidate.selection.splitId : null,
    ),
  ).toEqual([eligibleEvidence.selectedOriginals[0]!.splitId]);
  expect(snapshot()).toBe(beforeRead);
  const before = snapshot();
  const beforeChanges = opened.sqlite.prepare('SELECT total_changes() AS n').get();
  expect(() =>
    act({
      operation: 'confirm_bonus',
      key: 'synthetic-727-ineligible-original',
      source: a.source,
      configRevision: a.configRevision,
      evidence,
    }),
  ).toThrow();
  expect(snapshot()).toBe(before);
  expect(opened.sqlite.prepare('SELECT total_changes() AS n').get()).toEqual(beforeChanges);
});

const reassessedFacts = () => ({
  reference: 'SYNTHETIC-727-CORRECTED',
  issueDate: '2026-10-02',
  periodFrom: null,
  periodTo: null,
  payableCents: 7875,
  currency: 'EUR',
  debitDate: '2026-10-11',
  accountHint: null,
});
function representedForSourceReview() {
  const purchaseId = expense(-8000),
    configRevision = configure(),
    s = source(7875),
    evidence = bonusInput(purchaseId);
  const created = createBonus(s, configRevision, evidence),
    posted = act(created.input);
  const old = opened.db.select().from(statementBonus).get()!;
  const input = {
    operation: 'amend_bonus',
    key: 'synthetic-727-source-reassessment',
    bonusId: old.id,
    expectedRevision: history(opened.db, 'statement_bonus', old.id)[0]!.id,
    source: s,
    configRevision,
    evidence,
    sourceReview: { acknowledged: true, facts: reassessedFacts() },
  };
  return { purchaseId, old, input, creditId: posted.bookingId! };
}
const moneyAndItsAudit = () =>
  JSON.stringify([
    ...['booking', 'booking_split', 'transfer'].map((t) =>
      opened.sqlite.prepare('SELECT * FROM ' + t + ' ORDER BY rowid').all(),
    ),
    opened.sqlite
      .prepare(
        "SELECT * FROM audit_log WHERE entity_type IN ('booking','booking_split','transfer') ORDER BY rowid",
      )
      .all(),
  ]);
it('reassesses a represented source only with explicit acknowledgement, preserving the SAME credit and immutable old evidence through Undo and replay', () => {
  const fixture = representedForSourceReview(),
    purchase = getBooking(opened.db, fixture.purchaseId),
    credit = getBooking(opened.db, fixture.creditId);
  expect(purchase!.amountCents).toBe(-8000);
  expect(credit!.amountCents).toBe(125);
  expect(balances()).toEqual({ [FUND]: 50000, [CARD]: -7875 });
  const beforeMoney = moneyAndItsAudit(),
    oldEvidence = fixture.old.evidenceJson,
    oldRevision = fixture.old.sourceRevision;
  const revised = act(fixture.input);
  expect(revised.bonusId).not.toBe(fixture.old.id);
  expect(revised.bookingId).toBe(fixture.creditId);
  const after = statementSettlementState(opened.db, CARD).bonuses;
  expect(after.find((b) => b.id === fixture.old.id)).toMatchObject({
    state: 'superseded',
    evidenceJson: oldEvidence,
    sourceRevision: oldRevision,
  });
  expect(after.find((b) => b.id === revised.bonusId)).toMatchObject({
    state: 'represented',
    supersedesId: fixture.old.id,
    bookingId: fixture.creditId,
    reference: 'SYNTHETIC-727-CORRECTED',
  });
  expect(
    getStatementIntake(opened.db, fixture.input.source.intakeId).reviewed!.fields.debitDate.value,
  ).toBe('2026-10-11');
  expect(moneyAndItsAudit()).toBe(beforeMoney);
  expect(getBooking(opened.db, fixture.purchaseId)).toEqual(purchase);
  expect(getBooking(opened.db, fixture.creditId)).toEqual(credit);
  const beforeOlderUndo = reassessmentSnapshot();
  expect(() => undo(opened.db, { groupId: fixture.old.actionGroupId! }, ctx)).toThrow();
  expect(reassessmentSnapshot()).toBe(beforeOlderUndo);
  const undone = undo(opened.db, { groupId: revised.groupId! }, ctx);
  expect(
    statementSettlementState(opened.db, CARD).bonuses.find((b) => b.id === fixture.old.id)!.state,
  ).toBe('represented');
  expect(
    getStatementIntake(opened.db, fixture.input.source.intakeId).reviewed!.fields.reference.value,
  ).toBe('SYNTHETIC-727');
  expect(moneyAndItsAudit()).toBe(beforeMoney);
  const beforeReplay = snapshot();
  expect(act(fixture.input)).toEqual(revised);
  expect(snapshot()).toBe(beforeReplay);
  undo(opened.db, { groupId: undone.groupId }, ctx);
  expect(
    getStatementIntake(opened.db, fixture.input.source.intakeId).reviewed!.fields.reference.value,
  ).toBe('SYNTHETIC-727-CORRECTED');
  expect(moneyAndItsAudit()).toBe(beforeMoney);
});

const reassessmentSnapshot = () =>
  JSON.stringify([
    snapshot(),
    ...['statement_intake', 'receipt'].map((t) =>
      opened.sqlite.prepare('SELECT * FROM ' + t + ' ORDER BY rowid').all(),
    ),
  ]);
it.each([
  'amount',
  'credit-date',
  'source-sha',
  'source-cas',
  'config-cas',
  'unacknowledged',
  'no-acknowledgement',
] as const)(
  'refuses represented-source reassessment with changed%s and leaves source, evidence, money and delivery unchanged',
  (kind) => {
    const f = representedForSourceReview();
    const input = JSON.parse(JSON.stringify(f.input));
    if (kind === 'amount') {
      input.evidence.bonusCents = 124;
      input.evidence.allocations[0].amountCents = 124;
    }
    if (kind === 'credit-date') input.evidence.creditDate = '2026-10-01';
    if (kind === 'source-sha') input.source.sha256 = 'b'.repeat(64);
    if (kind === 'source-cas') input.source.revision = f.input.expectedRevision;
    if (kind === 'config-cas') input.configRevision = f.input.expectedRevision;
    if (kind === 'unacknowledged') input.sourceReview.acknowledged = false;
    if (kind === 'no-acknowledgement') delete input.sourceReview;
    const before = reassessmentSnapshot();
    expect(() => act(input)).toThrow();
    expect(reassessmentSnapshot()).toBe(before);
  },
);
it('retains an independent accepted settlement guard during represented-bonus source reassessment', () => {
  const f = representedForSourceReview();
  act({
    operation: 'confirm',
    key: 'synthetic-727-independent-source-consumer',
    source: f.input.source,
    configRevision: f.input.configRevision,
  });
  const before = reassessmentSnapshot();
  expect(() => act(f.input)).toThrow();
  expect(reassessmentSnapshot()).toBe(before);
});
it('rolls back a failed source review after reopening and reuses the SAME key without money edits', () => {
  const f = representedForSourceReview(),
    before = reassessmentSnapshot(),
    money = moneyAndItsAudit();
  opened.sqlite.exec(
    "CREATE TRIGGER synthetic_source_review_failure BEFORE UPDATE ON statement_intake WHEN NEW.status='reviewed' BEGIN SELECT RAISE(ABORT,'synthetic review failure'); END",
  );
  expect(() => act(f.input)).toThrow('synthetic review failure');
  expect(reassessmentSnapshot()).toBe(before);
  opened.sqlite.exec('DROP TRIGGER synthetic_source_review_failure');
  expect(act(f.input).bookingId).toBe(f.creditId);
  expect(moneyAndItsAudit()).toBe(money);
});
it.each([false, true])(
  'refuses partial source reassessment Undo even with force%s and preserves its entire documentary group',
  (force) => {
    const f = representedForSourceReview(),
      revised = act(f.input),
      entry = history(opened.db, 'statement_bonus', revised.bonusId!)[0]!;
    expect(entry.groupId).toBe(revised.groupId);
    expect(getBooking(opened.db, f.creditId)!.amountCents).toBe(125);
    const before = reassessmentSnapshot();
    expect(() => undo(opened.db, { auditId: entry.id }, ctx, { force })).toThrow();
    expect(reassessmentSnapshot()).toBe(before);
  },
);
it('refuses changed source account, original monetary tuple and allocation during represented-source reassessment', () => {
  const f = representedForSourceReview(),
    before = reassessmentSnapshot();
  const alternatives = [
    { ...f.input, source: { ...f.input.source, accountId: FUND } },
    {
      ...f.input,
      evidence: {
        ...f.input.evidence,
        selectedOriginals: f.input.evidence.selectedOriginals.map((o) => ({
          ...o,
          bookingAmountCents: -7999,
        })),
      },
    },
    {
      ...f.input,
      evidence: { ...f.input.evidence, allocations: [{ categoryId: GROUP, amountCents: 125 }] },
    },
  ];
  for (const input of alternatives) {
    expect(() => act(input)).toThrow();
    expect(reassessmentSnapshot()).toBe(before);
  }
});
it('uses the successive CURRENT source CAS after reassessment Undo while preserving immutable accepted revisions', () => {
  const f = representedForSourceReview(),
    money = moneyAndItsAudit(),
    first = act(f.input);
  undo(opened.db, { groupId: first.groupId! }, ctx);
  const current = getStatementIntake(opened.db, f.input.source.intakeId);
  expect(current.revision).not.toBe(f.old.sourceRevision);
  const old = statementSettlementState(opened.db, CARD).bonuses.find((b) => b.id === f.old.id)!;
  const repeated = act({
    ...f.input,
    key: 'synthetic-727-current-source-rereview',
    expectedRevision: old.revision,
    source: { ...f.input.source, revision: current.revision },
  });
  expect(repeated.bookingId).toBe(f.creditId);
  expect(
    opened.db
      .select()
      .from(statementBonus)
      .all()
      .find((b) => b.id === f.old.id)!.sourceRevision,
  ).toBe(f.old.sourceRevision);
  expect(moneyAndItsAudit()).toBe(money);
});
