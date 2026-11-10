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
});
