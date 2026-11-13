import { expect, it } from 'vitest';
import { createTestDatabase } from '../client';
import { contact } from '../schema';
import { undo } from './audit';
import { commitContactMerge, previewContactMerge } from './contact-merge';
import { createEntity } from './entities';
import { listWageComponentMappings, saveWageComponentMapping } from './payslip-wages';

// Synthetic employers and wage types only.
const options = { secret: 'synthetic-test-secret' };

it('#1082-10 a contact merge moves the source employer mappings; the target wins a conflict', () => {
  const opened = createTestDatabase();
  try {
    const ctx = { actor: 'test' };
    createEntity(opened.db, contact, { id: 'src', name: 'Alter Arbeitgeber' }, ctx);
    createEntity(opened.db, contact, { id: 'tgt', name: 'Neuer Arbeitgeber' }, ctx);
    const map = (employer: string, code: string, component: 'base' | 'variable') =>
      saveWageComponentMapping(
        opened.db,
        { employerContactId: employer, wageCode: code, label: null, component },
        ctx,
      ).id;
    const moved = map('src', '105', 'base');
    const dropped = map('src', '129', 'base');
    const kept = map('tgt', '129', 'variable');
    const preview = previewContactMerge(opened.db, 'src', 'tgt', options);
    expect(preview.wageMappings).toEqual({ moves: 1, keptTarget: 1 });
    const groupId = 'synthetic-merge';
    commitContactMerge(
      opened.db,
      'src',
      'tgt',
      preview.token!,
      { actor: 'owner', groupId },
      options,
    );
    expect(
      listWageComponentMappings(opened.db).map((m) => [
        m.id,
        m.employerContactId,
        m.wageCode,
        m.component,
        m.mappingKey,
      ]),
    ).toEqual(
      [
        [moved, 'tgt', '105', 'base', 'tgt|105|'],
        [kept, 'tgt', '129', 'variable', 'tgt|129|'],
      ].sort((a, b) => String(a[4]).localeCompare(String(b[4]))),
    );
    expect(listWageComponentMappings(opened.db).some((m) => m.id === dropped)).toBe(false);
    // The whole merge, mappings included, undoes as one.
    undo(opened.db, { groupId }, { actor: 'owner' });
    expect(
      listWageComponentMappings(opened.db)
        .map((m) => [m.id, m.employerContactId])
        .sort(),
    ).toEqual(
      [
        [moved, 'src'],
        [dropped, 'src'],
        [kept, 'tgt'],
      ].sort(),
    );
  } finally {
    opened.close();
  }
});
