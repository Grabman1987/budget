import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../client';
import { appSetting, auditLog } from '../schema';
import { changeExplorerViews, explorerViews, EXPLORER_SETTING } from './explorer-views';
import { undo } from './audit';
import { createEntity } from './entities';
import type { ExplorerQuery, ExplorerViewsChange } from '@budget/domain';

const opened = createTestDatabase();
afterAll(() => opened.close());
beforeEach(() => opened.sqlite.exec('DELETE FROM app_setting; DELETE FROM audit_log;'));
const query: ExplorerQuery = {
  dim: 'kategorie',
  cls: 'want',
  cols: 'quartal',
  period: '3J',
  meas: 'summe',
};
const other: ExplorerQuery = {
  dim: 'gruppe',
  cls: 'alle',
  cols: 'monat',
  period: '1J',
  meas: 'avg',
};
const write = (change: ExplorerViewsChange, revision = explorerViews(opened.db).revision) =>
  changeExplorerViews(opened.db, revision, change, { actor: 'synthetic' });
const reverse = (groupId: string) => undo(opened.db, { groupId }, { actor: 'synthetic' });

describe('audited Explorer preferences', () => {
  it('keeps stable identity through rename/edit/delete/undo and rejects stale revisions including undo ABA', () => {
    const first = write({ kind: 'save', view: { name: 'Muster', query } });
    const id = first.views[0]!.id;
    const changed = write({ kind: 'save', id, view: { name: 'Neu', query: other } });
    const undone = reverse(changed.groupId);
    const restored = explorerViews(opened.db);
    expect(restored.views).toEqual([{ id, name: 'Muster', query }]);
    expect(restored.revision).not.toBe(first.revision);
    expect(() =>
      write({ kind: 'save', id, view: { name: 'Veraltet', query: other } }, first.revision),
    ).toThrow(/inzwischen/);
    reverse(undone.groupId);
    expect(explorerViews(opened.db).views).toEqual([{ id, name: 'Neu', query: other }]);
    const deleted = write({ kind: 'delete', id });
    expect(deleted.views).toEqual([]);
    expect(() => write({ kind: 'delete', id }, changed.revision)).toThrow(/inzwischen/);
    reverse(deleted.groupId);
    expect(explorerViews(opened.db).views).toEqual([{ id, name: 'Neu', query: other }]);
    // These preference writes never create financial rows.
    expect(opened.sqlite.prepare('SELECT count(*) AS n FROM booking').get()).toEqual({ n: 0 });
    expect(
      opened.db
        .select()
        .from(auditLog)
        .all()
        .every((e) => e.entityType === 'app_setting'),
    ).toBe(true);
  });

  it('keeps a new revision after undo removes the original setting, so initial-token replay is stale', () => {
    const created = write({ kind: 'save', view: { name: 'Muster', query } });
    const reversed = reverse(created.groupId);
    expect(explorerViews(opened.db)).toMatchObject({ views: [], unavailable: false });
    expect(explorerViews(opened.db).revision).not.toBe('none');
    expect(() => write({ kind: 'save', view: { name: 'Alt', query } }, 'none')).toThrow(
      /inzwischen/,
    );
    reverse(reversed.groupId);
    expect(explorerViews(opened.db).views).toEqual(created.views);
    expect(explorerViews(opened.db).revision).not.toBe(created.revision);
    expect(() => write({ kind: 'delete', id: created.views[0]!.id }, created.revision)).toThrow(
      /inzwischen/,
    );
  });

  it('preserves conflicting local/server versions and acknowledges replay even after delete and import undo', () => {
    const server = write({ kind: 'save', view: { name: 'Sicht', query } });
    const batch = {
      kind: 'import' as const,
      views: [
        { name: 'SICHT', query: other },
        { name: 'Extra', query },
      ],
    };
    const promoted = write(batch, server.revision);
    expect(promoted.views.map((v) => ({ name: v.name, query: v.query }))).toEqual([
      { name: 'Sicht', query },
      { name: 'SICHT (lokal 1)', query: other },
      { name: 'Extra', query },
    ]);
    const ids = promoted.views.map((v) => v.id);
    expect(new Set(ids).size).toBe(3);
    expect(write(batch, server.revision)).toMatchObject({ changed: false, views: promoted.views });
    const removed = write({ kind: 'delete', id: ids[1]! });
    expect(write(batch, server.revision).views.map((v) => v.id)).toEqual([ids[0], ids[2]]);
    reverse(removed.groupId);
    reverse(promoted.groupId);
    expect(explorerViews(opened.db).views).toEqual(server.views);
    // The current setting no longer contains its receipt; append-only audit evidence still does.
    expect(write(batch, server.revision)).toMatchObject({ changed: false, views: server.views });
  });

  it('bounds current receipts while older audit acknowledgments still prevent resurrection', () => {
    const first = { kind: 'import' as const, views: [{ name: 'First', query }] };
    const imported = write(first);
    for (let index = 1; index <= 21; index++) {
      const next = write({ kind: 'import', views: [{ name: `Import ${index}`, query }] });
      write({ kind: 'delete', id: next.views.find((v) => v.name === `Import ${index}`)!.id });
    }
    const stored = JSON.parse(opened.db.select().from(appSetting).all()[0]!.value);
    expect(stored.imports).toHaveLength(20);
    write({ kind: 'delete', id: imported.views[0]!.id });
    expect(write(first, 'none')).toMatchObject({ changed: false, views: [] });
  });

  it('rejects the entire over-capacity batch without evicting a view or recording an acknowledgment', () => {
    for (let i = 0; i < 19; i++) write({ kind: 'save', view: { name: `Sicht ${i}`, query } });
    const before = explorerViews(opened.db);
    const auditCount = opened.db.select().from(auditLog).all().length;
    const batch = {
      kind: 'import' as const,
      views: [
        { name: 'Lokal A', query },
        { name: 'Lokal B', query },
      ],
    };
    expect(() => write(batch)).toThrow(/20 Ansichten/);
    expect(explorerViews(opened.db)).toEqual(before);
    expect(opened.db.select().from(auditLog).all()).toHaveLength(auditCount);
    write({ kind: 'delete', id: before.views[0]!.id });
    expect(write(batch).views).toHaveLength(20);
    expect(() => write({ kind: 'save', view: { name: '21', query } })).toThrow(/20 Ansichten/);
    expect(explorerViews(opened.db).views).toHaveLength(20);
  });

  it('does not broaden future/corrupt data, overwrite it, or acknowledge a batch against it', () => {
    const value = JSON.stringify({
      schemaVersion: 99,
      views: [{ query: { accountId: 'unsupported' } }],
    });
    createEntity(opened.db, appSetting, { id: EXPLORER_SETTING, value }, { actor: 'synthetic' });
    expect(explorerViews(opened.db)).toMatchObject({ unavailable: true, views: [] });
    expect(() => write({ kind: 'import', views: [{ name: 'Muster', query }] })).toThrow(
      /nicht verfügbar/,
    );
    expect(opened.db.select().from(appSetting).all()[0]!.value).toBe(value);
  });
});
