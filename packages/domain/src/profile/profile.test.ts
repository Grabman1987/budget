import { describe, expect, it } from 'vitest';
import {
  ageOn,
  deriveInitials,
  EMPTY_PROFILE,
  isPlausibleBirthDate,
  shellIdentity,
} from './profile';

describe('deriveInitials', () => {
  it('takes first and last word', () => {
    expect(deriveInitials('Anna Muster')).toBe('AM');
    expect(deriveInitials('  anna   maria  muster ')).toBe('AM');
    expect(deriveInitials('Anna')).toBe('A');
    expect(deriveInitials('Österreich Beispiel')).toBe('ÖB');
    expect(deriveInitials('')).toBe('');
  });
});

describe('shellIdentity', () => {
  it('stays generic without a profile', () => {
    expect(shellIdentity(EMPTY_PROFILE)).toEqual({ name: 'Profil', initials: 'NU' });
  });
  it('uses stored initials, else derived ones', () => {
    expect(shellIdentity({ ...EMPTY_PROFILE, name: 'Anna Muster' })).toEqual({
      name: 'Anna Muster',
      initials: 'AM',
    });
    expect(shellIdentity({ ...EMPTY_PROFILE, name: 'Anna', initials: 'AX' })).toEqual({
      name: 'Anna',
      initials: 'AX',
    });
  });
});

describe('birth date', () => {
  it('accepts real past days only', () => {
    expect(isPlausibleBirthDate('1990-02-28', '2026-10-02')).toBe(true);
    expect(isPlausibleBirthDate('1990-02-30', '2026-10-02')).toBe(false);
    expect(isPlausibleBirthDate('2026-10-03', '2026-10-02')).toBe(false);
    expect(isPlausibleBirthDate('1899-12-31', '2026-10-02')).toBe(false);
    expect(isPlausibleBirthDate('', '2026-10-02')).toBe(false);
  });
  it('computes full years', () => {
    expect(ageOn('1990-10-02', '2026-10-02')).toBe(36);
    expect(ageOn('1990-10-03', '2026-10-02')).toBe(35);
    expect(ageOn('', '2026-10-02')).toBeNull();
  });
});
