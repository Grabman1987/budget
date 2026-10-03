import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultMigrationsFolder, openDatabase } from './client';
import { undo } from './repos/audit';
import { plannedEvent } from './schema';

describe('planned event additive migration', () => {
  it('preserves legacy event identity, defaults, and pre-migration create undo/redo', () => {
    const opened = openDatabase(':memory:');
    try {
      const folder = defaultMigrationsFolder();
      const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8')) as {
        entries: { tag: string }[];
      };
      const migration = journal.entries.findIndex((e) =>
        e.tag.endsWith('_planned_event_recurrence'),
      );
      expect(migration).toBeGreaterThan(0);
      const apply = (tag: string) =>
        opened.sqlite.exec(
          readFileSync(join(folder, `${tag}.sql`), 'utf8').replaceAll(
            '--> statement-breakpoint',
            '',
          ),
        );
      opened.sqlite.pragma('foreign_keys = OFF');
      for (const entry of journal.entries.slice(0, migration)) apply(entry.tag);
      opened.sqlite.pragma('foreign_keys = ON');
      const stamp = '2026-01-01T00:00:00.000Z';
      opened.sqlite
        .prepare(
          'INSERT INTO planned_event (id, name, date, amount_cents, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run('legacy', 'Urlaub', '2026-11-15', -10_001, 1, stamp, stamp);
      const snapshot = {
        id: 'legacy',
        name: 'Urlaub',
        date: '2026-11-15',
        amount_cents: -10_001,
        account_id: null,
        category_id: null,
        enabled: true,
        note: null,
        created_at: stamp,
        updated_at: stamp,
        deleted_at: null,
      };
      opened.sqlite
        .prepare(
          'INSERT INTO audit_log (id, actor, action, entity_type, entity_id, after_json, group_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          'legacy-audit',
          'tester',
          'create',
          'planned_event',
          'legacy',
          JSON.stringify(snapshot),
          'legacy-group',
        );
      apply(journal.entries[migration]!.tag);
      expect(opened.db.select().from(plannedEvent).get()).toMatchObject({
        id: 'legacy',
        amountCents: -10_001,
        recurrence: 'once',
        recurrenceMonths: [],
        recurrenceUntil: null,
      });
      const undone = undo(opened.db, { groupId: 'legacy-group' }, { actor: 'tester' });
      expect(opened.db.select().from(plannedEvent).get()?.deletedAt).toEqual(expect.any(String));
      undo(opened.db, { groupId: undone.groupId }, { actor: 'tester' });
      expect(opened.db.select().from(plannedEvent).get()?.deletedAt).toBeNull();
      expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
    } finally {
      opened.close();
    }
  });
});
