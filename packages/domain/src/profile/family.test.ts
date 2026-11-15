import { describe, expect, it } from 'vitest';
import {
  describeFamilyContext,
  EMPTY_FAMILY,
  FAMILY_SITUATION_VERSION,
  isFamilyConsistent,
  isFamilyCount,
  type FamilySituation,
} from './family';
import { EMPTY_PROFILE } from './profile';

const given = (patch: Partial<FamilySituation>): FamilySituation => ({ ...EMPTY_FAMILY, ...patch });

describe('family situation', () => {
  it('is versioned and empty by default', () => {
    expect(FAMILY_SITUATION_VERSION).toBe(1);
    expect(EMPTY_PROFILE.family).toEqual({
      partnership: null,
      partnerIncome: null,
      dependants: null,
      children: null,
      support: null,
    });
  });

  it('validates counts and consistency with unknown always consistent', () => {
    expect([-1, 0, 10, 11, 1.5, null, '1'].map(isFamilyCount)).toEqual([
      false,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(isFamilyConsistent({ dependants: 2, children: 2 })).toBe(true);
    expect(isFamilyConsistent({ dependants: 1, children: 2 })).toBe(false);
    expect(isFamilyConsistent({ dependants: null, children: 5 })).toBe(true);
    expect(isFamilyConsistent({ dependants: 0, children: null })).toBe(true);
  });

  it('keeps everything unknown and assumes nothing when nothing is given', () => {
    expect(describeFamilyContext(EMPTY_FAMILY)).toEqual({
      version: 1,
      dependants: 'unknown',
      support: 'unknown',
      incomeSharing: 'unknown',
      consideration: 'unknown',
      missing: ['partnership', 'dependants', 'support'],
    });
  });

  it('distinguishes explicit none and zero from unknown', () => {
    const none = describeFamilyContext(
      given({ partnership: 'none', dependants: 0, support: 'none' }),
    );
    expect(none).toMatchObject({
      dependants: 'none',
      support: 'none',
      incomeSharing: 'notApplicable',
      consideration: 'nothing',
      missing: [],
    });
    // Same facts but support unknown: not "nothing".
    expect(describeFamilyContext(given({ partnership: 'none', dependants: 0 }))).toMatchObject({
      consideration: 'unknown',
      missing: ['support'],
    });
  });

  it('needs the partner income only with a partner', () => {
    const base = { dependants: 0, support: 'none' } as const;
    expect(describeFamilyContext(given({ ...base, partnership: 'partner' }))).toMatchObject({
      incomeSharing: 'unknown',
      consideration: 'unknown',
      missing: ['partnerIncome'],
    });
    expect(
      describeFamilyContext(given({ ...base, partnership: 'partner', partnerIncome: 'full' })),
    ).toMatchObject({ incomeSharing: 'shared', consideration: 'nothing' });
    expect(
      describeFamilyContext(given({ ...base, partnership: 'partner', partnerIncome: 'partial' })),
    ).toMatchObject({ incomeSharing: 'shared', consideration: 'nothing' });
    // A stale partner income without a partner is ignored.
    expect(
      describeFamilyContext(given({ ...base, partnership: 'none', partnerIncome: 'none' })),
    ).toMatchObject({ incomeSharing: 'notApplicable', consideration: 'nothing' });
  });

  it('flags a relevant fact for review even while other answers are missing', () => {
    expect(describeFamilyContext(given({ dependants: 1 }))).toMatchObject({
      dependants: 'present',
      consideration: 'review',
    });
    expect(describeFamilyContext(given({ support: 'some' }))).toMatchObject({
      support: 'present',
      consideration: 'review',
    });
    expect(
      describeFamilyContext(given({ partnership: 'partner', partnerIncome: 'none' })),
    ).toMatchObject({ incomeSharing: 'sole', consideration: 'review' });
  });

  it('does not treat a partnership or a zero children count as a burden', () => {
    expect(
      describeFamilyContext(
        given({
          partnership: 'partner',
          partnerIncome: 'full',
          dependants: 0,
          children: 0,
          support: 'none',
        }),
      ).consideration,
    ).toBe('nothing');
  });
});
