import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../client';
import { appSetting, auditLog } from '../schema';
import { createEntity } from './entities';
import { undo } from './audit';
import { saveProfile } from './profile';
import { changeFreedomGoal, freedomGoal, FREEDOM_GOAL_SETTING } from './freedom-goal';
import type { FreedomGoalChange } from '@budget/domain';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../client';

const opened = createTestDatabase();
const today = '2026-10-19';
const ctx = { actor: 'synthetic' };
afterAll(() => opened.close());
beforeEach(() => opened.sqlite.exec('DELETE FROM app_setting; DELETE FROM audit_log;'));
const read = () => freedomGoal(opened.db, today);
const write = (change: FreedomGoalChange, revision = read().revision) =>
  changeFreedomGoal(opened.db, revision, change, ctx, today);
const reverse = (groupId: string) => undo(opened.db, { groupId }, ctx);
const snapshot = () => ({
  settings: opened.sqlite.prepare('SELECT * FROM app_setting ORDER BY id').all(),
  audit: opened.sqlite.prepare('SELECT * FROM audit_log ORDER BY rowid').all(),
});

describe('private audited personal goal (#617)', () => {
  it('keeps canonical year across reads, no-op, clear and actual undo/redo, and refuses stale equal-value ABA', () => {
    const absent = read();
    expect(absent).toMatchObject({
      goalYear: null,
      revision: 'none',
      unavailable: false,
      ageAvailable: false,
    });
    const created = write({ kind: 'year', year: 2050 });
    expect(read()).toMatchObject({ goalYear: 2050, revision: created.revision });
    const beforeNoop = snapshot();
    expect(write({ kind: 'year', year: 2050 }).changed).toBe(false);
    expect(snapshot()).toEqual(beforeNoop);
    const changed = write({ kind: 'year', year: 2051 });
    const reversed = reverse(changed.groupId);
    expect(read().goalYear).toBe(2050);
    expect(read().revision).not.toBe(created.revision);
    expect(() => write({ kind: 'year', year: 2050 }, created.revision)).toThrow(/inzwischen/);
    reverse(reversed.groupId);
    expect(read().goalYear).toBe(2051);
    const cleared = write({ kind: 'clear' });
    expect(read().goalYear).toBeNull();
    reverse(cleared.groupId);
    expect(read().goalYear).toBe(2051);
    expect(opened.sqlite.prepare('SELECT count(*) AS n FROM booking').get()).toEqual({ n: 0 });
  });

  it('fences initial-token replay after actual delete/recreate by undo, even with the same saved year', () => {
    const first = write({ kind: 'year', year: 2050 });
    reverse(first.groupId);
    expect(opened.db.select().from(appSetting).all()).toEqual([]);
    expect(read().revision).not.toBe('none');
    expect(() => write({ kind: 'clear' }, 'none')).toThrow(/inzwischen/);
    const recreated = write({ kind: 'year', year: 2050 });
    expect(recreated.revision).not.toBe(first.revision);
    expect(() => write({ kind: 'year', year: 2050 }, first.revision)).toThrow(/inzwischen/);
  });

  it('uses only complete DB DOB, returns no raw DOB and rejects age writes after profile edit/undo ABA', () => {
    createEntity(opened.db, appSetting, { id: 'profile.birth_month', value: '1980-06' }, ctx);
    expect(read().ageAvailable).toBe(false);
    expect(() => write({ kind: 'age', age: 70, ageRevision: read().ageRevision })).toThrow(
      /Geburtsdatum/,
    );
    saveProfile(opened.db, { birthDate: '1980-06-15' }, ctx, today);
    const before = read();
    const saved = write({ kind: 'age', age: 70, ageRevision: before.ageRevision });
    expect(saved).toMatchObject({ goalYear: 2050, goalAge: 70, ageAvailable: true });
    expect(JSON.stringify(saved)).not.toContain('1980-06-15');
    expect(saved).not.toHaveProperty('birthDate');
    expect(saved).not.toHaveProperty('birthYear');
    const editedGroup = '11111111-1111-4111-8111-111111111111';
    saveProfile(opened.db, { birthDate: '1981-06-15' }, { ...ctx, groupId: editedGroup }, today);
    expect(() => write({ kind: 'age', age: 70, ageRevision: before.ageRevision })).toThrow(
      /Profil/,
    );
    reverse(editedGroup);
    expect(read().goalAge).toBe(70); // The DOB is back to its original value, but its audit head is not.
    expect(read().ageRevision).not.toBe(before.ageRevision);
    expect(() => write({ kind: 'age', age: 70, ageRevision: before.ageRevision })).toThrow(
      /Profil/,
    );
    expect(read().goalYear).toBe(2050);
  });

  it('persists across real SQLite connections/reopen and rejects the other context stale token', () => {
    const directory = mkdtempSync(join(tmpdir(), 'budget-goal-617-'));
    const file = join(directory, 'synthetic.sqlite');
    writeFileSync(file, opened.sqlite.serialize());
    const first = openDatabase(file);
    const second = openDatabase(file);
    try {
      const stale = freedomGoal(second.db, today);
      changeFreedomGoal(first.db, stale.revision, { kind: 'year', year: 2050 }, ctx, today);
      expect(freedomGoal(second.db, today).goalYear).toBe(2050);
      expect(() =>
        changeFreedomGoal(second.db, stale.revision, { kind: 'year', year: 2050 }, ctx, today),
      ).toThrow(/inzwischen/);
    } finally {
      first.close();
      second.close();
    }
    const reopened = openDatabase(file);
    try {
      expect(freedomGoal(reopened.db, today).goalYear).toBe(2050);
    } finally {
      reopened.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('retains future/malformed bytes and rolls back a setting when its audit insertion fails', () => {
    for (const raw of [
      'broken',
      '{"schemaVersion":2,"goalYear":2050}',
      '{"schemaVersion":1,"goalYear":"2050"}',
    ]) {
      opened.sqlite.exec('DELETE FROM app_setting; DELETE FROM audit_log;');
      createEntity(opened.db, appSetting, { id: FREEDOM_GOAL_SETTING, value: raw }, ctx);
      const before = snapshot();
      expect(read().unavailable).toBe(true);
      expect(() => write({ kind: 'clear' })).toThrow(/nicht verfügbar/);
      expect(snapshot()).toEqual(before);
    }
    opened.sqlite.exec('DELETE FROM app_setting; DELETE FROM audit_log;');
    const before = snapshot();
    opened.sqlite.exec(
      "CREATE TRIGGER reject_goal_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END",
    );
    try {
      expect(() => write({ kind: 'year', year: 2050 })).toThrow();
      expect(snapshot()).toEqual(before);
    } finally {
      opened.sqlite.exec('DROP TRIGGER reject_goal_audit');
    }
    expect(write({ kind: 'year', year: 2050 }).changed).toBe(true);
    expect(opened.db.select().from(auditLog).all()).toHaveLength(1);
  });
});
