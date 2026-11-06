import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, inboxItem, undo, type OpenedDatabase } from '@budget/db';
import { payslipSourceWarning } from './source-warning';
let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
});
afterEach(() => opened.close());
it('updates a changed source failure in the same warning with native audit and undo', () => {
  const old = 'Gehaltszettel-Abruf fehlgeschlagen (dropbox_list). Der Scan wird erneut versucht.';
  const current =
    'Gehaltszettel-Abruf fehlgeschlagen (dropbox_path). Der Scan wird erneut versucht.';
  payslipSourceWarning(opened.db, old);
  const original = opened.db.select().from(inboxItem).get()!;
  payslipSourceWarning(opened.db, current);
  expect(opened.db.select().from(inboxItem).all()).toMatchObject([
    { id: original.id, detail: current, resolvedAt: null },
  ]);
  const audit = opened.sqlite
    .prepare("SELECT group_id FROM audit_log WHERE entity_id=? AND action='update'")
    .all(original.id) as { group_id: string }[];
  expect(audit).toHaveLength(1);
  payslipSourceWarning(opened.db, current);
  expect(
    opened.sqlite
      .prepare("SELECT count(*) n FROM audit_log WHERE entity_id=? AND action='update'")
      .get(original.id),
  ).toEqual({ n: 1 });
  undo(opened.db, { groupId: audit[0]!.group_id }, { actor: 'test' });
  expect(opened.db.select().from(inboxItem).get()).toMatchObject({
    id: original.id,
    detail: old,
    resolvedAt: null,
  });
  expect(opened.sqlite.prepare('SELECT count(*) n FROM booking').get()).toEqual({ n: 0 });
});
