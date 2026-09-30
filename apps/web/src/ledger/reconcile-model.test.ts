import { describe, expect, it } from 'vitest';
import { findingOf } from './reconcile-model';
import type { ReconciliationPreview } from './types';

const preview = (over: Partial<ReconciliationPreview>): ReconciliationPreview => ({
  accountId: 'a1',
  date: '2026-09-30',
  statementBalanceCents: 0,
  bookedBalanceCents: 0,
  pendingCents: 0,
  differenceCents: 0,
  toReconcileCount: 0,
  duplicates: [],
  pendingMatches: [],
  missing: null,
  ...over,
});

describe('findingOf', () => {
  it('is ok without a difference, whatever else is around', () => {
    expect(findingOf(preview({ pendingMatches: [{ bookingIds: ['x'], sumCents: 1 }] }))).toEqual({
      kind: 'ok',
    });
  });
  it('prefers a duplicate that explains the difference', () => {
    const duplicate = {
      removeId: 'b2',
      keepId: 'b1',
      date: '2026-09-10',
      payeeName: 'Markt',
      amountCents: -1000,
      explainsDifference: true,
    };
    const found = findingOf(
      preview({
        differenceCents: 1000,
        duplicates: [duplicate],
        pendingMatches: [{ bookingIds: ['p1'], sumCents: 1000 }],
      }),
    );
    expect(found).toEqual({ kind: 'duplicate', candidate: duplicate });
  });
  it('ignores duplicates that do not explain it and falls to pending, then missing, then other', () => {
    const idle = {
      removeId: 'b2',
      keepId: 'b1',
      date: '2026-09-10',
      payeeName: null,
      amountCents: -5,
      explainsDifference: false,
    };
    expect(
      findingOf(
        preview({
          differenceCents: -500,
          duplicates: [idle],
          pendingMatches: [{ bookingIds: ['p1'], sumCents: -500 }],
        }),
      ),
    ).toEqual({ kind: 'pending', bookingIds: ['p1'], sumCents: -500 });
    expect(
      findingOf(preview({ differenceCents: -500, missing: { kind: 'expense', amountCents: 500 } })),
    ).toEqual({ kind: 'missing', type: 'expense', amountCents: 500 });
    expect(findingOf(preview({ differenceCents: 300 }))).toEqual({
      kind: 'other',
      amountCents: 300,
    });
  });
});
