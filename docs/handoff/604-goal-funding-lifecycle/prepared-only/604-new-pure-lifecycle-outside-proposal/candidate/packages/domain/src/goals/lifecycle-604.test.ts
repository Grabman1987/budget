import { describe, expect, it } from 'vitest';
import {
  activeGoalAuditEntries,
  goalLifecycle,
  type GoalAuditLink,
  type GoalLifecyclePoint,
} from './lifecycle';

const base = {
  startMonth: '2026-10',
  asOf: '2026-10-31',
  targetCents: 120_000,
  currentAvailableCents: 0,
  manualCompletedOn: null,
  complete: true,
};
const reach: GoalLifecyclePoint = {
  sequence: 10,
  day: '2026-10-05',
  availableCents: 120_000,
  expenses: [],
};
const spend: GoalLifecyclePoint = {
  sequence: 20,
  day: '2026-10-10',
  availableCents: 119_000,
  expenses: [{ bookingId: 'purchase', splitId: 'purchase-split', day: '2026-10-10' }],
};
const reached = {
  state: 'reached', reason: null, reachedOn: '2026-10-05', completedOn: null, evidence: 'proven',
};
const completed = {
  state: 'completed', reason: 'expense', reachedOn: '2026-10-05',
  completedOn: '2026-10-10', evidence: 'proven',
};

// These are already classified, surviving source states. Classification and DB replay are separate gates.
describe('goal lifecycle #604', () => {
  it('requires the literal target, then a later committed real expense', () => {
    expect(goalLifecycle({ ...base, currentAvailableCents: 119_999, points: [] })).toEqual({
      state: 'open', reason: null, reachedOn: null, completedOn: null, evidence: 'proven',
    });
    expect(goalLifecycle({ ...base, currentAvailableCents: 120_000, points: [reach] })).toEqual(reached);
    expect(goalLifecycle({ ...base, currentAvailableCents: 119_000, points: [reach, spend] })).toEqual(completed);
  });

  it('does not invent an expense from an assignment/transfer-only decrease supplied without expenses', () => {
    expect(goalLifecycle({
      ...base,
      points: [reach, { sequence: 20, day: '2026-10-10', availableCents: 0, expenses: [] }],
    })).toEqual(reached);
  });

  it('does not complete from reaching and spending in the same source state', () => {
    expect(goalLifecycle({
      ...base,
      currentAvailableCents: 120_000,
      points: [{ ...reach, expenses: [{ bookingId: 'same-group', splitId: 'same-split', day: '2026-10-05' }] }],
    })).toEqual(reached);
    expect(goalLifecycle({
      ...base,
      currentAvailableCents: 119_000,
      points: [reach, { ...spend, day: '2026-10-05', expenses: [
        { bookingId: 'later-group', splitId: 'later-split', day: '2026-10-05' },
      ] }],
    })).toEqual({ ...completed, completedOn: '2026-10-05' });
  });

  it('selects the earliest eligible financial expense day, not array order or entry day', () => {
    expect(goalLifecycle({
      ...base,
      currentAvailableCents: 117_000,
      points: [reach, { sequence: 20, day: '2026-10-20', availableCents: 117_000, expenses: [
        { bookingId: 'before-reaching', splitId: 'before', day: '2026-10-04' },
        { bookingId: 'later', splitId: 'later', day: '2026-10-12' },
        { bookingId: 'first', splitId: 'first', day: '2026-10-10' },
        { bookingId: 'future', splitId: 'future', day: '2026-11-01' },
      ] }],
    })).toEqual(completed);
  });

  it('respects the start month and as-of boundary without borrowing future evidence', () => {
    const early = { ...reach, sequence: 1, day: '2026-09-30' };
    expect(goalLifecycle({ ...base, points: [early, spend] })).toEqual({
      state: 'open', reason: null, reachedOn: null, completedOn: null, evidence: 'proven',
    });
    expect(goalLifecycle({
      ...base, asOf: '2026-10-09', currentAvailableCents: 120_000, points: [reach, spend],
    })).toEqual(reached);
    expect(goalLifecycle({
      ...base, startMonth: '2026-11', currentAvailableCents: 120_000, points: [reach, spend],
    })).toEqual({ state: 'open', reason: null, reachedOn: null, completedOn: null, evidence: 'proven' });
  });

  it('never claims automatic completion from incomplete chronology, even with plausible points', () => {
    expect(goalLifecycle({ ...base, complete: false, points: [reach, spend] })).toEqual({
      state: 'open', reason: null, reachedOn: null, completedOn: null, evidence: 'unavailable',
    });
    expect(goalLifecycle({
      ...base, complete: false, currentAvailableCents: 120_000, points: [reach, spend],
    })).toEqual({ state: 'reached', reason: null, reachedOn: null, completedOn: null, evidence: 'unavailable' });
  });

  it('validates the entire point chain before returning an earlier apparently valid completion', () => {
    const invalid: readonly [string, GoalLifecyclePoint][] = [
      ['duplicate sequence', { ...spend, sequence: 20 }],
      ['decreasing sequence', { ...spend, sequence: 19 }],
      ['nonfinite sequence', { ...spend, sequence: Number.NaN }],
      ['fractional cents', { ...spend, sequence: 30, availableCents: 0.5 }],
      ['unsafe cents', { ...spend, sequence: 30, availableCents: Number.MAX_SAFE_INTEGER + 1 }],
    ];
    for (const [name, point] of invalid) {
      expect(goalLifecycle({ ...base, points: [reach, spend, point] }), name).toEqual({
        state: 'open', reason: null, reachedOn: null, completedOn: null, evidence: 'unavailable',
      });
    }
  });

  it('supports explicit manual completion without inventing automatic evidence, and its removal', () => {
    expect(goalLifecycle({
      ...base, complete: false, manualCompletedOn: '2026-10-15', points: [],
    })).toEqual({
      state: 'completed', reason: 'manual', reachedOn: null,
      completedOn: '2026-10-15', evidence: 'unavailable',
    });
    for (const manualCompletedOn of [null, '2026-11-01']) {
      expect(goalLifecycle({ ...base, complete: false, manualCompletedOn, points: [] })).toEqual({
        state: 'open', reason: null, reachedOn: null, completedOn: null, evidence: 'unavailable',
      });
    }
  });
});

describe('goal audit ancestry #604', () => {
  const roots: GoalAuditLink[] = [
    { id: 'reach', sequence: 10, undoOfId: null },
    { id: 'expense', sequence: 20, undoOfId: null },
  ];

  it('resolves original identities through Undo, Redo and a second Undo without treating undo rows as roots', () => {
    const undo = { id: 'undo-expense', sequence: 30, undoOfId: 'expense' };
    const redo = { id: 'redo-expense', sequence: 40, undoOfId: 'undo-expense' };
    const secondUndo = { id: 'undo-again', sequence: 50, undoOfId: 'redo-expense' };
    expect(activeGoalAuditEntries(roots)).toEqual(new Set(['reach', 'expense']));
    expect(activeGoalAuditEntries([...roots, undo])).toEqual(new Set(['reach']));
    expect(activeGoalAuditEntries([...roots, undo, redo])).toEqual(new Set(['reach', 'expense']));
    expect(activeGoalAuditEntries([...roots, undo, redo, secondUndo])).toEqual(new Set(['reach']));
    expect(goalLifecycle({ ...base, currentAvailableCents: 120_000, points: [reach] })).toEqual(reached);
    expect(goalLifecycle({ ...base, currentAvailableCents: 119_000, points: [reach, spend] })).toEqual(completed);
    expect(goalLifecycle({ ...base, points: [spend] })).toEqual({
      state: 'open', reason: null, reachedOn: null, completedOn: null, evidence: 'proven',
    });
  });

  it('rejects missing, branched, cyclic, duplicate or nonmonotone ancestry instead of guessing activity', () => {
    const invalid: readonly [string, GoalAuditLink[]][] = [
      ['missing parent', [{ id: 'u', sequence: 30, undoOfId: 'missing' }]],
      ['branch', [...roots, { id: 'u', sequence: 30, undoOfId: 'expense' }, { id: 'v', sequence: 40, undoOfId: 'expense' }]],
      ['cycle', [{ id: 'a', sequence: 1, undoOfId: 'b' }, { id: 'b', sequence: 2, undoOfId: 'a' }]],
      ['duplicate identity', [...roots, { id: 'expense', sequence: 30, undoOfId: null }]],
      ['duplicate sequence', [...roots, { id: 'u', sequence: 20, undoOfId: 'expense' }]],
      ['out of order', [roots[1]!, roots[0]!]],
      ['nonfinite sequence', [{ id: 'a', sequence: Number.NaN, undoOfId: null }]],
      ['unsafe sequence', [{ id: 'a', sequence: Number.MAX_SAFE_INTEGER + 1, undoOfId: null }]],
    ];
    for (const [name, entries] of invalid) expect(activeGoalAuditEntries(entries), name).toBeNull();
    expect(activeGoalAuditEntries([])).toEqual(new Set());
  });
});
