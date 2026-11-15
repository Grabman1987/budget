import { describe, expect, it } from 'vitest';
import {
  classifyRiskProfile,
  EMPTY_RISK_ANSWERS,
  RISK_PROFILE_VERSION,
  type RiskAnswers,
} from './risk';
import { EMPTY_PROFILE } from './profile';

const full: RiskAnswers = {
  horizon: '3to7',
  liquidity: 'some',
  reserve: '3to6',
  income: 'moderate',
  lossReaction: 'hold',
  acceptableLoss: 'p20',
};
const merged = (patch: Partial<RiskAnswers>): RiskAnswers => ({ ...full, ...patch });

describe('risk profile classification', () => {
  it('is versioned', () => {
    expect(RISK_PROFILE_VERSION).toBe(1);
    expect(classifyRiskProfile(full).version).toBe(1);
  });

  it('classifies tolerance by the sum of its two answers (low 0-2, medium 3-4, high 5-6)', () => {
    const cases: [RiskAnswers['lossReaction'], RiskAnswers['acceptableLoss'], string][] = [
      ['sellAll', 'p10', 'low'], // 0
      ['hold', 'p10', 'low'], // 2
      ['sellPart', 'p20', 'low'], // 2
      ['hold', 'p20', 'medium'], // 3
      ['buyMore', 'p10', 'medium'], // 3
      ['hold', 'p35', 'medium'], // 4
      ['buyMore', 'p20', 'medium'], // 4
      ['buyMore', 'p35', 'high'], // 5
      ['hold', 'p50', 'high'], // 5
      ['buyMore', 'p50', 'high'], // 6
    ];
    for (const [lossReaction, acceptableLoss, level] of cases)
      expect(classifyRiskProfile(merged({ lossReaction, acceptableLoss })).tolerance.level).toBe(
        level,
      );
  });

  it('classifies capacity by the sum of its four answers (low 0-3, medium 4-6, high 7-9)', () => {
    const cases: [Partial<RiskAnswers>, string][] = [
      [{ horizon: '3to7', liquidity: 'some', reserve: 'lt3', income: 'unstable' }, 'low'], // 2
      [{ horizon: '7to15', liquidity: 'some', reserve: 'lt3', income: 'unstable' }, 'low'], // 3
      [{ horizon: '3to7', liquidity: 'some', reserve: '3to6', income: 'unstable' }, 'low'], // 3
      [{ horizon: '3to7', liquidity: 'some', reserve: '3to6', income: 'moderate' }, 'medium'], // 4
      [{ horizon: 'gt15', liquidity: 'low', reserve: '3to6', income: 'unstable' }, 'medium'], // 6
      [{ horizon: 'gt15', liquidity: 'low', reserve: '3to6', income: 'moderate' }, 'high'], // 7
      [{ horizon: 'gt15', liquidity: 'low', reserve: 'gt6', income: 'stable' }, 'high'], // 9
    ];
    for (const [patch, level] of cases)
      expect(classifyRiskProfile(merged(patch)).capacity.level).toBe(level);
  });

  it('caps capacity at low for a short horizon or a high liquidity need', () => {
    const best = { reserve: 'gt6', income: 'stable' } as const;
    // Sum 6 would be medium.
    expect(
      classifyRiskProfile(merged({ ...best, horizon: 'lt3', liquidity: 'low' })).capacity.level,
    ).toBe('low');
    // Sum 7 would be high.
    expect(
      classifyRiskProfile(merged({ ...best, horizon: 'gt15', liquidity: 'high' })).capacity.level,
    ).toBe('low');
  });

  it('keeps a dimension unknown while any of its answers is missing, never medium', () => {
    const none = classifyRiskProfile(EMPTY_RISK_ANSWERS);
    expect(none.tolerance).toEqual({
      level: 'unknown',
      answered: 0,
      total: 2,
      missing: ['lossReaction', 'acceptableLoss'],
    });
    expect(none.capacity.level).toBe('unknown');
    expect(none.capacity.total).toBe(4);
    const partial = classifyRiskProfile(merged({ income: null, acceptableLoss: null }));
    expect(partial.capacity).toMatchObject({ level: 'unknown', answered: 3, missing: ['income'] });
    expect(partial.tolerance).toMatchObject({
      level: 'unknown',
      answered: 1,
      missing: ['acceptableLoss'],
    });
    const onlyTolerance = classifyRiskProfile({
      ...EMPTY_RISK_ANSWERS,
      lossReaction: 'buyMore',
      acceptableLoss: 'p50',
    });
    expect(onlyTolerance.tolerance.level).toBe('high');
    expect(onlyTolerance.capacity.level).toBe('unknown');
    expect(onlyTolerance.toleranceExceedsCapacity).toBe(false);
  });

  it('never derives anything from the other profile fields', () => {
    expect(EMPTY_PROFILE.risk).toEqual(EMPTY_RISK_ANSWERS);
    const aged = { ...EMPTY_PROFILE, birthDate: '1950-01-01', household: 1 };
    expect(classifyRiskProfile(aged.risk)).toEqual(classifyRiskProfile(EMPTY_RISK_ANSWERS));
  });

  it('flags willingness above capacity', () => {
    const risky = classifyRiskProfile(
      merged({ lossReaction: 'buyMore', acceptableLoss: 'p50', horizon: 'lt3' }),
    );
    expect([risky.tolerance.level, risky.capacity.level]).toEqual(['high', 'low']);
    expect(risky.toleranceExceedsCapacity).toBe(true);
    expect(classifyRiskProfile(full).toleranceExceedsCapacity).toBe(false); // medium / medium
  });
});
