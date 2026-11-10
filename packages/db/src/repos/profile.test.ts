import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../client';
import { undo } from './audit';
import { getProfile, ProfileValidationError, saveProfile } from './profile';

describe('profile settings', () => {
  it('reads unknown stored risk answers as no answer', () => {
    const opened = createTestDatabase();
    try {
      const ctx = { actor: 't', groupId: 'r' };
      saveProfile(opened.db, { risk: { horizon: '3to7' } }, ctx, '2026-10-02');
      opened.sqlite.exec(
        "UPDATE app_setting SET value = 'bogus' WHERE id = 'profile.risk.horizon'",
      );
      expect(getProfile(opened.db).risk.horizon).toBeNull();
      expect(() =>
        saveProfile(opened.db, { risk: { horizon: 'x' as never } }, { actor: 't' }, '2026-10-02'),
      ).toThrow(ProfileValidationError);
    } finally {
      opened.close();
    }
  });

  it('saves, audits and undoes a whole save as one group', () => {
    const opened = createTestDatabase();
    try {
      const today = '2026-10-02';
      expect(getProfile(opened.db).name).toBe('');
      saveProfile(
        opened.db,
        { name: 'Anna Muster', household: 2 },
        { actor: 't', groupId: 'a' },
        today,
      );
      saveProfile(
        opened.db,
        { name: 'Anna M.', region: 'AT-5' },
        { actor: 't', groupId: 'b' },
        today,
      );
      expect(getProfile(opened.db)).toMatchObject({
        name: 'Anna M.',
        household: 2,
        region: 'AT-5',
      });
      undo(opened.db, { groupId: 'b' }, { actor: 't' });
      expect(getProfile(opened.db)).toMatchObject({ name: 'Anna Muster', region: null });
      undo(opened.db, { groupId: 'a' }, { actor: 't' });
      expect(getProfile(opened.db).name).toBe('');
      expect(() =>
        saveProfile(opened.db, { birthDate: '3000-01-01' }, { actor: 't' }, today),
      ).toThrow(ProfileValidationError);
    } finally {
      opened.close();
    }
  });

  it('stores family facts per field, keeps unknown distinct from zero, validates and undoes', () => {
    const opened = createTestDatabase();
    try {
      const today = '2026-10-02';
      expect(getProfile(opened.db).family).toEqual({
        partnership: null,
        partnerIncome: null,
        dependants: null,
        children: null,
        support: null,
      });
      saveProfile(
        opened.db,
        { family: { partnership: 'partner', dependants: 0 } },
        { actor: 't', groupId: 'f1' },
        today,
      );
      saveProfile(
        opened.db,
        { family: { dependants: 2, children: 1 } },
        { actor: 't', groupId: 'f2' },
        today,
      );
      expect(getProfile(opened.db).family).toEqual({
        partnership: 'partner',
        partnerIncome: null,
        dependants: 2,
        children: 1,
        support: null,
      });
      // Null clears one field and leaves the others alone.
      saveProfile(opened.db, { family: { partnership: null } }, { actor: 't' }, today);
      expect(getProfile(opened.db).family).toMatchObject({ partnership: null, dependants: 2 });
      expect(() =>
        saveProfile(opened.db, { family: { children: 3 } }, { actor: 't' }, today),
      ).toThrow(ProfileValidationError);
      expect(() =>
        saveProfile(opened.db, { family: { dependants: 11 } }, { actor: 't' }, today),
      ).toThrow(ProfileValidationError);
      expect(() =>
        saveProfile(opened.db, { family: { support: 'x' as never } }, { actor: 't' }, today),
      ).toThrow(ProfileValidationError);
      expect(getProfile(opened.db).family).toMatchObject({ dependants: 2, children: 1 });
      undo(opened.db, { groupId: 'f2' }, { actor: 't' });
      expect(getProfile(opened.db).family).toMatchObject({ dependants: 0, children: null });
    } finally {
      opened.close();
    }
  });

  it('reads invalid or contradictory stored family values as not given', () => {
    const opened = createTestDatabase();
    try {
      saveProfile(
        opened.db,
        { family: { support: 'some', dependants: 1, children: 1 } },
        { actor: 't', groupId: 'x' },
        '2026-10-02',
      );
      opened.sqlite.exec(
        "UPDATE app_setting SET value = 'bogus' WHERE id = 'profile.family.support'; UPDATE app_setting SET value = '5' WHERE id = 'profile.family.children'",
      );
      expect(getProfile(opened.db).family).toMatchObject({
        support: null,
        dependants: 1,
        children: null,
      });
    } finally {
      opened.close();
    }
  });
});
