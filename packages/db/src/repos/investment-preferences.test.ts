import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTestDatabase, openDatabase, migrateDatabase } from '../client';
import { investmentPreference } from '../schema';
import { undo } from './audit';
import { investmentPreferences, setInvestmentCostMethod } from './investment-preferences';

describe('persisted investment method', () => {
  it('uses average without a row and audits/undoes switches in both directions', () => {
    const opened = createTestDatabase();
    try {
      expect(investmentPreferences(opened.db)).toEqual({ costMethod: 'average' });
      setInvestmentCostMethod(opened.db, 'fifo', { actor: 'test', groupId: 'first' });
      setInvestmentCostMethod(opened.db, 'average', { actor: 'test', groupId: 'second' });
      undo(opened.db, { groupId: 'second' }, { actor: 'test' });
      expect(investmentPreferences(opened.db).costMethod).toBe('fifo');
      undo(opened.db, { groupId: 'first' }, { actor: 'test' });
      expect(investmentPreferences(opened.db).costMethod).toBe('average');
      expect(() =>
        opened.sqlite
          .prepare("INSERT INTO investment_preference VALUES ('portfolio', 'unknown')")
          .run(),
      ).toThrow();
      expect(opened.db.select().from(investmentPreference).all()).toEqual([]);
    } finally {
      opened.close();
    }
  });

  it('retains the chosen method after closing and reopening SQLite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-method-'));
    const path = join(dir, 'synthetic.sqlite');
    try {
      const first = openDatabase(path);
      try {
        migrateDatabase(first.db);
        setInvestmentCostMethod(first.db, 'fifo', { actor: 'test' });
      } finally {
        first.close();
      }
      const next = openDatabase(path);
      try {
        expect(investmentPreferences(next.db).costMethod).toBe('fifo');
      } finally {
        next.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
