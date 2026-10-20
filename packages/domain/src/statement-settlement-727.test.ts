import { describe, expect, it } from 'vitest';
import {
  canonicalStatementAction,
  statementBonusEvidenceSchema,
  statementPayableState,
  statementSettlementActionSchema,
} from './statement-settlement';

const card = '72700000-0000-4000-8000-000000000002',
  funding = '72700000-0000-4000-8000-000000000001';
const rev = '72700000-0000-4000-8000-000000000003';
const source = {
  intakeId: '72700000-0000-4000-8000-000000000004',
  revision: rev,
  accountId: card,
  sha256: 'a'.repeat(64),
};
const configure = {
  operation: 'configure',
  key: 'synthetic-727-domain-key',
  cardAccountId: card,
  fundingAccountId: funding,
  expectedRevision: null,
  enabled: true,
};
const evidence = () => ({
  origin: 'owner',
  bonusCents: 125,
  creditDate: '2026-09-30',
  treatment: 'gross_then_credit',
  existingCreditsReviewed: true,
  feesAdjustmentsReviewed: true,
  selectedOriginals: [
    {
      bookingId: '72700000-0000-4000-8000-000000000005',
      bookingRevision: rev,
      splitId: '72700000-0000-4000-8000-000000000006',
      splitRevision: rev,
      accountId: card,
      currency: 'EUR',
      bookingAmountCents: -8000,
      splitAmountCents: -8000,
      categoryId: '72700000-0000-4000-8000-000000000007',
    },
  ],
  allocations: [{ categoryId: '72700000-0000-4000-8000-000000000007', amountCents: 125 }],
});
describe('explicit statement action wire', () => {
  it.each([
    [null, 'incomplete'],
    [0, 'zero'],
    [-125, 'credit_manual'],
    [10000, 'open'],
  ] as const)('keeps payable %s distinct as %s', (value, state) => {
    expect(statementPayableState(value)).toBe(state);
  });
  it('canonicalizes raw key permutations and explicit default status without losing operation identity', () => {
    const reversed = Object.fromEntries(Object.entries(configure).reverse());
    expect(canonicalStatementAction(reversed)).toBe(canonicalStatementAction(configure));
    const create = {
      operation: 'create_transfer',
      key: 'synthetic-727-domain-create',
      source,
      configRevision: rev,
      settlementId: source.intakeId,
      expectedRevision: rev,
    };
    expect(canonicalStatementAction(create)).toBe(
      canonicalStatementAction({ ...create, status: 'confirmed' }),
    );
    expect(canonicalStatementAction({ ...create, status: 'pending' })).not.toBe(
      canonicalStatementAction(create),
    );
    expect(canonicalStatementAction(create)).not.toBe(canonicalStatementAction(configure));
  });
  it('refuses unknown fields, malformed keys, unsafe cents and caller-supplied replacement money', () => {
    expect(
      statementSettlementActionSchema.safeParse({ ...configure, amountCents: 10000 }).success,
    ).toBe(false);
    expect(statementSettlementActionSchema.safeParse({ ...configure, key: 'short' }).success).toBe(
      false,
    );
    expect(
      statementBonusEvidenceSchema.safeParse({
        ...evidence(),
        bonusCents: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
  });
  it('uses literal owner evidence and exact positive category allocations, never a computed card difference', () => {
    const parsed = statementBonusEvidenceSchema.parse(evidence());
    expect(parsed.bonusCents).toBe(125);
    expect(parsed.selectedOriginals[0]!.splitAmountCents).toBe(-8000);
    expect(parsed.allocations[0]!.amountCents).toBe(125);
    expect(
      statementBonusEvidenceSchema.safeParse({ ...evidence(), origin: 'printed' }).success,
    ).toBe(false);
    expect(
      statementBonusEvidenceSchema.safeParse({
        ...evidence(),
        allocations: [{ ...parsed.allocations[0], amountCents: 124 }],
      }).success,
    ).toBe(false);
    expect(
      statementBonusEvidenceSchema.safeParse({
        ...evidence(),
        bonusCents: 8001,
        allocations: [{ ...parsed.allocations[0], amountCents: 8001 }],
      }).success,
    ).toBe(false);
  });
  it('does not fabricate a credit date and refuses impossible calendars', () => {
    for (const creditDate of [null, '2026-02-30', '2026-09-31', ''])
      expect(statementBonusEvidenceSchema.safeParse({ ...evidence(), creditDate }).success).toBe(
        false,
      );
    expect(
      statementBonusEvidenceSchema.parse({ ...evidence(), treatment: 'already_net' }).treatment,
    ).toBe('already_net');
  });
  it('bounds references and rejects duplicate split/category consumption within an action', () => {
    const e = statementBonusEvidenceSchema.parse(evidence());
    expect(
      statementBonusEvidenceSchema.safeParse({
        ...e,
        selectedOriginals: [e.selectedOriginals[0], e.selectedOriginals[0]],
      }).success,
    ).toBe(false);
    expect(
      statementBonusEvidenceSchema.safeParse({
        ...e,
        selectedOriginals: Array(51).fill(e.selectedOriginals[0]),
      }).success,
    ).toBe(false);
    expect(
      statementBonusEvidenceSchema.safeParse({
        ...e,
        allocations: [e.allocations[0], e.allocations[0]],
      }).success,
    ).toBe(false);
    expect(
      statementSettlementActionSchema.safeParse({
        operation: 'confirm',
        key: 'synthetic-727-confirm',
        source: { ...source, unexpected: 'ignored' },
        configRevision: rev,
      }).success,
    ).toBe(false);
  });
});
it('appends explicit source review only when supplied and preserves legacy amendment wire order', () => {
  const action = {
    operation: 'amend_bonus',
    key: 'synthetic-727-domain-reassessment',
    bonusId: source.intakeId,
    expectedRevision: rev,
    source,
    configRevision: rev,
    evidence: evidence(),
  };
  const parsed = statementSettlementActionSchema.parse(action);
  expect(Object.keys(parsed)).toEqual([
    'operation',
    'key',
    'bonusId',
    'expectedRevision',
    'source',
    'configRevision',
    'evidence',
  ]);
  expect(Object.hasOwn(parsed, 'sourceReview')).toBe(false);
  const sourceReview = {
    acknowledged: true,
    facts: {
      reference: 'SYNTHETIC-CORRECTED',
      issueDate: '2026-10-02',
      periodFrom: null,
      periodTo: null,
      payableCents: 7875,
      currency: 'EUR',
      debitDate: '2026-10-11',
      accountHint: null,
    },
  };
  expect(Object.keys(statementSettlementActionSchema.parse({ ...action, sourceReview }))).toEqual([
    ...Object.keys(parsed),
    'sourceReview',
  ]);
  const reversed = Object.fromEntries(Object.entries({ ...action, sourceReview }).reverse());
  expect(canonicalStatementAction(reversed)).toBe(
    canonicalStatementAction({ ...action, sourceReview }),
  );
  for (const invalid of [
    { ...sourceReview, acknowledged: false },
    { ...sourceReview, unexpected: true },
    { ...sourceReview, facts: { ...sourceReview.facts, debitDate: '2026-02-30' } },
  ])
    expect(
      statementSettlementActionSchema.safeParse({ ...action, sourceReview: invalid }).success,
    ).toBe(false);
});
