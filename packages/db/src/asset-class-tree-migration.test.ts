import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { defaultMigrationsFolder, migrateDatabase, openDatabase } from './client';

it('adds nullable parents to the predecessor without changing class, target or exposure data', () => {
  const source = defaultMigrationsFolder();
  const folder = mkdtempSync(join(tmpdir(), 'budget-tree-migration-'));
  const opened = openDatabase(':memory:');
  try {
    const journal = JSON.parse(readFileSync(join(source, 'meta', '_journal.json'), 'utf8'));
    const index = journal.entries.findIndex((e: { tag: string }) =>
      e.tag.endsWith('_asset_class_tree'),
    );
    expect(index).toBeGreaterThan(0);
    const entries = journal.entries.slice(0, index);
    mkdirSync(join(folder, 'meta'));
    writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
    for (const e of entries)
      copyFileSync(join(source, e.tag + '.sql'), join(folder, e.tag + '.sql'));
    migrateDatabase(opened.db, folder);
    opened.sqlite.exec(`INSERT INTO asset_class (id,name,sort_order) VALUES ('a','Klasse A',3);
      INSERT INTO asset_class_target (id,asset_class_id,valid_from,target_share_bp,band_bp) VALUES ('t','a','2026-01-01',10000,500);
      INSERT INTO security (id,name,kind,asset_class_id) VALUES ('s','Produkt A','etf','a');
      INSERT INTO security_exposure_version (id,security_id,valid_from,complete,source) VALUES ('v','s','2026-01-01',1,'synthetic');
      INSERT INTO security_asset_exposure (id,version_id,security_id,asset_class_id,weight_bp,valid_from,source) VALUES ('e','v','s','a',10000,'2026-01-01','synthetic');`);
    const targets = opened.sqlite.prepare('SELECT * FROM asset_class_target').all();
    const exposures = opened.sqlite.prepare('SELECT * FROM security_asset_exposure').all();
    migrateDatabase(opened.db);
    migrateDatabase(opened.db);
    expect(
      opened.sqlite.prepare('SELECT id,name,sort_order,parent_id,is_group FROM asset_class').all(),
    ).toEqual([{ id: 'a', name: 'Klasse A', sort_order: 3, parent_id: null, is_group: 0 }]);
    expect(opened.sqlite.prepare('SELECT * FROM asset_class_target').all()).toEqual(targets);
    expect(opened.sqlite.prepare('SELECT * FROM security_asset_exposure').all()).toEqual(exposures);
    expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(opened.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  } finally {
    opened.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
